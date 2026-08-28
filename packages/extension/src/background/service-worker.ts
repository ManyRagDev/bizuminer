/**
 * Service worker da extensão (E5). Recebe o clique no botão (CAPTURE), monta o
 * payload, preserva o requestId e faz POST na API do BizuMiner. Falha de rede
 * cai na outbox (refinada em E6). Ativação do catálogo acontece no clique do
 * ícone (chrome.action.onClicked).
 */

import { postCapture } from "../lib/api.ts";
import { chromeStorage, getToken, clearSession } from "../lib/storage.ts";
import { enqueue, dequeue, markRetry, pruneExpired, dueForRetry, type OutboxEntry } from "../lib/outbox.ts";
import { pageKindFor, type CapturePayload } from "../lib/contracts.ts";
import type { ExtractedCard } from "../content/card-extractor.ts";

/** Injetado pelo build (esbuild define): URL da API BizuMiner (dev vs prod). */
declare const __API_BASE__: string;

export const API_BASE_URL = __API_BASE__;

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message).then(sendResponse);
  return true; // async response
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id == null) return;
  void chrome.scripting
    .executeScript({ target: { tabId: tab.id }, files: ["content/activate-catalog.js"] })
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
  await chrome.action.setBadgeText({ text: pending > 0 ? String(pending) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#a52a24" });
}

async function processDueOutbox(): Promise<void> {
  const token = await getToken(chromeStorage());
  if (!token) return;
  let outbox = pruneExpired(await readOutbox());
  const due = dueForRetry(outbox);

  for (const entry of due) {
    try {
      const result = await postCapture({ baseUrl: API_BASE_URL, token }, entry.payload);
      if (result.ok) {
        outbox = dequeue(outbox, entry.requestId);
      } else if (result.error === "unauthorized" || result.error === "device_revoked") {
        await clearSession(chromeStorage());
        outbox = [];
        break;
      } else if (result.error === "invalid_payload") {
        outbox = dequeue(outbox, entry.requestId);
      } else {
        outbox = markRetry(outbox, entry.requestId, result.error ?? "retryable");
      }
    } catch {
      outbox = markRetry(outbox, entry.requestId, "network");
    }
  }

  await writeOutbox(outbox);
  await updateBadge();
}

async function handleMessage(message: unknown): Promise<unknown> {
  if (typeof message !== "object" || message === null) return { ok: false, error: "invalid_message" };
  const msg = message as Record<string, unknown>;

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
    const outbox = await readOutbox();
    return { ok: true, pending: outbox.length };
  }
  return { ok: false, error: "unknown_message" };
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

  try {
    const result = await postCapture({ baseUrl: API_BASE_URL, token }, payload);
    if (result.ok) {
      return { ok: true, duplicate: result.duplicate, publication: result.publication };
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
  const pairingCode = typeof msg.pairingCode === "string" ? msg.pairingCode : "";
  if (!pairingCode) return { ok: false, error: "invalid_message" };
  const { exchangePairingCode } = await import("../lib/api.ts");
  const result = await exchangePairingCode({ baseUrl: API_BASE_URL }, pairingCode);
  if (result.ok && result.deviceToken && result.deviceId) {
    const { setSession } = await import("../lib/storage.ts");
    await setSession(chromeStorage(), {
      token: result.deviceToken,
      deviceId: result.deviceId,
      affiliateName: result.affiliate?.displayName ?? "",
    });
    return { ok: true, affiliateName: result.affiliate?.displayName ?? "" };
  }
  return { ok: false, error: result.error ?? "exchange_failed" };
}

// Reexport para manter as funções de outbox referenciadas no bundle (evita
// tree-shake de utilitários usados por E6).
export { dequeue, markRetry };
