import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TOKEN

export const getInvAssets = async () => {
    async function assetAPI(body:any) {
        const res = await fetch("https://market-proxy.gaijin.net/assetAPI", {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(body)
        });
        return res.json();
    }

    const res = await assetAPI({
        action: "GetContextContents",
        token,
        appid: 1067,
        contextid: 1
    })

    let assets = res.result.assets
    assets = assets.flatMap((a:any) => {
        return a.class.map((c:any) => ({
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

  const body = new URLSearchParams({
    action: "cln_get_pair_stat",
    appid: "1067",
    market_name: marketName,
    currencyid: "gjn",
    token: process.env.TOKEN
  });

  const res = await fetch("https://market-proxy.gaijin.net/web", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  const json = await res.json();

  if (!json.response?.success || !json.response["1d"]) {
    console.log("Veri alınamadı.", json)
    return null;
  }

  return json.response["1d"];
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

async function post(body:any) {
  const res = await fetch("https://market-proxy.gaijin.net/web", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body)
  });
  return res.json();
}

async function marketPost(body:any) {
  const res = await fetch("https://market-proxy.gaijin.net/market", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body)
  });
  return res.json();
}

function sellerShouldGet(price:number) {
  const afterFee = price * 0.85;
  return Math.floor(afterFee / 100) * 100;
}

function extractMarketId(marketName:string) {
  const match = marketName.match(/(?:^id|^ugcitem_)(\d+)/);
  return match ? Number(match[1]) : null;
}


const findItemOrder = (id:number, array:any[]) => {
  return array.find((i) => extractMarketId(i.market) == id)
}
export { getPairStat, calculateLiquidityScore, waitForAssetIdByMarketId, post, marketPost, sellerShouldGet, findItemOrder }