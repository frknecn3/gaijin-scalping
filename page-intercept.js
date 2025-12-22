console.log("[GaijinSpread] MAIN world aktif");


// UI PANEL
const panel = document.createElement("div");
panel.style = `
  position: fixed;
  top: 10px;
  right: 10px;
  width: 460px;
  max-height: 90vh;
  overflow: auto;
  background: #0f1117;
  color: #e6e6e6;
  font-family: monospace;
  font-size: 12px;
  padding: 10px;
  z-index: 999999;
  border-radius: 8px;
`;
panel.innerHTML = "<b>Gaijin Market Spread</b><hr><div id='rows'>Waiting data…</div>";
document.body.appendChild(panel);

const rowsEl = panel.querySelector("#rows");
const priceMap = {};

// FETCH INTERCEPT
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const res = await originalFetch(...args);

  try {
    const url = args[0]?.toString?.() || "";
    if (url.includes("/web")) {
      const clone = res.clone();
      clone.json().then(data => {
        const events = data?.response?.events;
        if (!Array.isArray(events)) return;

        for (const e of events) {
          if (e.event === "deal" && e.price > 0 && e.hashname) {
            if (!priceMap[e.hashname]) priceMap[e.hashname] = [];
            priceMap[e.hashname].push(e.price);
          }
        }

        render();
      });
    }
  } catch {}

  return res;
};

function render() {
  const rows = [];

  for (const item in priceMap) {
    const prices = priceMap[item];
    if (prices.length < 2) continue;

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    rows.push({
      item,
      min,
      max,
      spread: max - min
    });
  }

  rows.sort((a, b) => b.spread - a.spread);
  rowsEl.innerHTML = "";

  if (!rows.length) {
    rowsEl.textContent = "Waiting data…";
    return;
  }

  for (const r of rows.slice(0, 50)) {
    rowsEl.innerHTML += `
      <div style="margin-bottom:6px">
        <b>${r.item}</b><br>
        min: ${r.min} | max: ${r.max} | spread: <b>${r.spread}</b>
      </div>
    `;
  }
}
