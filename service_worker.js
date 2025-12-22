chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg.inject || !sender.tab?.id) return;

  chrome.scripting.executeScript({
    target: { tabId: sender.tab.id },
    world: "MAIN",              // 👈 ASIL OLAY BU
    files: ["page-intercept.js"]
  });
});
