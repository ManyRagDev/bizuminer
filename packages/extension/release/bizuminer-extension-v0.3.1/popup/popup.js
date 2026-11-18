"use strict";
(() => {
  // src/lib/storage.ts
  var BUILD_API_ORIGIN = true ? "https://www.bizuminer.com.br" : "https://www.bizuminer.com.br";
  if (!["https://www.bizuminer.com.br", "http://localhost:3100"].includes(BUILD_API_ORIGIN)) throw new Error("invalid_build_origin");
  var STORAGE_KEYS = {
    token: "bm_token",
    deviceId: "bm_device_id",
    affiliateName: "bm_affiliate_name",
    activeTabId: "bm_active_tab_id",
    outbox: "bm_outbox",
    apiBaseUrl: "bm_api_base_url",
    sessionOrigin: "bm_session_origin"
  };
  function chromeStorage() {
    return chrome.storage.local;
  }
  async function getToken(storage) {
    const data = await storage.get([STORAGE_KEYS.token, STORAGE_KEYS.deviceId, STORAGE_KEYS.sessionOrigin]);
    const token = data[STORAGE_KEYS.token];
    return typeof token === "string" && token.startsWith("bm_ext_") && data[STORAGE_KEYS.sessionOrigin] === BUILD_API_ORIGIN && typeof data[STORAGE_KEYS.deviceId] === "string" && !!data[STORAGE_KEYS.deviceId] ? token : null;
  }

  // src/lib/import-report.ts
  var IMPORT_REASON_LABELS = {
    duplicate_external_id: "Identificador repetido nesta leitura",
    product_invalid: "Dados do produto incompletos",
    product_id_invalid: "Identificador do produto inv\xE1lido",
    product_title_invalid: "Nome do produto ausente ou inv\xE1lido",
    product_url_invalid: "Endere\xE7o do produto inv\xE1lido",
    product_identity_invalid: "Endere\xE7o e identificador n\xE3o correspondem",
    product_price_invalid: "Pre\xE7o ausente ou inv\xE1lido",
    product_original_price_invalid: "Pre\xE7o de refer\xEAncia inv\xE1lido",
    product_price_range_invalid: "Faixa de pre\xE7o inv\xE1lida",
    image_url_invalid: "Endere\xE7o da imagem inv\xE1lido"
  };
  var MAX_ITEMS = 200;
  function collectionMetadata(value) {
    const raw = record(value);
    if (!raw) return {};
    const result = {};
    if (typeof raw.capturedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(raw.capturedAt) && Number.isFinite(Date.parse(raw.capturedAt)) && new Date(raw.capturedAt).toISOString().replace(".000Z", "Z") === raw.capturedAt.replace(".000Z", "Z")) result.capturedAt = raw.capturedAt;
    if (typeof raw.preparedVersion === "string" && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(raw.preparedVersion)) result.preparedVersion = raw.preparedVersion;
    return result;
  }
  function formatCollectionDetails(value) {
    const metadata = collectionMetadata(value);
    return [
      metadata.capturedAt ? `Coleta: ${new Date(metadata.capturedAt).toLocaleString("pt-BR")}` : "Coleta: hor\xE1rio n\xE3o registrado",
      metadata.preparedVersion ? `Vers\xE3o da coleta: ${metadata.preparedVersion}` : "Vers\xE3o da coleta: vers\xE3o n\xE3o registrada; leitura anterior"
    ];
  }
  var count = (value) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= MAX_ITEMS;
  function record(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
  }
  function safeId(value) {
    return typeof value === "string" && value.length <= 64 && (/^MLB\d{6,}$/.test(value) || /^[A-Z0-9]{10}$/.test(value) || /^\d{8,20}$/.test(value));
  }
  function diagnostics(value) {
    const d = record(value);
    if (!d || !count(d.received) || !count(d.valid) || !count(d.duplicates) || !count(d.rejected) || d.received !== d.valid + d.duplicates + d.rejected || !Array.isArray(d.items) || d.items.length !== d.duplicates + d.rejected || d.items.length > MAX_ITEMS) return void 0;
    const items = [];
    const indices = /* @__PURE__ */ new Set();
    for (const raw of d.items) {
      const item = record(raw);
      if (!item || !count(item.index) || item.index < 1 || item.index > d.received || indices.has(item.index) || item.status !== "duplicate" && item.status !== "rejected") return void 0;
      indices.add(item.index);
      const reason = typeof item.reason === "string" && Object.hasOwn(IMPORT_REASON_LABELS, item.reason) ? item.reason : "unknown_reason";
      items.push({
        index: item.index,
        status: item.status,
        reason,
        ...safeId(item.externalId) ? { externalId: item.externalId } : {}
      });
    }
    if (items.filter((item) => item.status === "duplicate").length !== d.duplicates || items.filter((item) => item.status === "rejected").length !== d.rejected) return void 0;
    return {
      received: d.received,
      valid: d.valid,
      duplicates: d.duplicates,
      rejected: d.rejected,
      items: items.sort((a, b) => a.index - b.index)
    };
  }
  var SAFE_ERRORS = /* @__PURE__ */ new Set([
    "invalid_payload",
    "no_valid_products",
    "network",
    "timeout",
    "invalid_response",
    "not_paired",
    "unauthorized",
    "forbidden",
    "device_revoked",
    "account_suspended",
    "capture_expired",
    "retry_limit",
    "session_changed",
    "marketplace_capture_unavailable",
    "browser_capture_forbidden",
    "request_failed",
    "storage_or_network"
  ]);
  function sanitizeImportReport(value) {
    const raw = record(value);
    if (!raw || typeof raw.requestId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(raw.requestId) || !Number.isSafeInteger(raw.at) || Number(raw.at) < 0 || !Number.isFinite(new Date(Number(raw.at)).getTime()) || typeof raw.ok !== "boolean") return null;
    const result = { requestId: raw.requestId, at: Number(raw.at), ok: raw.ok, ...collectionMetadata(raw) };
    const detail = diagnostics(raw.diagnostics);
    if (detail) result.diagnostics = detail;
    if (count(raw.importedCount) && (!detail || raw.importedCount <= detail.valid)) result.importedCount = raw.importedCount;
    if (detail && result.importedCount !== void 0 && count(raw.alreadyRecordedCount) && raw.alreadyRecordedCount + result.importedCount === detail.valid) result.alreadyRecordedCount = raw.alreadyRecordedCount;
    if (typeof raw.duplicate === "boolean") result.duplicate = raw.duplicate;
    if (typeof raw.error === "string") result.error = SAFE_ERRORS.has(raw.error) ? raw.error : "request_failed";
    return result;
  }
  function formatImportReport(value) {
    const report = sanitizeImportReport(value);
    if (!report) return null;
    const d = report.diagnostics;
    const number = (value2) => value2 === void 0 ? "informa\xE7\xE3o indispon\xEDvel" : String(value2);
    const grouped = /* @__PURE__ */ new Map();
    const reasonLabel = (reason) => reason === "unknown_reason" ? "Motivo n\xE3o informado pelo servidor" : IMPORT_REASON_LABELS[reason];
    for (const item of d?.items ?? []) {
      const key = `${item.status}:${item.reason}`;
      const current = grouped.get(key);
      grouped.set(key, {
        count: (current?.count ?? 0) + 1,
        label: `${item.status === "duplicate" ? "Duplicados" : "Rejeitados"} \u2014 ${reasonLabel(item.reason)}`
      });
    }
    return {
      heading: report.ok ? "\xDAltima importa\xE7\xE3o confirmada" : "\xDAltima tentativa de importa\xE7\xE3o",
      timestamp: report.at,
      timing: [...formatCollectionDetails(report), `${report.ok ? "Confirma\xE7\xE3o" : "Tentativa de envio"}: ${new Date(report.at).toLocaleString("pt-BR")}`],
      counts: [
        `Recebidos pelo servidor: ${number(d?.received)}`,
        `V\xE1lidos \xFAnicos: ${number(d?.valid)}`,
        `Duplicados nesta leitura: ${number(d?.duplicates)}`,
        `Rejeitados na valida\xE7\xE3o: ${number(d?.rejected)}`,
        `Novas observa\xE7\xF5es registradas: ${number(report.importedCount)}`,
        `J\xE1 registrados, sem nova observa\xE7\xE3o: ${number(report.alreadyRecordedCount)}`
      ],
      explanation: d ? "Duplicados s\xE3o repeti\xE7\xF5es dentro desta leitura. J\xE1 registrados s\xE3o itens v\xE1lidos que n\xE3o criaram nova observa\xE7\xE3o. Os motivos abaixo pertencem somente a esta solicita\xE7\xE3o." : "O servidor n\xE3o forneceu um detalhamento v\xE1lido desta solicita\xE7\xE3o. N\xE3o \xE9 poss\xEDvel atribuir a diferen\xE7a a duplica\xE7\xE3o, rejei\xE7\xE3o ou hist\xF3rico.",
      reasons: [...grouped.values()].map((group) => `${group.label}: ${group.count}`),
      items: (d?.items ?? []).map((item) => `Item ${item.index}${item.externalId ? ` \xB7 ${item.externalId}` : ""}: ${item.status === "duplicate" ? "duplicado" : "rejeitado"} \u2014 ${reasonLabel(item.reason)}.`)
    };
  }

  // src/popup/batch-view.ts
  function formatBatchState(state) {
    const hasBatch = state.hasBatch === true;
    const canReplace = hasBatch && state.canReplace === true && !state.sent && !state.queued;
    return {
      prepareLabel: hasBatch ? "Retomar leitura" : "Ler an\xFAncios desta p\xE1gina",
      canReplace,
      metadata: hasBatch ? formatCollectionDetails(state) : [],
      guidance: !hasBatch ? "" : canReplace ? "Retomar mant\xE9m esta coleta. Refazer l\xEA a p\xE1gina aberta e s\xF3 substitui esta leitura se a nova coleta terminar com sucesso." : "Esta leitura pode j\xE1 ter sido recebida pelo servidor. Confira o painel antes de descart\xE1-la. Para ler novamente, use Descartar leitura; isso n\xE3o remove registros j\xE1 recebidos."
    };
  }

  // src/popup/popup.ts
  var EXPECTED_ORIGIN = true ? "https://www.bizuminer.com.br" : "https://www.bizuminer.com.br";
  var statusLine = document.querySelector(".status-line");
  var statusText = document.querySelector("#status-text");
  var pendingEl = document.querySelector("#pending");
  var clearFailed = document.querySelector("#clear-failed");
  var activateBtn = document.querySelector("#activate");
  var captureActiveBtn = document.querySelector("#capture-active");
  var captureActiveStatus = document.querySelector("#capture-active-status");
  var pairingSection = document.querySelector("#pairing");
  var codeInput = document.querySelector("#code");
  var pairBtn = document.querySelector("#pair");
  var logoutBtn = document.querySelector("#logout");
  var envOrigin = document.querySelector("#env-origin");
  var batchPrepare = document.querySelector("#batch-prepare");
  var batchImport = document.querySelector("#batch-import");
  var batchCancel = document.querySelector("#batch-cancel");
  var batchRefresh = document.querySelector("#batch-refresh");
  var batchMetadata = document.querySelector("#batch-metadata");
  var batchGuidance = document.querySelector("#batch-guidance");
  var batchResult = document.querySelector("#batch-result");
  var importReport = document.querySelector("#import-report");
  var importReportTitle = document.querySelector("#import-report-title");
  var importReportTime = document.querySelector("#import-report-time");
  var importReportCounts = document.querySelector("#import-report-counts");
  var importReportExplanation = document.querySelector("#import-report-explanation");
  var importReportDetails = document.querySelector("#import-report-details");
  var importReportReasons = document.querySelector("#import-report-reasons");
  var importReportItems = document.querySelector("#import-report-items");
  var recaptureStore = document.querySelector("#recapture-store");
  var recapturePace = document.querySelector("#recapture-pace");
  var recaptureStart = document.querySelector("#recapture-start");
  var recapturePause = document.querySelector("#recapture-pause");
  var recaptureResume = document.querySelector("#recapture-resume");
  var recaptureCancel = document.querySelector("#recapture-cancel");
  var recaptureStatus = document.querySelector("#recapture-status");
  var recaptureBudget = document.querySelector("#recapture-budget");
  var recaptureReport = document.querySelector("#recapture-report");
  var recaptureAssistOpen = document.querySelector("#recapture-assist-open");
  var recaptureAssistRead = document.querySelector("#recapture-assist-read");
  var recaptureAssistLink = document.querySelector("#recapture-assist-link");
  var originVerified = false;
  var accountConnected = false;
  var canRefreshBatch = false;
  var errors = {
    not_paired: "Conecte este navegador \xE0 sua conta antes de importar.",
    session_changed: "A conta ou o destino mudou. Descarte esta leitura e leia a p\xE1gina novamente.",
    invalid_url: "O destino n\xE3o corresponde a esta vers\xE3o. Instale a vers\xE3o correta e conecte novamente.",
    invalid_sender: "Abra o popup oficial da extens\xE3o para confirmar esta a\xE7\xE3o.",
    device_revoked: "O acesso deste navegador foi revogado. Conecte novamente pelo painel.",
    unauthorized: "O acesso expirou ou foi revogado. Conecte novamente pelo painel.",
    forbidden: "A conta n\xE3o tem permiss\xE3o para importar estes produtos.",
    account_suspended: "A conta est\xE1 suspensa. Confira o acesso no painel.",
    capture_expired: "Esta leitura venceu. Descarte-a e leia os produtos novamente.",
    retry_limit: "O limite de tentativas foi atingido. Confira o painel e descarte esta leitura antes de uma nova captura.",
    queue_full: "A fila est\xE1 cheia. Confira os envios pendentes e descarte os interrompidos antes de continuar.",
    offers_page_required: "Abra uma oferta ou listagem no Mercado Livre, Amazon Brasil ou AliExpress.",
    ml_page_required: "Abra uma oferta ou listagem no Mercado Livre, Amazon Brasil ou AliExpress.",
    no_offers: "Nenhum produto completo foi encontrado. Aguarde a p\xE1gina terminar de carregar.",
    marketplace_server_outdated: "O servidor ainda n\xE3o aceita esta importa\xE7\xE3o. Confira a atualiza\xE7\xE3o do painel.",
    marketplace_capture_unavailable: "A importa\xE7\xE3o desta loja n\xE3o est\xE1 habilitada nesta conta.",
    invalid_payload: "O servidor recusou os dados. Descarte esta leitura e confira a p\xE1gina antes de tentar novamente.",
    browser_capture_forbidden: "Este navegador n\xE3o tem permiss\xE3o para importar na conta.",
    prepare_first: "Leia os produtos da p\xE1gina antes de confirmar a importa\xE7\xE3o.",
    discard_required: "Esta leitura j\xE1 pode ter sido recebida. Confira o painel e use Descartar leitura antes de ler a p\xE1gina novamente.",
    invalid_code: "C\xF3digo inv\xE1lido ou expirado. Gere outro no painel desta conta.",
    pairing_code_invalid: "C\xF3digo inv\xE1lido ou expirado. Gere outro no painel desta conta.",
    exchange_failed: "N\xE3o foi poss\xEDvel conectar. Confira o c\xF3digo e o destino mostrado abaixo.",
    network: "N\xE3o houve confirma\xE7\xE3o do servidor. O envio preserva a mesma identifica\xE7\xE3o para evitar duplica\xE7\xE3o.",
    timeout: "O servidor n\xE3o confirmou a tempo. O envio preserva a mesma identifica\xE7\xE3o para evitar duplica\xE7\xE3o.",
    invalid_response: "A resposta do servidor n\xE3o p\xF4de ser confirmada. Confira o painel.",
    storage_or_network: "N\xE3o foi poss\xEDvel concluir a a\xE7\xE3o. Confira a conex\xE3o e abra a extens\xE3o novamente.",
    permission_required: "A permiss\xE3o desta loja n\xE3o foi concedida. Abra a p\xE1gina desejada e use a leitura manual abaixo.",
    recapture_not_enabled: "A atualiza\xE7\xE3o dirigida ainda n\xE3o est\xE1 habilitada nesta conta.",
    recapture_pace_invalid: "Escolha um intervalo v\xE1lido para esta sess\xE3o.",
    recapture_account_not_enabled: "A atualiza\xE7\xE3o dirigida ainda n\xE3o est\xE1 habilitada para esta conta.",
    recapture_daily_budget_exhausted: "O limite di\xE1rio de atualiza\xE7\xE3o foi atingido. Os acompanhamentos continuam pendentes.",
    recapture_watch_capacity_reserved: "A capacidade restante est\xE1 reservada a acompanhamentos pendentes. Atualize a loja correspondente ou tente novamente depois.",
    recapture_session_budget_exhausted: "O limite desta sess\xE3o foi atingido. Os acompanhamentos restantes continuam pendentes.",
    recapture_budget_not_configured: "O or\xE7amento de atualiza\xE7\xE3o ainda n\xE3o foi configurado.",
    recapture_claim_expired: "O prazo desta confer\xEAncia terminou. Consulte o painel para uma nova tentativa.",
    recapture_target_busy: "Outra sess\xE3o est\xE1 conferindo estes itens. As demais p\xE1ginas j\xE1 dispon\xEDveis podem avan\xE7ar; retome depois para conferir o que falta.",
    recapture_plan_updating: "O plano est\xE1 sendo atualizado. Retome em instantes para conferir se h\xE1 mais p\xE1ginas.",
    recapture_plan_changed: "O plano mudou antes da abertura. Consulte a atualiza\xE7\xE3o novamente.",
    active_page_not_ready: "Aguarde o carregamento e abra a extens\xE3o novamente na p\xE1gina indicada.",
    active_page_mismatch: "Abra a p\xE1gina indicada e use a extens\xE3o naquela aba.",
    recapture_retry_wait: "Aguarde antes de tentar novamente; a solicita\xE7\xE3o anterior permanece registrada.",
    navigation_unknown: "N\xE3o foi poss\xEDvel confirmar a abertura da p\xE1gina. Confira a loja antes de retomar.",
    needs_login: "A loja pediu acesso. Fa\xE7a login no navegador antes de retomar a atualiza\xE7\xE3o.",
    blocked: "A loja bloqueou a leitura ou redirecionou a p\xE1gina. Confira o acesso antes de retomar."
  };
  var explain = (error) => errors[error ?? ""] ?? "A solicita\xE7\xE3o foi recusada. Confira o acesso e a vers\xE3o do painel.";
  async function refreshRecaptureStatus() {
    try {
      const state = await chrome.runtime.sendMessage({ type: "RECAPTURE_STATUS" });
      if (recaptureStart) recaptureStart.hidden = Boolean(state.active);
      if (recaptureStore) {
        recaptureStore.disabled = Boolean(state.active);
        if (state.active && state.marketplace) recaptureStore.value = state.marketplace;
      }
      if (recapturePace) {
        recapturePace.disabled = Boolean(state.active);
        if (state.active && state.pace) recapturePace.value = state.pace;
      }
      if (recapturePause) recapturePause.hidden = !state.active || state.phase === "paused";
      if (recaptureResume) recaptureResume.hidden = !state.active || state.phase !== "paused";
      if (recaptureCancel) recaptureCancel.hidden = !state.active;
      if (recaptureAssistOpen) recaptureAssistOpen.hidden = state.mode !== "assisted" || state.phase !== "awaiting_open";
      if (recaptureAssistRead) recaptureAssistRead.hidden = state.mode !== "assisted" || state.phase !== "awaiting_page";
      if (recaptureAssistLink) {
        recaptureAssistLink.hidden = state.mode !== "assisted" || state.phase !== "awaiting_page" || !state.taskUrl;
        if (state.taskUrl) recaptureAssistLink.href = state.taskUrl;
        else recaptureAssistLink.removeAttribute("href");
      }
      if (recaptureStatus && (state.active || state.phase === "completed")) recaptureStatus.textContent = state.error ? explain(state.error) : state.phase === "awaiting_open" ? "Modo assistido: abra a p\xE1gina indicada para reservar esta confer\xEAncia." : state.phase === "awaiting_page" ? "Na p\xE1gina indicada, abra a extens\xE3o e selecione Ler p\xE1gina aberta." : `${state.phase === "paused" ? "Pausada" : state.phase === "completed" ? "Sem mais p\xE1ginas dispon\xEDveis agora" : "Em andamento"}: ${state.completed ?? 0} p\xE1gina(s), ${state.observed ?? 0} alvo(s) conferido(s), ${state.residual ?? 0} pendente(s) nesta sess\xE3o.`;
      if (recaptureBudget) {
        recaptureBudget.hidden = !state.remaining;
        if (state.remaining) {
          const label = (value) => value === null ? "indispon\xEDvel ou n\xE3o configurado" : String(value);
          recaptureBudget.textContent = `Saldo di\xE1rio da conta na \xFAltima consulta: ${label(state.remaining.listing)} listagem(ns) e ${label(state.remaining.pdp)} p\xE1gina(s) de produto. Outras sess\xF5es podem consumir esse saldo.`;
        } else recaptureBudget.textContent = "";
      }
      if (recaptureReport) {
        const report = state.lastReport;
        recaptureReport.hidden = !report;
        if (report) {
          const labels = {
            price_conflict: "pre\xE7o divergente",
            no_price: "sem pre\xE7o",
            not_found_on_listing: "n\xE3o encontrado na listagem",
            configuration_mismatch: "configura\xE7\xE3o diferente",
            needs_login: "login necess\xE1rio",
            blocked: "acesso bloqueado",
            parse_error: "leitura incompleta",
            timeout: "tempo esgotado",
            superseded_observation: "observa\xE7\xE3o substitu\xEDda",
            unreported: "n\xE3o reportado"
          };
          const details = Object.entries(report.reasons).filter(([reason]) => labels[reason]).map(([reason, count2]) => `${count2} ${labels[reason]}`);
          recaptureReport.textContent = `\xDAltima p\xE1gina: ${report.discovered} produto(s) novo(s), ${report.unavailable} indisponibilidade(s) confirmada(s)${details.length ? ` \xB7 ${details.join(" \xB7 ")}` : ""}.`;
        } else recaptureReport.textContent = "";
      }
    } catch {
      if (recaptureStatus) recaptureStatus.textContent = "N\xE3o foi poss\xEDvel consultar a atualiza\xE7\xE3o.";
    }
  }
  recaptureStart?.addEventListener("click", async () => {
    if (!originVerified || !accountConnected || !recaptureStore) return;
    const origins = { mercadolivre: "https://*.mercadolivre.com.br/*", amazon: "https://*.amazon.com.br/*", aliexpress: "https://*.aliexpress.com/*" };
    const origin = origins[recaptureStore.value];
    if (!origin) return;
    recaptureStart.disabled = true;
    try {
      const allowed = await chrome.permissions.request({ origins: [origin] });
      const result = await chrome.runtime.sendMessage({ type: "RECAPTURE_START", marketplace: recaptureStore.value, assisted: !allowed, pace: recapturePace?.value ?? "normal" });
      if (!result.ok && recaptureStatus) recaptureStatus.textContent = explain(result.error);
      await refreshRecaptureStatus();
    } catch {
      if (recaptureStatus) recaptureStatus.textContent = "N\xE3o foi poss\xEDvel iniciar a atualiza\xE7\xE3o.";
    } finally {
      recaptureStart.disabled = false;
    }
  });
  for (const [button, type] of [[recaptureAssistOpen, "RECAPTURE_ASSIST_OPEN"], [recaptureAssistRead, "RECAPTURE_ASSIST_READ"]]) {
    button?.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const result = await chrome.runtime.sendMessage({ type });
        await refreshRecaptureStatus();
        if (!result.ok && recaptureStatus) recaptureStatus.textContent = explain(result.error);
      } catch {
        if (recaptureStatus) recaptureStatus.textContent = "N\xE3o foi poss\xEDvel continuar a confer\xEAncia.";
      } finally {
        button.disabled = false;
      }
    });
  }
  for (const [button, type] of [[recapturePause, "RECAPTURE_PAUSE"], [recaptureResume, "RECAPTURE_RESUME"], [recaptureCancel, "RECAPTURE_CANCEL"]]) {
    button?.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const result = await chrome.runtime.sendMessage({ type });
        if (!result.ok && recaptureStatus) recaptureStatus.textContent = explain(result.error);
        await refreshRecaptureStatus();
      } finally {
        button.disabled = false;
      }
    });
  }
  void refreshRecaptureStatus();
  setInterval(() => {
    void refreshRecaptureStatus();
  }, 2e3);
  function textList(target, values) {
    if (!target) return;
    target.replaceChildren(...values.map((value) => {
      const item = document.createElement("li");
      item.textContent = value;
      return item;
    }));
  }
  function renderImportReport(value) {
    const view = formatImportReport(value);
    if (importReport) importReport.hidden = !view;
    if (!view) {
      textList(importReportCounts, []);
      textList(importReportReasons, []);
      textList(importReportItems, []);
      if (importReportTitle) importReportTitle.textContent = "\xDAltima importa\xE7\xE3o";
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
  function notice(message, kind = "normal") {
    if (!batchResult) return;
    batchResult.className = `hint${kind === "normal" ? "" : ` batch-${kind}-notice`}`;
    batchResult.textContent = message;
  }
  function disconnected(message) {
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
  async function refreshStatus(preserveNotice = false) {
    try {
      const env = await chrome.runtime.sendMessage({ type: "GET_ENV" });
      originVerified = env?.baseUrl === EXPECTED_ORIGIN && env.allowedBaseUrls?.length === 1 && env.allowedBaseUrls[0] === EXPECTED_ORIGIN;
      if (envOrigin) envOrigin.textContent = EXPECTED_ORIGIN;
      if (!originVerified) {
        renderImportReport(null);
        disconnected("Destino incompat\xEDvel. Atualize a extens\xE3o.");
        if (batchPrepare) batchPrepare.disabled = true;
        if (batchImport) batchImport.disabled = true;
        if (captureActiveBtn) captureActiveBtn.disabled = true;
        if (pairBtn) pairBtn.disabled = true;
        return;
      }
      const pending = await chrome.runtime.sendMessage({ type: "PENDING" });
      const state = await chrome.runtime.sendMessage({ type: "GET_BATCH_STATE" });
      const token = await getToken(chromeStorage());
      accountConnected = Boolean(token);
      const data = await chromeStorage().get("bm_affiliate_name");
      const name = typeof data.bm_affiliate_name === "string" ? data.bm_affiliate_name : "";
      renderImportReport(token ? state.lastImport : null);
      statusLine?.classList.toggle("connected", Boolean(token));
      statusLine?.classList.toggle("disconnected", !token);
      if (statusText) statusText.textContent = token ? name || "Conectado \xE0 sua conta" : "Conecte este navegador";
      if (pairingSection) pairingSection.hidden = Boolean(token);
      if (logoutBtn) logoutBtn.hidden = !token;
      if (batchPrepare) batchPrepare.disabled = !token;
      if (batchImport) batchImport.disabled = !token;
      if (captureActiveBtn) captureActiveBtn.disabled = !token;
      if (pairBtn) pairBtn.disabled = false;
      const active = pending.pending ?? 0, failed = pending.failed ?? 0;
      if (pendingEl) {
        pendingEl.hidden = active + failed === 0;
        pendingEl.textContent = [
          active > 0 ? `${active} envio(s) aguardando confirma\xE7\xE3o.` : "",
          failed > 0 ? `${failed} envio(s) interrompido(s), sem novas tentativas autom\xE1ticas. ${explain(pending.errors?.[0])}` : ""
        ].filter(Boolean).join(" ");
      }
      if (clearFailed) clearFailed.hidden = failed === 0;
      if (batchCancel) batchCancel.hidden = !state.hasBatch;
      const batchView = formatBatchState(state);
      canRefreshBatch = Boolean(token) && batchView.canReplace;
      if (batchPrepare) batchPrepare.textContent = batchView.prepareLabel;
      if (batchRefresh) {
        batchRefresh.hidden = !canRefreshBatch;
        batchRefresh.disabled = !canRefreshBatch;
      }
      textList(batchMetadata, token ? batchView.metadata : []);
      if (batchMetadata) batchMetadata.hidden = !token || !state.hasBatch;
      if (batchGuidance) {
        batchGuidance.textContent = batchView.guidance;
        batchGuidance.hidden = !token || !state.hasBatch;
      }
      if (batchImport) {
        batchImport.hidden = !state.hasBatch || Boolean(state.stopped);
        batchImport.textContent = state.queued ? "Tentar enviar agora" : `Importar ${state.count ?? ""} produtos para revis\xE3o`;
      }
      if (state.hasBatch && state.stopped) {
        notice(`Envio interrompido. ${explain(state.lastError)} N\xE3o haver\xE1 novas tentativas autom\xE1ticas.`, "stopped");
      } else if (state.hasBatch && state.queued) {
        notice(`${state.count ?? ""} produtos aguardando confirma\xE7\xE3o. Haver\xE1 tentativas limitadas enquanto esta leitura for v\xE1lida. ${state.lastError ? explain(state.lastError) : ""}`, "queued");
      } else if (state.hasBatch && !preserveNotice) {
        notice(`${state.count ?? ""} produtos lidos. Confirme a importa\xE7\xE3o para revis\xE3o na sua conta.`);
      }
    } catch {
      disconnected("N\xE3o foi poss\xEDvel consultar a extens\xE3o. Abra novamente.");
    }
  }
  activateBtn?.addEventListener("click", async () => {
    if (!originVerified) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/activate-catalog.js"] });
      window.close();
    } catch {
      notice("Esta p\xE1gina n\xE3o permite ativa\xE7\xE3o. Abra uma p\xE1gina de produtos compat\xEDvel.");
    }
  });
  captureActiveBtn?.addEventListener("click", async () => {
    if (!originVerified || !accountConnected || !captureActiveBtn) return;
    captureActiveBtn.disabled = true;
    if (captureActiveStatus) captureActiveStatus.textContent = "Lendo e atualizando o an\xFAncio aberto\u2026";
    try {
      const result = await chrome.runtime.sendMessage({ type: "CAPTURE_ACTIVE" });
      if (!result.ok) {
        if (captureActiveStatus) captureActiveStatus.textContent = explain(result.error);
      } else {
        const sample = result.sample;
        const money = (cents) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const samplePrice = sample?.priceType === "range" && sample.priceMaxCents ? `${money(sample.priceCents)} a ${money(sample.priceMaxCents)}` : sample?.priceCents ? `${sample.priceType === "from" ? "a partir de " : ""}${money(sample.priceCents)}` : "";
        const summary = sample?.title ? `${sample.title.slice(0, 75)}${samplePrice ? ` \u2014 ${samplePrice}` : ""}` : "An\xFAncio";
        if (captureActiveStatus) {
          captureActiveStatus.textContent = result.queued ? `\u23F3 Enfileirado para envio: ${summary}` : `\u2713 An\xFAncio atualizado: ${summary}`;
        }
      }
      await refreshStatus(true);
    } catch {
      if (captureActiveStatus) captureActiveStatus.textContent = "N\xE3o foi poss\xEDvel capturar este an\xFAncio. Confira a p\xE1gina e tente novamente.";
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
      if (result.ok) {
        if (codeInput) codeInput.value = "";
        await refreshStatus();
      } else {
        await refreshStatus(true);
        disconnected(explain(result.error));
      }
    } catch {
      disconnected("N\xE3o foi poss\xEDvel conectar. Confira a conex\xE3o e o c\xF3digo do painel.");
    } finally {
      pairBtn.disabled = !originVerified;
    }
  });
  logoutBtn?.addEventListener("click", async () => {
    try {
      await chrome.runtime.sendMessage({ type: "LOGOUT" });
      await refreshStatus();
    } catch {
      disconnected("N\xE3o foi poss\xEDvel sair. Abra a extens\xE3o novamente.");
    }
  });
  clearFailed?.addEventListener("click", async () => {
    clearFailed.disabled = true;
    try {
      await chrome.runtime.sendMessage({ type: "CLEAR_FAILED" });
      await refreshStatus();
    } catch {
      disconnected("N\xE3o foi poss\xEDvel descartar os envios interrompidos.");
    } finally {
      clearFailed.disabled = false;
    }
  });
  batchCancel?.addEventListener("click", async () => {
    batchCancel.disabled = true;
    try {
      await chrome.runtime.sendMessage({ type: "CANCEL_BATCH" });
      notice("Leitura descartada neste navegador. Produtos j\xE1 recebidos continuam no painel.");
      await refreshStatus(true);
    } catch {
      notice("N\xE3o foi poss\xEDvel descartar esta leitura.", "stopped");
    } finally {
      batchCancel.disabled = false;
    }
  });
  async function prepareBatch(replace) {
    if (!originVerified || !accountConnected || replace && !canRefreshBatch) return;
    if (batchPrepare) batchPrepare.disabled = true;
    if (batchRefresh) batchRefresh.disabled = true;
    if (batchImport) batchImport.disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({ type: replace ? "REFRESH_BATCH" : "PREPARE_BATCH" });
      if (!result.ok) notice(explain(result.error) + (replace ? " A leitura anterior foi mantida." : ""), result.stopped ? "stopped" : "normal");
      else {
        const d = result.diagnostics;
        const details = d ? [
          `${d.products} an\xFAncios identificados`,
          d.noPrice && `${d.noPrice} sem pre\xE7o detectado${d.visibleNoPrice ? ` (${d.visibleNoPrice} vis\xEDveis na tela)` : ""}`,
          d.uncertainPrice && `${d.uncertainPrice} com pre\xE7o indefinido`,
          d.noTitle && `${d.noTitle} sem nome`
        ].filter(Boolean).join(" \xB7 ") : "";
        const sample = result.sample;
        const money = (cents) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const samplePrice = sample?.priceType === "range" && sample.priceMaxCents ? `${money(sample.priceCents)} a ${money(sample.priceMaxCents)}` : sample ? `${sample.priceType === "from" ? "a partir de " : ""}${money(sample.priceCents)}` : "";
        notice(`${result.count} produtos ${result.preserved ? "da leitura anterior preservados" : "prontos para conferir"}.` + (details ? ` ${details}.` : "") + (sample ? ` Exemplo: ${sample.title.slice(0, 85)} \u2014 ${samplePrice}.` : ""));
      }
      await refreshStatus(true);
    } catch {
      notice("N\xE3o foi poss\xEDvel confirmar a leitura desta p\xE1gina. Confira o estado ao abrir a extens\xE3o novamente.");
      await refreshStatus(true);
    } finally {
      if (batchPrepare) batchPrepare.disabled = !originVerified || !accountConnected;
      if (batchRefresh) batchRefresh.disabled = !originVerified || !accountConnected || !canRefreshBatch;
      if (batchImport) batchImport.disabled = !originVerified || !accountConnected;
    }
  }
  batchPrepare?.addEventListener("click", () => {
    void prepareBatch(false);
  });
  batchRefresh?.addEventListener("click", () => {
    void prepareBatch(true);
  });
  batchImport?.addEventListener("click", async () => {
    if (!originVerified) return;
    batchImport.disabled = true;
    notice("Enviando os produtos confirmados para revis\xE3o\u2026");
    try {
      const result = await chrome.runtime.sendMessage({ type: "IMPORT_BATCH" });
      if (result.ok && !result.queued) notice("Importa\xE7\xE3o confirmada. Confira o relat\xF3rio abaixo e os produtos na curadoria do painel.", "success");
      else if (!result.ok) notice(explain(result.error), "stopped");
      await refreshStatus(true);
    } catch {
      notice("N\xE3o houve confirma\xE7\xE3o. Confira o painel e o estado da leitura antes de tentar novamente.");
    } finally {
      batchImport.disabled = !originVerified || !accountConnected;
    }
  });
  void refreshStatus();
})();
