(function inject() {
  const script = document.createElement("script");

  script.textContent = `
    (async () => {
      console.log("[GAIJIN SPREAD] injected into page context");

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

      window.postMessage(
        { type: "GAIJIN_ASSETS", data: json },
        "*"
      );
    })();
  `;

  document.documentElement.appendChild(script);
})();

window.addEventListener("message", e => {
  if (e.data?.type === "GAIJIN_ASSETS") {
    const assets = e.data.data.response.assets;

    const spreads = assets
      .filter(a => a.price && a.buy_price)
      .map(a => {
        const spread = a.price - a.buy_price;
        return {
          name: a.name,
          sell: a.price,
          buy: a.buy_price,
          spread,
          pct: ((spread / a.buy_price) * 100).toFixed(2)
        };
      })
      .sort((a, b) => b.pct - a.pct);

    console.table(spreads.slice(0, 20));
  }
});
