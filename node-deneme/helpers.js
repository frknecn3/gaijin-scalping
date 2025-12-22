function calculateLiquidityScore(stat1d, item) {
  const last2 = stat1d.slice(-2);
  const last2Volume = last2.reduce((s, d) => s + d[2], 0);

  const prev5 = stat1d.slice(-7, -2);
  const prev5Avg = prev5.reduce((s, d) => s + d[2], 0) / Math.max(prev5.length, 1);

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


async function getPairStat(marketName) {
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

export {getPairStat, calculateLiquidityScore}