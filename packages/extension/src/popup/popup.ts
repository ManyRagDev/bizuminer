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

async function refreshStatus(): Promise<void> {
  const token = await getToken(chromeStorage());
  const data = await chromeStorage().get("bm_affiliate_name");
  const name = typeof data.bm_affiliate_name === "string" ? data.bm_affiliate_name : "";
  const pending = (await chrome.runtime.sendMessage({ type: "PENDING" })) as { pending?: number };

  if (token) {
    statusLine?.classList.remove("disconnected");
    statusLine?.classList.add("connected");
    if (statusText) statusText.textContent = name ? `conectado como ${name}` : "conectado";
    if (pairingSection) pairingSection.hidden = true;
    if (logoutBtn) logoutBtn.hidden = false;
  } else {
    statusLine?.classList.add("disconnected");
    statusLine?.classList.remove("connected");
    if (statusText) statusText.textContent = "não conectado";
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
    const result = (await chrome.runtime.sendMessage({ type: "PAIR", pairingCode: code })) as {
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
