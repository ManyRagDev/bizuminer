"use strict";
(() => {
  // src/lib/storage.ts
  var STORAGE_KEYS = {
    token: "bm_token",
    deviceId: "bm_device_id",
    affiliateName: "bm_affiliate_name",
    activeTabId: "bm_active_tab_id",
    outbox: "bm_outbox",
    apiBaseUrl: "bm_api_base_url"
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
  var envSelect = document.querySelector("#env-select");
  async function refreshStatus() {
    const token = await getToken(chromeStorage());
    const data = await chromeStorage().get("bm_affiliate_name");
    const name = typeof data.bm_affiliate_name === "string" ? data.bm_affiliate_name : "";
    const pending = await chrome.runtime.sendMessage({ type: "PENDING" });
    const envInfo = await chrome.runtime.sendMessage({ type: "GET_ENV" });
    if (envSelect && envInfo?.baseUrl) {
      envSelect.value = envInfo.baseUrl;
    }
    const isLocal = envInfo?.baseUrl?.includes("localhost") || envInfo?.baseUrl?.includes("127.0.0.1");
    const envBadge = isLocal ? "Local" : "Prod";
    if (token) {
      statusLine?.classList.remove("disconnected");
      statusLine?.classList.add("connected");
      if (statusText)
        statusText.textContent = name ? `${name} \xB7 ${envBadge}` : `conectado \xB7 ${envBadge}`;
      if (pairingSection) pairingSection.hidden = true;
      if (logoutBtn) logoutBtn.hidden = false;
    } else {
      statusLine?.classList.add("disconnected");
      statusLine?.classList.remove("connected");
      if (statusText) statusText.textContent = `n\xE3o conectado (${envBadge})`;
      if (pairingSection) pairingSection.hidden = false;
      if (logoutBtn) logoutBtn.hidden = true;
    }
    if (pendingEl) {
      const n = pending.pending ?? 0;
      pendingEl.hidden = n === 0;
      pendingEl.textContent = n > 0 ? `${n} captura${n === 1 ? "" : "s"} aguardando envio` : "";
    }
  }
  envSelect?.addEventListener("change", async () => {
    if (!envSelect) return;
    await chrome.runtime.sendMessage({
      type: "SET_ENV",
      baseUrl: envSelect.value
    });
    await refreshStatus();
  });
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
      const result = await chrome.runtime.sendMessage({
        type: "PAIR",
        pairingCode: code
      });
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
  var batchPrepare = document.querySelector("#batch-prepare");
  var batchImport = document.querySelector("#batch-import");
  var batchResult = document.querySelector("#batch-result");
  var batchErrors = {
    not_paired: "Conecte a extens\xE3o ao painel antes de importar.",
    no_waiting_batch: "Inicie uma captura com Mercado Livre no painel e aguarde a etapa do navegador.",
    offers_page_required: "Abra a p\xE1gina de ofertas do Mercado Livre e conclua o acesso, se solicitado.",
    no_offers: "A listagem n\xE3o tem ofertas completas. Confira se terminou de carregar.",
    continuation_pending: "Ofertas salvas. Tente importar novamente para retomar o executor; os produtos n\xE3o ser\xE3o duplicados.",
    browser_capture_not_waiting: "Este lote venceu ou j\xE1 foi conclu\xEDdo. Confira o painel.",
    browser_capture_already_completed: "O lote j\xE1 recebeu outra importa\xE7\xE3o. Confira o painel.",
    network: "Sem confirma\xE7\xE3o do servidor. Voc\xEA pode tentar novamente sem duplicar a importa\xE7\xE3o.",
    invalid_payload: "Dados das ofertas recusados pelo servidor. Verifique se a p\xE1gina \xE9 a de ofertas.",
    browser_capture_forbidden: "Dispositivo ou usu\xE1rio sem permiss\xE3o para este lote.",
    browser_capture_failed: "Falha ao processar o lote no servidor. Tente novamente.",
    prepare_first: "Prepare o lote de ofertas antes de importar."
  };
  batchPrepare?.addEventListener("click", async () => {
    batchPrepare.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({ type: "PREPARE_BATCH" });
      if (batchResult)
        batchResult.textContent = result.ok ? `${result.count} ofertas prontas${result.ignored ? ` \xB7 ${result.ignored} cards incompletos ignorados` : ""}.` : batchErrors[result.error] ?? "N\xE3o foi poss\xEDvel ler a listagem. Abra as ofertas do Mercado Livre.";
      if (batchImport) {
        batchImport.hidden = !result.ok;
        batchImport.textContent = result.retry ? "Retomar importa\xE7\xE3o anterior" : `Importar ${result.count} ofertas e continuar`;
      }
    } finally {
      batchPrepare.disabled = false;
    }
  });
  batchImport?.addEventListener("click", async () => {
    batchImport.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({
        type: "IMPORT_BATCH"
      });
      if (batchResult) {
        if (result.ok) {
          batchResult.textContent = `${result.importedCount} ofertas salvas. Volte ao painel para acompanhar a triagem.`;
        } else {
          const base = batchErrors[result.error ?? ""] ?? "N\xE3o foi poss\xEDvel importar. Confira o painel e tente novamente.";
          batchResult.textContent = result.details ? `${base} (${result.details})` : base;
        }
      }
      if (result.ok) batchImport.hidden = true;
    } finally {
      batchImport.disabled = false;
    }
  });
})();
