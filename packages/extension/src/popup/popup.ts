/**
 * Popup da extensão (E5): estado de conexão, ativação do catálogo e pareamento.
 * Não conhece banco nem configuração de comissão.
 */

import { chromeStorage, getToken } from "../lib/storage.ts";

const statusLine = document.querySelector<HTMLSpanElement>(".status-line");
const statusText = document.querySelector<HTMLSpanElement>("#status-text");
const pendingEl = document.querySelector<HTMLElement>("#pending");
const activateBtn = document.querySelector<HTMLButtonElement>("#activate");
const pairingSection = document.querySelector<HTMLElement>("#pairing");
const codeInput = document.querySelector<HTMLInputElement>("#code");
const pairBtn = document.querySelector<HTMLButtonElement>("#pair");
const logoutBtn = document.querySelector<HTMLButtonElement>("#logout");
const envSelect = document.querySelector<HTMLSelectElement>("#env-select");

async function refreshStatus(): Promise<void> {
  const token = await getToken(chromeStorage());
  const data = await chromeStorage().get("bm_affiliate_name");
  const name =
    typeof data.bm_affiliate_name === "string" ? data.bm_affiliate_name : "";
  const pending = (await chrome.runtime.sendMessage({ type: "PENDING" })) as {
    pending?: number;
  };
  const envInfo = (await chrome.runtime.sendMessage({ type: "GET_ENV" })) as {
    baseUrl?: string;
  };

  if (envSelect && envInfo?.baseUrl) {
    envSelect.value = envInfo.baseUrl;
  }
  const isLocal = envInfo?.baseUrl?.includes("localhost") || envInfo?.baseUrl?.includes("127.0.0.1");
  const envBadge = isLocal ? "Local" : "Prod";

  if (token) {
    statusLine?.classList.remove("disconnected");
    statusLine?.classList.add("connected");
    if (statusText)
      statusText.textContent = name
        ? `${name} · ${envBadge}`
        : `conectado · ${envBadge}`;
    if (pairingSection) pairingSection.hidden = true;
    if (logoutBtn) logoutBtn.hidden = false;
  } else {
    statusLine?.classList.add("disconnected");
    statusLine?.classList.remove("connected");
    if (statusText) statusText.textContent = `não conectado (${envBadge})`;
    if (pairingSection) pairingSection.hidden = false;
    if (logoutBtn) logoutBtn.hidden = true;
  }

  if (pendingEl) {
    const n = pending.pending ?? 0;
    pendingEl.hidden = n === 0;
    pendingEl.textContent =
      n > 0 ? `${n} captura${n === 1 ? "" : "s"} aguardando envio` : "";
  }
}

envSelect?.addEventListener("change", async () => {
  if (!envSelect) return;
  await chrome.runtime.sendMessage({
    type: "SET_ENV",
    baseUrl: envSelect.value,
  });
  await refreshStatus();
});

activateBtn?.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/activate-catalog.js"],
    });
  } catch {
    // página não é um catálogo do ML ou não permite injeção
  }
  window.close();
});

pairBtn?.addEventListener("click", async () => {
  const code = (codeInput?.value ?? "").trim().toUpperCase();
  if (!code) return;
  pairBtn.disabled = true;
  try {
    const result = (await chrome.runtime.sendMessage({
      type: "PAIR",
      pairingCode: code,
    })) as {
      ok: boolean;
      affiliateName?: string;
    };
    if (result.ok) {
      if (codeInput) codeInput.value = "";
      await refreshStatus();
    } else if (statusText) {
      statusText.textContent = "código inválido ou expirado";
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

const batchPrepare =
  document.querySelector<HTMLButtonElement>("#batch-prepare");
const batchImport = document.querySelector<HTMLButtonElement>("#batch-import");
const batchResult = document.querySelector<HTMLElement>("#batch-result");
const batchErrors: Record<string, string> = {
  not_paired: "Conecte a extensão ao painel antes de importar.",
  no_waiting_batch:
    "Inicie uma captura com Mercado Livre no painel e aguarde a etapa do navegador.",
  offers_page_required:
    "Abra a página de ofertas do Mercado Livre e conclua o acesso, se solicitado.",
  no_offers:
    "A listagem não tem ofertas completas. Confira se terminou de carregar.",
  continuation_pending:
    "Ofertas salvas. Tente importar novamente para retomar o executor; os produtos não serão duplicados.",
  browser_capture_not_waiting:
    "Este lote venceu ou já foi concluído. Confira o painel.",
  browser_capture_already_completed:
    "O lote já recebeu outra importação. Confira o painel.",
  network:
    "Sem confirmação do servidor. Você pode tentar novamente sem duplicar a importação.",
  invalid_payload:
    "Dados das ofertas recusados pelo servidor. Verifique se a página é a de ofertas.",
  browser_capture_forbidden:
    "Dispositivo ou usuário sem permissão para este lote.",
  browser_capture_failed:
    "Falha ao processar o lote no servidor. Tente novamente.",
  prepare_first:
    "Prepare o lote de ofertas antes de importar.",
};
batchPrepare?.addEventListener("click", async () => {
  batchPrepare.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: "PREPARE_BATCH" });
    if (batchResult)
      batchResult.textContent = result.ok
        ? `${result.count} ofertas prontas${result.ignored ? ` · ${result.ignored} cards incompletos ignorados` : ""}.`
        : (batchErrors[result.error] ??
          "Não foi possível ler a listagem. Abra as ofertas do Mercado Livre.");
    if (batchImport) {
      batchImport.hidden = !result.ok;
      batchImport.textContent = result.retry
        ? "Retomar importação anterior"
        : `Importar ${result.count} ofertas e continuar`;
    }
  } finally {
    batchPrepare.disabled = false;
  }
});
batchImport?.addEventListener("click", async () => {
  batchImport.disabled = true;
  try {
    const result = (await chrome.runtime.sendMessage({
      type: "IMPORT_BATCH",
    })) as {
      ok: boolean;
      importedCount?: number;
      error?: string;
      details?: string;
    };
    if (batchResult) {
      if (result.ok) {
        batchResult.textContent = `${result.importedCount} ofertas salvas. Volte ao painel para acompanhar a triagem.`;
      } else {
        const base =
          batchErrors[result.error ?? ""] ??
          "Não foi possível importar. Confira o painel e tente novamente.";
        batchResult.textContent = result.details
          ? `${base} (${result.details})`
          : base;
      }
    }
    if (result.ok) batchImport.hidden = true;
  } finally {
    batchImport.disabled = false;
  }
});
