/**
 * Service worker da extensão (E5). Recebe o clique no botão (CAPTURE), monta o
 * payload, preserva o requestId e faz POST na API do BizuMiner. Falha de rede
 * cai na outbox (refinada em E6). Ativação do catálogo acontece no clique do
 * ícone (chrome.action.onClicked).
 */

import { postCapture } from "../lib/api.ts";
import {
  chromeStorage,
  getToken,
  clearSession,
  getApiBaseUrl,
  setApiBaseUrl,
} from "../lib/storage.ts";
import {
  enqueue,
  dequeue,
  markRetry,
  pruneExpired,
  dueForRetry,
  type OutboxEntry,
} from "../lib/outbox.ts";
import { pageKindFor, type CapturePayload } from "../lib/contracts.ts";
import type { ExtractedCard } from "../content/card-extractor.ts";
import { collectBrowserOffers } from "../content/page-extractor.ts";

/** Injetado pelo build (esbuild define): URL da API BizuMiner padrão. */
declare const __API_BASE__: string;

export const DEFAULT_API_BASE =
  typeof __API_BASE__ === "string" ? __API_BASE__ : "http://localhost:3100";

export async function getActiveApiBase(): Promise<string> {
  return getApiBaseUrl(chromeStorage(), DEFAULT_API_BASE);
}

const OUTBOX_KEY = "bm_outbox";
const RETRY_ALARM = "bm_retry";

async function readOutbox(): Promise<OutboxEntry[]> {
  const data = await chromeStorage().get(OUTBOX_KEY);
  const raw = data[OUTBOX_KEY];
  return Array.isArray(raw) ? (raw as OutboxEntry[]) : [];
}

async function writeOutbox(items: OutboxEntry[]): Promise<void> {
  await chromeStorage().set({ [OUTBOX_KEY]: items });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message && typeof message === "object" ? message.type : "";
  if (
    ["PREPARE_BATCH", "IMPORT_BATCH"].includes(type) &&
    sender.url !== chrome.runtime.getURL("popup/index.html")
  ) {
    sendResponse({ ok: false, error: "invalid_sender" });
    return false;
  }
  void handleMessage(message)
    .then(sendResponse)
    .catch((err) => {
      console.error("[BizuMiner Background Error]", err);
      sendResponse({ ok: false, error: "network" });
    });
  return true; // async response
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id == null) return;
  void chrome.scripting
    .executeScript({
      target: { tabId: tab.id },
      files: ["content/activate-catalog.js"],
    })
    .catch(() => {});
});

// E6: retry periódico da outbox + badge de pendências.
chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETRY_ALARM) void processDueOutbox();
});

async function updateBadge(): Promise<void> {
  const outbox = await readOutbox();
  const pending = outbox.length;
  await chrome.action.setBadgeText({
    text: pending > 0 ? String(pending) : "",
  });
  await chrome.action.setBadgeBackgroundColor({ color: "#a52a24" });
}

async function processDueOutbox(): Promise<void> {
  const token = await getToken(chromeStorage());
  if (!token) return;
  let outbox = pruneExpired(await readOutbox());
  const due = dueForRetry(outbox);

  const baseUrl = await getActiveApiBase();
  for (const entry of due) {
    try {
      const result = await postCapture(
        { baseUrl, token },
        entry.payload,
      );
      if (result.ok) {
        outbox = dequeue(outbox, entry.requestId);
      } else if (
        result.error === "unauthorized" ||
        result.error === "device_revoked"
      ) {
        await clearSession(chromeStorage());
        outbox = [];
        break;
      } else if (result.error === "invalid_payload") {
        outbox = dequeue(outbox, entry.requestId);
      } else {
        outbox = markRetry(
          outbox,
          entry.requestId,
          result.error ?? "retryable",
        );
      }
    } catch {
      outbox = markRetry(outbox, entry.requestId, "network");
    }
  }

  await writeOutbox(outbox);
  await updateBadge();
}

async function handleMessage(message: unknown): Promise<unknown> {
  if (typeof message !== "object" || message === null)
    return { ok: false, error: "invalid_message" };
  const msg = message as Record<string, unknown>;

  if (msg.type === "PREPARE_BATCH") return prepareBrowserBatch();
  if (msg.type === "IMPORT_BATCH") return importBrowserBatch();

  if (msg.type === "CAPTURE") {
    return handleCapture(msg);
  }
  if (msg.type === "PAIR") {
    return handlePair(msg);
  }
  if (msg.type === "LOGOUT") {
    await clearSession(chromeStorage());
    await updateBadge();
    return { ok: true };
  }
  if (msg.type === "PENDING") {
    void processDueOutbox();
    const outbox = await readOutbox();
    return { ok: true, pending: outbox.length };
  }
  if (msg.type === "GET_ENV") {
    const current = await getActiveApiBase();
    return { ok: true, baseUrl: current };
  }
  if (msg.type === "SET_ENV") {
    const nextUrl = typeof msg.baseUrl === "string" ? msg.baseUrl : "";
    if (nextUrl) {
      await setApiBaseUrl(chromeStorage(), nextUrl);
      return { ok: true, baseUrl: nextUrl };
    }
    return { ok: false, error: "invalid_url" };
  }
  return { ok: false, error: "unknown_message" };
}

const BROWSER_BATCH_KEY = "bm_browser_batch";
async function prepareBrowserBatch() {
  const token = await getToken(chromeStorage());
  if (!token) return { ok: false, error: "not_paired" };
  // Preserve a prior uncertain POST so a retry keeps its idempotency key.
  const saved = (await chromeStorage().get(BROWSER_BATCH_KEY))[
    BROWSER_BATCH_KEY
  ] as
    | {
        batchId?: string;
        payload?: ReturnType<typeof collectBrowserOffers>;
        sent?: boolean;
      }
    | undefined;
  if (
    saved?.sent &&
    saved.payload &&
    Date.parse(saved.payload.clientCapturedAt) > Date.now() - 30 * 60_000
  )
    return { ok: true, count: saved.payload.products.length, retry: true };
  const baseUrl = await getActiveApiBase();
  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/api/extension/capture-batches`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch (err) {
    console.error("Falha de rede em prepareBrowserBatch:", err);
    return { ok: false, error: "network" };
  }
  const job = await response.json();
  if (!response.ok) return { ok: false, error: "not_paired" };
  if (!job.batchId) return { ok: false, error: "no_waiting_batch" };
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (
    tab?.id == null ||
    !tab.url?.includes("mercadolivre.com.br/ofertas")
  )
    return { ok: false, error: "offers_page_required" };

  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectBrowserOffers,
    });
  } catch (err) {
    console.error("Erro ao executar leitura de ofertas na aba ativa:", err);
    return { ok: false, error: "offers_page_required" };
  }
  const payload = results[0]?.result;
  if (!payload?.products.length) return { ok: false, error: "no_offers" };
  await chromeStorage().set({
    [BROWSER_BATCH_KEY]: { batchId: job.batchId, payload, sent: false },
  });
  return {
    ok: true,
    count: payload.products.length,
    ignored: payload.ignoredCards,
  };
}

async function importBrowserBatch() {
  const token = await getToken(chromeStorage());
  if (!token) return { ok: false, error: "not_paired" };
  const saved = (await chromeStorage().get(BROWSER_BATCH_KEY))[
    BROWSER_BATCH_KEY
  ] as
    | {
        batchId?: string;
        payload?: ReturnType<typeof collectBrowserOffers>;
        sent?: boolean;
      }
    | undefined;
  if (!saved?.batchId || !saved.payload)
    return { ok: false, error: "prepare_first" };
  saved.sent = true;
  await chromeStorage().set({ [BROWSER_BATCH_KEY]: saved });

  const baseUrl = await getActiveApiBase();
  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/api/extension/capture-batches`,
      {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ batchId: saved.batchId, payload: saved.payload }),
      },
    );
  } catch (err) {
    console.error("Falha de rede em importBrowserBatch:", err);
    return { ok: false, error: "network" };
  }
  const result = await response.json();
  if (response.ok && result.ok)
    await chromeStorage().set({ [BROWSER_BATCH_KEY]: null });
  else if (
    response.status >= 400 &&
    response.status < 500 &&
    response.status !== 429
  )
    await chromeStorage().set({ [BROWSER_BATCH_KEY]: null });
  return result;
}

async function handleCapture(msg: Record<string, unknown>): Promise<unknown> {
  const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
  const card = msg.card as ExtractedCard | undefined;
  const pageUrl = typeof msg.pageUrl === "string" ? msg.pageUrl : "";
  if (!requestId || !card) return { ok: false, error: "invalid_message" };

  const token = await getToken(chromeStorage());
  if (!token) return { ok: false, error: "not_paired" };

  const payload: CapturePayload = {
    version: 1,
    requestId,
    marketplace: "mercadolivre",
    clientCapturedAt: new Date().toISOString(),
    page: { kind: pageKindFor(pageUrl), url: pageUrl },
    product: card,
  };

  const baseUrl = await getActiveApiBase();
  try {
    const result = await postCapture({ baseUrl, token }, payload);
    if (result.ok) {
      return {
        ok: true,
        duplicate: result.duplicate,
        publication: result.publication,
      };
    }
    if (result.error === "unauthorized" || result.error === "device_revoked") {
      // 401/403: pausa e pede reconexão (não faz retry cego).
      await clearSession(chromeStorage());
      return { ok: false, error: "not_paired" };
    }
    if (result.error === "invalid_payload") {
      return { ok: false, error: "invalid_payload" };
    }
    // network/5xx/429: outbox (backoff refinado em E6).
    const outbox = pruneExpired(await readOutbox());
    await writeOutbox(enqueue(outbox, payload));
    await updateBadge();
    return { ok: false, error: "queued" };
  } catch {
    const outbox = pruneExpired(await readOutbox());
    await writeOutbox(enqueue(outbox, payload));
    await updateBadge();
    return { ok: false, error: "queued" };
  }
}

async function handlePair(msg: Record<string, unknown>): Promise<unknown> {
  const pairingCode =
    typeof msg.pairingCode === "string" ? msg.pairingCode : "";
  if (!pairingCode) return { ok: false, error: "invalid_message" };
  const { exchangePairingCode } = await import("../lib/api.ts");
  const { setSession, setApiBaseUrl } = await import("../lib/storage.ts");

  const currentBase = await getActiveApiBase();
  const alternateBase =
    currentBase === "http://localhost:3100"
      ? "https://www.bizuminer.com.br"
      : "http://localhost:3100";

  // Tenta primeiro no ambiente ativo
  let chosenBase = currentBase;
  let result = await exchangePairingCode(
    { baseUrl: chosenBase },
    pairingCode,
  );

  // Se falhou no ambiente ativo, tenta automaticamente no ambiente alternativo
  if (!result.ok) {
    try {
      const altResult = await exchangePairingCode(
        { baseUrl: alternateBase },
        pairingCode,
      );
      if (altResult.ok) {
        chosenBase = alternateBase;
        result = altResult;
      }
    } catch {
      // Ignora erro no alternativo caso o servidor esteja offline
    }
  }

  if (result.ok && result.deviceToken && result.deviceId) {
    await setApiBaseUrl(chromeStorage(), chosenBase);
    await setSession(chromeStorage(), {
      token: result.deviceToken,
      deviceId: result.deviceId,
      affiliateName: result.affiliate?.displayName ?? "",
    });
    return {
      ok: true,
      baseUrl: chosenBase,
      affiliateName: result.affiliate?.displayName ?? "",
    };
  }
  return { ok: false, error: result.error ?? "exchange_failed" };
}

// Reexport para manter as funções de outbox referenciadas no bundle (evita
// tree-shake de utilitários usados por E6).
export { dequeue, markRetry };
