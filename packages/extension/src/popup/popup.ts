/** Human confirmation and visible delivery status; no environment switching. */
import { chromeStorage, getToken } from "../lib/storage.ts";
import { formatImportReport } from "../lib/import-report.ts";
import { formatBatchState } from "./batch-view.ts";
declare const __API_BASE__: string;
const EXPECTED_ORIGIN = typeof __API_BASE__ === "string" ? __API_BASE__ : "https://www.bizuminer.com.br";
const statusLine = document.querySelector<HTMLElement>(".status-line");
const statusText = document.querySelector<HTMLElement>("#status-text");
const pendingEl = document.querySelector<HTMLElement>("#pending");
const clearFailed = document.querySelector<HTMLButtonElement>("#clear-failed");
const activateBtn = document.querySelector<HTMLButtonElement>("#activate");
const captureActiveBtn = document.querySelector<HTMLButtonElement>("#capture-active");
const captureActiveStatus = document.querySelector<HTMLElement>("#capture-active-status");
const pairingSection = document.querySelector<HTMLElement>("#pairing");
const codeInput = document.querySelector<HTMLInputElement>("#code");
const pairBtn = document.querySelector<HTMLButtonElement>("#pair");
const logoutBtn = document.querySelector<HTMLButtonElement>("#logout");
const envOrigin = document.querySelector<HTMLOutputElement>("#env-origin");
const batchPrepare = document.querySelector<HTMLButtonElement>("#batch-prepare");
const batchImport = document.querySelector<HTMLButtonElement>("#batch-import");
const batchCancel = document.querySelector<HTMLButtonElement>("#batch-cancel");
const batchRefresh = document.querySelector<HTMLButtonElement>("#batch-refresh");
const batchMetadata = document.querySelector<HTMLElement>("#batch-metadata");
const batchGuidance = document.querySelector<HTMLElement>("#batch-guidance");
const batchResult = document.querySelector<HTMLElement>("#batch-result");
const importReport = document.querySelector<HTMLElement>("#import-report");
const importReportTitle = document.querySelector<HTMLElement>("#import-report-title");
const importReportTime = document.querySelector<HTMLElement>("#import-report-time");
const importReportCounts = document.querySelector<HTMLElement>("#import-report-counts");
const importReportExplanation = document.querySelector<HTMLElement>("#import-report-explanation");
const importReportDetails = document.querySelector<HTMLDetailsElement>("#import-report-details");
const importReportReasons = document.querySelector<HTMLElement>("#import-report-reasons");
const importReportItems = document.querySelector<HTMLElement>("#import-report-items");
const recaptureStore=document.querySelector<HTMLSelectElement>("#recapture-store");
const recapturePace=document.querySelector<HTMLSelectElement>("#recapture-pace");
const recaptureStart=document.querySelector<HTMLButtonElement>("#recapture-start");
const recapturePause=document.querySelector<HTMLButtonElement>("#recapture-pause");
const recaptureResume=document.querySelector<HTMLButtonElement>("#recapture-resume");
const recaptureCancel=document.querySelector<HTMLButtonElement>("#recapture-cancel");
const recaptureStatus=document.querySelector<HTMLElement>("#recapture-status");
const recaptureBudget=document.querySelector<HTMLElement>("#recapture-budget");
const recaptureReport=document.querySelector<HTMLElement>("#recapture-report");
const recaptureAssistOpen=document.querySelector<HTMLButtonElement>("#recapture-assist-open");
const recaptureAssistRead=document.querySelector<HTMLButtonElement>("#recapture-assist-read");
const recaptureAssistLink=document.querySelector<HTMLAnchorElement>("#recapture-assist-link");
let originVerified = false;
let accountConnected = false;
let canRefreshBatch = false;

const errors: Record<string, string> = {
  not_paired: "Conecte este navegador à sua conta antes de importar.",
  session_changed: "A conta ou o destino mudou. Descarte esta leitura e leia a página novamente.",
  invalid_url: "O destino não corresponde a esta versão. Instale a versão correta e conecte novamente.",
  invalid_sender: "Abra o popup oficial da extensão para confirmar esta ação.",
  device_revoked: "O acesso deste navegador foi revogado. Conecte novamente pelo painel.",
  unauthorized: "O acesso expirou ou foi revogado. Conecte novamente pelo painel.",
  forbidden: "A conta não tem permissão para importar estes produtos.",
  account_suspended: "A conta está suspensa. Confira o acesso no painel.",
  capture_expired: "Esta leitura venceu. Descarte-a e leia os produtos novamente.",
  retry_limit: "O limite de tentativas foi atingido. Confira o painel e descarte esta leitura antes de uma nova captura.",
  queue_full: "A fila está cheia. Confira os envios pendentes e descarte os interrompidos antes de continuar.",
  offers_page_required: "Abra uma oferta ou listagem no Mercado Livre, Amazon Brasil ou AliExpress.",
  ml_page_required: "Abra uma oferta ou listagem no Mercado Livre, Amazon Brasil ou AliExpress.",
  no_offers: "Nenhum produto completo foi encontrado. Aguarde a página terminar de carregar.",
  marketplace_server_outdated: "O servidor ainda não aceita esta importação. Confira a atualização do painel.",
  marketplace_capture_unavailable: "A importação desta loja não está habilitada nesta conta.",
  invalid_payload: "O servidor recusou os dados. Descarte esta leitura e confira a página antes de tentar novamente.",
  browser_capture_forbidden: "Este navegador não tem permissão para importar na conta.",
  prepare_first: "Leia os produtos da página antes de confirmar a importação.",
  discard_required: "Esta leitura já pode ter sido recebida. Confira o painel e use Descartar leitura antes de ler a página novamente.",
  invalid_code: "Código inválido ou expirado. Gere outro no painel desta conta.",
  pairing_code_invalid: "Código inválido ou expirado. Gere outro no painel desta conta.",
  exchange_failed: "Não foi possível conectar. Confira o código e o destino mostrado abaixo.",
  network: "Não houve confirmação do servidor. O envio preserva a mesma identificação para evitar duplicação.",
  timeout: "O servidor não confirmou a tempo. O envio preserva a mesma identificação para evitar duplicação.",
  invalid_response: "A resposta do servidor não pôde ser confirmada. Confira o painel.",
  storage_or_network: "Não foi possível concluir a ação. Confira a conexão e abra a extensão novamente.",
  permission_required: "A permissão desta loja não foi concedida. Abra a página desejada e use a leitura manual abaixo.",
  recapture_not_enabled: "A atualização dirigida ainda não está habilitada nesta conta.",
  recapture_pace_invalid: "Escolha um intervalo válido para esta sessão.",
  recapture_account_not_enabled: "A atualização dirigida ainda não está habilitada para esta conta.",
  recapture_daily_budget_exhausted: "O limite diário de atualização foi atingido. Os acompanhamentos continuam pendentes.",
  recapture_watch_capacity_reserved: "A capacidade restante está reservada a acompanhamentos pendentes. Atualize a loja correspondente ou tente novamente depois.",
  recapture_session_budget_exhausted: "O limite desta sessão foi atingido. Os acompanhamentos restantes continuam pendentes.",
  recapture_budget_not_configured: "O orçamento de atualização ainda não foi configurado.",
  recapture_claim_expired: "O prazo desta conferência terminou. Consulte o painel para uma nova tentativa.",
  recapture_target_busy: "Outra sessão está conferindo estes itens. As demais páginas já disponíveis podem avançar; retome depois para conferir o que falta.",
  recapture_plan_updating: "O plano está sendo atualizado. Retome em instantes para conferir se há mais páginas.",
  recapture_plan_changed: "O plano mudou antes da abertura. Consulte a atualização novamente.",
  active_page_not_ready: "Aguarde o carregamento e abra a extensão novamente na página indicada.",
  active_page_mismatch: "Abra a página indicada e use a extensão naquela aba.",
  recapture_retry_wait: "Aguarde antes de tentar novamente; a solicitação anterior permanece registrada.",
  navigation_unknown: "Não foi possível confirmar a abertura da página. Confira a loja antes de retomar.",
  needs_login: "A loja pediu acesso. Faça login no navegador antes de retomar a atualização.",
  blocked: "A loja bloqueou a leitura ou redirecionou a página. Confira o acesso antes de retomar.",
};
const explain = (error?: string) => errors[error ?? ""] ?? "A solicitação foi recusada. Confira o acesso e a versão do painel.";

async function refreshRecaptureStatus() {
  try {
    const state=await chrome.runtime.sendMessage({type:"RECAPTURE_STATUS"}) as {active?:boolean;phase?:string;mode?:string;marketplace?:string;pace?:string;taskUrl?:string;completed?:number;observed?:number;residual?:number;error?:string|null;
      remaining?:{listing:number|null;pdp:number|null;asOf:string};lastReport?:{discovered:number;unavailable:number;reasons:Record<string,number>}};
    if (recaptureStart) recaptureStart.hidden=Boolean(state.active);
    if (recaptureStore) {recaptureStore.disabled=Boolean(state.active);if(state.active && state.marketplace)recaptureStore.value=state.marketplace;}
    if (recapturePace) {recapturePace.disabled=Boolean(state.active);if(state.active && state.pace)recapturePace.value=state.pace;}
    if (recapturePause) recapturePause.hidden=!state.active || state.phase==="paused";
    if (recaptureResume) recaptureResume.hidden=!state.active || state.phase!=="paused";
    if (recaptureCancel) recaptureCancel.hidden=!state.active;
    if (recaptureAssistOpen) recaptureAssistOpen.hidden=state.mode!=="assisted" || state.phase!=="awaiting_open";
    if (recaptureAssistRead) recaptureAssistRead.hidden=state.mode!=="assisted" || state.phase!=="awaiting_page";
    if (recaptureAssistLink) {
      recaptureAssistLink.hidden=state.mode!=="assisted" || state.phase!=="awaiting_page" || !state.taskUrl;
      if(state.taskUrl) recaptureAssistLink.href=state.taskUrl; else recaptureAssistLink.removeAttribute("href");
    }
    if (recaptureStatus && (state.active || state.phase==="completed")) recaptureStatus.textContent=state.error ? explain(state.error)
      : state.phase==="awaiting_open" ? "Modo assistido: abra a página indicada para reservar esta conferência."
      : state.phase==="awaiting_page" ? "Na página indicada, abra a extensão e selecione Ler página aberta."
      : `${state.phase==="paused" ? "Pausada" : state.phase==="completed" ? "Sem mais páginas disponíveis agora" : "Em andamento"}: ${state.completed ?? 0} página(s), ${state.observed ?? 0} alvo(s) conferido(s), ${state.residual ?? 0} pendente(s) nesta sessão.`;
    if(recaptureBudget) {
      recaptureBudget.hidden=!state.remaining;
      if(state.remaining) {
        const label=(value:number|null)=>value===null ? "indisponível ou não configurado" : String(value);
        recaptureBudget.textContent=`Saldo diário da conta na última consulta: ${label(state.remaining.listing)} listagem(ns) e ${label(state.remaining.pdp)} página(s) de produto. Outras sessões podem consumir esse saldo.`;
      } else recaptureBudget.textContent="";
    }
    if (recaptureReport) {
      const report=state.lastReport;
      recaptureReport.hidden=!report;
      if (report) {
        const labels:Record<string,string>={price_conflict:"preço divergente",no_price:"sem preço",not_found_on_listing:"não encontrado na listagem",
          configuration_mismatch:"configuração diferente",needs_login:"login necessário",blocked:"acesso bloqueado",parse_error:"leitura incompleta",
          timeout:"tempo esgotado",superseded_observation:"observação substituída",unreported:"não reportado"};
        const details=Object.entries(report.reasons).filter(([reason])=>labels[reason]).map(([reason,count])=>`${count} ${labels[reason]}`);
        recaptureReport.textContent=`Última página: ${report.discovered} produto(s) novo(s), ${report.unavailable} indisponibilidade(s) confirmada(s)${details.length ? ` · ${details.join(" · ")}` : ""}.`;
      } else recaptureReport.textContent="";
    }
  } catch { if (recaptureStatus) recaptureStatus.textContent="Não foi possível consultar a atualização."; }
}

recaptureStart?.addEventListener("click",async()=>{
  if (!originVerified || !accountConnected || !recaptureStore) return;
  const origins:Record<string,string>={mercadolivre:"https://*.mercadolivre.com.br/*",amazon:"https://*.amazon.com.br/*",aliexpress:"https://*.aliexpress.com/*"};
  const origin=origins[recaptureStore.value]; if (!origin) return;
  recaptureStart.disabled=true;
  try {
    const allowed=await chrome.permissions.request({origins:[origin]});
    const result=await chrome.runtime.sendMessage({type:"RECAPTURE_START",marketplace:recaptureStore.value,assisted:!allowed,pace:recapturePace?.value ?? "normal"});
    if (!result.ok && recaptureStatus) recaptureStatus.textContent=explain(result.error);
    await refreshRecaptureStatus();
  } catch {if (recaptureStatus) recaptureStatus.textContent="Não foi possível iniciar a atualização.";}
  finally {recaptureStart.disabled=false;}
});
for(const [button,type] of [[recaptureAssistOpen,"RECAPTURE_ASSIST_OPEN"],[recaptureAssistRead,"RECAPTURE_ASSIST_READ"]] as const) {
  button?.addEventListener("click",async()=>{
    button.disabled=true;
    try {
      const result=await chrome.runtime.sendMessage({type});
      await refreshRecaptureStatus();
      if(!result.ok && recaptureStatus) recaptureStatus.textContent=explain(result.error);
    } catch {if(recaptureStatus)recaptureStatus.textContent="Não foi possível continuar a conferência.";}
    finally {button.disabled=false;}
  });
}
for (const [button,type] of [[recapturePause,"RECAPTURE_PAUSE"],[recaptureResume,"RECAPTURE_RESUME"],[recaptureCancel,"RECAPTURE_CANCEL"]] as const) {
  button?.addEventListener("click",async()=>{
    button.disabled=true;
    try { const result=await chrome.runtime.sendMessage({type}); if (!result.ok && recaptureStatus) recaptureStatus.textContent=explain(result.error); await refreshRecaptureStatus(); }
    finally {button.disabled=false;}
  });
}
void refreshRecaptureStatus();
setInterval(()=>{void refreshRecaptureStatus();},2_000);
function textList(target: HTMLElement | null, values: string[]): void {
  if (!target) return;
  target.replaceChildren(...values.map(value => {
    const item = document.createElement("li");
    item.textContent = value;
    return item;
  }));
}
function renderImportReport(value: unknown): void {
  const view = formatImportReport(value);
  if (importReport) importReport.hidden = !view;
  if (!view) {
    textList(importReportCounts, []); textList(importReportReasons, []); textList(importReportItems, []);
    if (importReportTitle) importReportTitle.textContent = "Última importação";
    if (importReportTime) importReportTime.textContent = "";
    if (importReportExplanation) importReportExplanation.textContent = "";
    if (importReportDetails) importReportDetails.hidden = true;
    return;
  }
  if (importReportTitle) importReportTitle.textContent = view.heading;
  if (importReportTime) importReportTime.textContent = view.timing.join("\n");
  textList(importReportCounts, view.counts);
  if (importReportExplanation) importReportExplanation.textContent = view.explanation;
  if (importReportDetails) importReportDetails.hidden = view.items.length === 0;
  textList(importReportReasons, view.reasons);
  textList(importReportItems, view.items);
}
function notice(message: string, kind: "normal" | "queued" | "stopped" | "success" = "normal") {
  if (!batchResult) return;
  batchResult.className = `hint${kind === "normal" ? "" : ` batch-${kind}-notice`}`;
  batchResult.textContent = message;
}
function disconnected(message: string) {
  accountConnected = false;
  canRefreshBatch = false;
  renderImportReport(null);
  if (batchRefresh) batchRefresh.hidden = true;
  if (batchMetadata) batchMetadata.hidden = true;
  if (batchGuidance) batchGuidance.hidden = true;
  statusLine?.classList.remove("connected");
  statusLine?.classList.add("disconnected");
  if (statusText) statusText.textContent = message;
}
async function refreshStatus(preserveNotice = false): Promise<void> {
  try {
    // The worker reconciles origin/account before the popup reads session storage.
    const env = await chrome.runtime.sendMessage({ type: "GET_ENV" }) as { baseUrl?: string; allowedBaseUrls?: string[] };
    originVerified = env?.baseUrl === EXPECTED_ORIGIN && env.allowedBaseUrls?.length === 1 && env.allowedBaseUrls[0] === EXPECTED_ORIGIN;
    if (envOrigin) envOrigin.textContent = EXPECTED_ORIGIN;
    if (!originVerified) {
      renderImportReport(null);
      disconnected("Destino incompatível. Atualize a extensão.");
      if (batchPrepare) batchPrepare.disabled = true;
      if (batchImport) batchImport.disabled = true;
      if (captureActiveBtn) captureActiveBtn.disabled = true;
      if (pairBtn) pairBtn.disabled = true;
      return;
    }
    const pending = await chrome.runtime.sendMessage({ type: "PENDING" }) as { pending?: number; failed?: number; errors?: string[] };
    const state = await chrome.runtime.sendMessage({ type: "GET_BATCH_STATE" }) as {
      hasBatch?: boolean; queued?: boolean; count?: number; attempts?: number; stopped?: boolean; lastError?: string;
      lastImport?: unknown; capturedAt?: unknown; preparedVersion?: unknown; sent?: boolean; canReplace?: boolean;
    };
    const token = await getToken(chromeStorage());
    accountConnected = Boolean(token);
    const data = await chromeStorage().get("bm_affiliate_name");
    const name = typeof data.bm_affiliate_name === "string" ? data.bm_affiliate_name : "";
    // Separate from transient notices: success clears the batch, not its scoped receipt.
    renderImportReport(token ? state.lastImport : null);
    statusLine?.classList.toggle("connected", Boolean(token));
    statusLine?.classList.toggle("disconnected", !token);
    if (statusText) statusText.textContent = token ? name || "Conectado à sua conta" : "Conecte este navegador";
    if (pairingSection) pairingSection.hidden = Boolean(token);
    if (logoutBtn) logoutBtn.hidden = !token;
    if (batchPrepare) batchPrepare.disabled = !token;
    if (batchImport) batchImport.disabled = !token;
    if (captureActiveBtn) captureActiveBtn.disabled = !token;
    if (pairBtn) pairBtn.disabled = false;
    const active = pending.pending ?? 0, failed = pending.failed ?? 0;
    if (pendingEl) {
      pendingEl.hidden = active + failed === 0;
      pendingEl.textContent = [active > 0 ? `${active} envio(s) aguardando confirmação.` : "",
        failed > 0 ? `${failed} envio(s) interrompido(s), sem novas tentativas automáticas. ${explain(pending.errors?.[0])}` : ""].filter(Boolean).join(" ");
    }
    if (clearFailed) clearFailed.hidden = failed === 0;
    if (batchCancel) batchCancel.hidden = !state.hasBatch;
    const batchView = formatBatchState(state);
    canRefreshBatch = Boolean(token) && batchView.canReplace;
    if (batchPrepare) batchPrepare.textContent = batchView.prepareLabel;
    if (batchRefresh) { batchRefresh.hidden = !canRefreshBatch; batchRefresh.disabled = !canRefreshBatch; }
    textList(batchMetadata, token ? batchView.metadata : []);
    if (batchMetadata) batchMetadata.hidden = !token || !state.hasBatch;
    if (batchGuidance) {
      batchGuidance.textContent = batchView.guidance;
      batchGuidance.hidden = !token || !state.hasBatch;
    }
    if (batchImport) {
      batchImport.hidden = !state.hasBatch || Boolean(state.stopped);
      batchImport.textContent = state.queued ? "Tentar enviar agora" : `Importar ${state.count ?? ""} produtos para revisão`;
    }
    if (state.hasBatch && state.stopped) {
      notice(`Envio interrompido. ${explain(state.lastError)} Não haverá novas tentativas automáticas.`, "stopped");
    } else if (state.hasBatch && state.queued) {
      notice(`${state.count ?? ""} produtos aguardando confirmação. Haverá tentativas limitadas enquanto esta leitura for válida. ${state.lastError ? explain(state.lastError) : ""}`, "queued");
    } else if (state.hasBatch && !preserveNotice) {
      notice(`${state.count ?? ""} produtos lidos. Confirme a importação para revisão na sua conta.`);
    }
  } catch { disconnected("Não foi possível consultar a extensão. Abra novamente."); }
}

activateBtn?.addEventListener("click", async () => {
  if (!originVerified) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/activate-catalog.js"] });
    window.close();
  } catch { notice("Esta página não permite ativação. Abra uma página de produtos compatível."); }
});
captureActiveBtn?.addEventListener("click", async () => {
  if (!originVerified || !accountConnected || !captureActiveBtn) return;
  captureActiveBtn.disabled = true;
  if (captureActiveStatus) captureActiveStatus.textContent = "Lendo e atualizando o anúncio aberto…";
  try {
    const result = await chrome.runtime.sendMessage({ type: "CAPTURE_ACTIVE" }) as {
      ok?: boolean; queued?: boolean; error?: string;
      sample?: { title?: string; priceCents?: number; priceMaxCents?: number; priceType?: string; promotionType?: string; promotionEndsAt?: string };
    };
    if (!result.ok) {
      if (captureActiveStatus) captureActiveStatus.textContent = explain(result.error);
    } else {
      const sample = result.sample;
      const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const samplePrice = sample?.priceType === "range" && sample.priceMaxCents ? `${money(sample.priceCents!)} a ${money(sample.priceMaxCents)}`
        : sample?.priceCents ? `${sample.priceType === "from" ? "a partir de " : ""}${money(sample.priceCents)}` : "";
      const flashInfo = sample?.promotionType === "lightning" && sample.promotionEndsAt
        ? ` · ⚡ Relâmpago até ${new Date(sample.promotionEndsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
        : "";
      const summary = sample?.title ? `${sample.title.slice(0, 75)}${samplePrice ? ` — ${samplePrice}` : ""}${flashInfo}` : "Anúncio";
      if (captureActiveStatus) {
        captureActiveStatus.textContent = result.queued
          ? `⏳ Enfileirado para envio: ${summary}`
          : `✓ Anúncio atualizado: ${summary}`;
      }
    }
    await refreshStatus(true);
  } catch {
    if (captureActiveStatus) captureActiveStatus.textContent = "Não foi possível capturar este anúncio. Confira a página e tente novamente.";
  } finally {
    captureActiveBtn.disabled = !originVerified || !accountConnected;
  }
});
pairBtn?.addEventListener("click", async () => {
  if (!originVerified) return;
  const code = (codeInput?.value ?? "").trim().toUpperCase();
  if (!code) return;
  pairBtn.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: "PAIR", pairingCode: code });
    if (result.ok) { if (codeInput) codeInput.value = ""; await refreshStatus(); }
    else { await refreshStatus(true); disconnected(explain(result.error)); }
  } catch { disconnected("Não foi possível conectar. Confira a conexão e o código do painel."); }
  finally { pairBtn.disabled = !originVerified; }
});
logoutBtn?.addEventListener("click", async () => {
  try { await chrome.runtime.sendMessage({ type: "LOGOUT" }); await refreshStatus(); }
  catch { disconnected("Não foi possível sair. Abra a extensão novamente."); }
});
clearFailed?.addEventListener("click", async () => {
  clearFailed.disabled = true;
  try { await chrome.runtime.sendMessage({ type: "CLEAR_FAILED" }); await refreshStatus(); }
  catch { disconnected("Não foi possível descartar os envios interrompidos."); }
  finally { clearFailed.disabled = false; }
});
batchCancel?.addEventListener("click", async () => {
  batchCancel.disabled = true;
  try {
    await chrome.runtime.sendMessage({ type: "CANCEL_BATCH" });
    notice("Leitura descartada neste navegador. Produtos já recebidos continuam no painel.");
    await refreshStatus(true);
  } catch { notice("Não foi possível descartar esta leitura.", "stopped"); }
  finally { batchCancel.disabled = false; }
});
async function prepareBatch(replace: boolean): Promise<void> {
  if (!originVerified || !accountConnected || (replace && !canRefreshBatch)) return;
  if (batchPrepare) batchPrepare.disabled = true;
  if (batchRefresh) batchRefresh.disabled = true;
  if (batchImport) batchImport.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: replace ? "REFRESH_BATCH" : "PREPARE_BATCH" });
    if (!result.ok) notice(explain(result.error) + (replace ? " A leitura anterior foi mantida." : ""), result.stopped ? "stopped" : "normal");
    else {
      const d = result.diagnostics;
      const details = d ? [
        `${d.products} anúncios identificados`,
        result.lightningCount ? `⚡ ${result.lightningCount} em Oferta Relâmpago` : null,
        d.noPrice && `${d.noPrice} sem preço detectado${d.visibleNoPrice ? ` (${d.visibleNoPrice} visíveis na tela)` : ""}`,
        d.uncertainPrice && `${d.uncertainPrice} com preço indefinido`,
        d.noTitle && `${d.noTitle} sem nome`,
      ].filter(Boolean).join(" · ") : (result.lightningCount ? `⚡ ${result.lightningCount} em Oferta Relâmpago` : "");
      const sample = result.sample;
      const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const samplePrice = sample?.priceType === "range" && sample.priceMaxCents ? `${money(sample.priceCents)} a ${money(sample.priceMaxCents)}`
        : sample ? `${sample.priceType === "from" ? "a partir de " : ""}${money(sample.priceCents)}` : "";
      notice(`${result.count} produtos ${result.preserved ? "da leitura anterior preservados" : "prontos para conferir"}.`
        + (details ? ` ${details}.` : "") + (sample ? ` Exemplo: ${sample.title.slice(0, 85)} — ${samplePrice}.` : ""));
    }
    await refreshStatus(true);
  } catch {
    notice("Não foi possível confirmar a leitura desta página. Confira o estado ao abrir a extensão novamente.");
    await refreshStatus(true);
  } finally {
    if (batchPrepare) batchPrepare.disabled = !originVerified || !accountConnected;
    if (batchRefresh) batchRefresh.disabled = !originVerified || !accountConnected || !canRefreshBatch;
    if (batchImport) batchImport.disabled = !originVerified || !accountConnected;
  }
}
batchPrepare?.addEventListener("click", () => { void prepareBatch(false); });
batchRefresh?.addEventListener("click", () => { void prepareBatch(true); });
batchImport?.addEventListener("click", async () => {
  if (!originVerified) return;
  batchImport.disabled = true;
  notice("Enviando os produtos confirmados para revisão…");
  try {
    const result = await chrome.runtime.sendMessage({ type: "IMPORT_BATCH" });
    if (result.ok && !result.queued) notice("Importação confirmada. Confira o relatório abaixo e os produtos na curadoria do painel.", "success");
    else if (!result.ok) notice(explain(result.error), "stopped");
    await refreshStatus(true);
  } catch { notice("Não houve confirmação. Confira o painel e o estado da leitura antes de tentar novamente."); }
  finally { batchImport.disabled = !originVerified || !accountConnected; }
});
void refreshStatus();
