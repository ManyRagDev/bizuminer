"use strict";
(() => {
  // src/lib/storage.ts
  var STORAGE_KEYS = {
    token: "bm_token",
    deviceId: "bm_device_id",
    affiliateName: "bm_affiliate_name",
    activeTabId: "bm_active_tab_id",
    outbox: "bm_outbox"
  };
  function chromeStorage() {
    return chrome.storage.local;
  }
  async function getToken(storage) {
    const data = await storage.get(STORAGE_KEYS.token);
    const token = data[STORAGE_KEYS.token];
    return typeof token === "string" && token.length > 0 ? token : null;
  }

  // src/popup/popup.ts
  var statusLine = document.querySelector(".status-line");
  var statusText = document.querySelector("#status-text");
  var pendingEl = document.querySelector("#pending");
  var activateBtn = document.querySelector("#activate");
  var pairingSection = document.querySelector("#pairing");
  var codeInput = document.querySelector("#code");
  var pairBtn = document.querySelector("#pair");
  var logoutBtn = document.querySelector("#logout");
  async function refreshStatus() {
    const token = await getToken(chromeStorage());
    const data = await chromeStorage().get("bm_affiliate_name");
    const name = typeof data.bm_affiliate_name === "string" ? data.bm_affiliate_name : "";
    const pending = await chrome.runtime.sendMessage({ type: "PENDING" });
    if (token) {
      statusLine?.classList.remove("disconnected");
      statusLine?.classList.add("connected");
      if (statusText) statusText.textContent = name ? `conectado como ${name}` : "conectado";
      if (pairingSection) pairingSection.hidden = true;
      if (logoutBtn) logoutBtn.hidden = false;
    } else {
      statusLine?.classList.add("disconnected");
      statusLine?.classList.remove("connected");
      if (statusText) statusText.textContent = "n\xE3o conectado";
      if (pairingSection) pairingSection.hidden = false;
      if (logoutBtn) logoutBtn.hidden = true;
    }
    if (pendingEl) {
      const n = pending.pending ?? 0;
      pendingEl.hidden = n === 0;
      pendingEl.textContent = n > 0 ? `${n} captura${n === 1 ? "" : "s"} aguardando envio` : "";
    }
  }
  activateBtn?.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id == null) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/activate-catalog.js"]
      });
    } catch {
    }
    window.close();
  });
  pairBtn?.addEventListener("click", async () => {
    const code = (codeInput?.value ?? "").trim().toUpperCase();
    if (!code) return;
    pairBtn.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({ type: "PAIR", pairingCode: code });
      if (result.ok) {
        if (codeInput) codeInput.value = "";
        await refreshStatus();
      } else if (statusText) {
        statusText.textContent = "c\xF3digo inv\xE1lido ou expirado";
      }
    } finally {
      pairBtn.disabled = false;
    }
  });
  logoutBtn?.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "LOGOUT" });
    await refreshStatus();
  });
  void refreshStatus();
})();
