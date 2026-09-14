import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TOKEN

export const getInvAssets = async () => {
    async function assetAPI(body: any, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const res = await fetch("https://market-proxy.gaijin.net/assetAPI", {
                    method: "POST",
                    headers: { "content-type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams(body)
                });
                if (res.status === 429) {
                    await sleep(Math.pow(2, i) * 1000);
                    continue;
                }
                const text = await res.text();
                if (!text || text.trim() === "") {
                    if (i === retries - 1) return null;
                    await sleep(1000);
                    continue;
                }
                return JSON.parse(text);
            } catch (err) {
                if (i === retries - 1) return null;
                await sleep(Math.pow(2, i) * 1000);
            }
        }
        return null;
    }

    const res = await assetAPI({
        action: "GetContextContents",
        token: process.env.TOKEN,
        appid: 1067,
        contextid: 1
    });

    if (!res?.result?.assets || !Array.isArray(res.result.assets)) {
        return [];
    }

    let assets = res.result.assets;
    assets = assets.flatMap((a: any) => {
        return (a.class || []).map((c: any) => ({
            assetId: a.id,
            id: c.value
        }));
    });

    return assets;
}
function sleep(ms:number) {
  return new Promise(res => setTimeout(res, ms));
}

function calculateLiquidityScore(stat1d:any, item:any) {
  const last2 = stat1d.slice(-2);
  const last2Volume = last2.reduce((s:any, d:any) => s + d[2], 0);

  const prev5 = stat1d.slice(-7, -2);
  const prev5Avg = prev5.reduce((s:any, d:any) => s + d[2], 0) / Math.max(prev5.length, 1);

  const momentum = last2Volume / Math.max(prev5Avg, 1);

  const depthScore = Math.log(item.buy_depth + 1);

  const liquidityScore =
    (last2Volume * 5) +        // 🔥 en önemli
    (momentum * 4) +           // trend
    (depthScore * 3) +         // anında satılabilirlik
    (item.profit * 10);        // ama abartma

  return {
    liquidityScore,
    last2Volume,
    momentum
  };
}


async function getPairStat(marketName:string) {

  if(!process.env.TOKEN) return;

  const json = await post({
    action: "cln_get_pair_stat",
    appid: "1067",
    market_name: marketName,
    currencyid: "gjn",
    token: process.env.TOKEN
  });

  if (!json?.response?.success || !json?.response["1d"]) {
    return null;
  }

  return json.response;
}

async function waitForAssetIdByMarketId(normalID:number, timeoutMs = 15000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const inv = await getInvAssets();
    const match = inv.find((x:any) => Number(x.id) === Number(normalID));

    if (match?.assetId) {
      return match.assetId;
    }

    await sleep(700); // kısa polling
  }

  return null;
}

async function post(body:any, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch("https://market-proxy.gaijin.net/web", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body)
      });
      if (res.status === 429) {
        console.warn(`[API] 429 Too Many Requests (post). Retrying in ${Math.pow(2, i)}s...`);
        await sleep(Math.pow(2, i) * 1000);
        continue;
      }
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(Math.pow(2, i) * 1000);
    }
  }
}

async function marketPost(body:any, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch("https://market-proxy.gaijin.net/market", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body)
      });
      if (res.status === 429) {
        console.warn(`[API] 429 Too Many Requests (marketPost). Retrying in ${Math.pow(2, i)}s...`);
        await sleep(Math.pow(2, i) * 1000);
        continue;
      }
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(Math.pow(2, i) * 1000);
    }
  }
}

function sellerShouldGet(price:number) {
  const afterFee = price * 0.85;
  return Math.floor(afterFee / 100) * 100;
}

function extractMarketId(marketName:string) {
  const match = marketName.match(/(?:^id|^ugcitem_)(\d+)/);
  return match ? Number(match[1]) : null;
}


async function getWalletBalance(): Promise<number | null> {
  const token = process.env.TOKEN;
  if (!token) return null;

  try {
    const res = await fetch("https://wallet.gaijin.net/GetBalance?", {
      headers: {
        "accept": "application/json, text/plain, */*",
        "authorization": "BEARER " + token,
        "Referer": "https://trade.gaijin.net/"
      }
    });
    const json = await res.json();
    if (json.status === "OK" && typeof json.balance === "number") {
      return json.balance / 10000; // 76500 -> 7.65 GJN
    }
    return null;
  } catch (err) {
    console.error("[WALLET] Error fetching balance:", err);
    return null;
  }
}

const findItemOrder = (id:number, array:any[]) => {
  return array.find((i) => extractMarketId(i.market) == id)
}
export { getPairStat, calculateLiquidityScore, waitForAssetIdByMarketId, post, marketPost, sellerShouldGet, findItemOrder, getWalletBalance }