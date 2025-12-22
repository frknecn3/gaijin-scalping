chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete" && tab.url?.includes("trade.gaijin.net")) {
    chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: async () => {
        console.log("[GAIJIN SPREAD] running in MAIN world");

        const body = new URLSearchParams({
          action: "market.getAssets",
          appId: "1067",
          sort: "price",
          order: "desc",
          limit: "200"
        });

        const res = await fetch("https://market-proxy.gaijin.net/web", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded"
          },
          body
        });

        const json = await res.json();

        const assets = json.response.assets;

        const spreads = assets
          .filter(a => a.price && a.buy_price)
          .map(a => ({
            name: a.name,
            sell: a.price,
            buy: a.buy_price,
            spread: a.price - a.buy_price,
            pct: ((a.price - a.buy_price) / a.buy_price * 100).toFixed(2)
          }))
          .sort((a, b) => b.pct - a.pct);

        console.table(spreads.slice(0, 20));
      }
    });
  }
});
