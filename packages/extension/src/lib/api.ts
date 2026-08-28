/**
 * Cliente HTTP da extensão (E5). Fala apenas com a API do BizuMiner — nunca
 * com Supabase. `fetchImpl` injetável para teste; `baseUrl`/`token` vêm do
 * storage, não de segredo embutido no bundle.
 */

import type { CapturePayload, CaptureResult, PairExchangeResult } from "./contracts.ts";

export interface ApiClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export function postCapture(opts: ApiClientOptions, payload: CapturePayload): Promise<CaptureResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return fetchImpl(`${opts.baseUrl}/api/extension/captures`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      "Idempotency-Key": payload.requestId,
    },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    const body = (await response.json()) as CaptureResult;
    return { ...body, ok: response.status >= 200 && response.status < 300 && body.ok === true };
  });
}

export function exchangePairingCode(opts: ApiClientOptions, pairingCode: string): Promise<PairExchangeResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return fetchImpl(`${opts.baseUrl}/api/extension/pair/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairingCode }),
  }).then(async (response) => {
    const body = (await response.json()) as PairExchangeResult;
    return { ...body, ok: response.status >= 200 && response.status < 300 && body.ok === true };
  });
}
