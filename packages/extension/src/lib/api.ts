/** Bounded requests to the build-bound API. Redirects never forward credentials. */
import type { CapturePayload, CaptureResult, PairExchangeResult } from "./contracts.ts";

export interface ApiClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}
export interface DeliveryResult {
  ok: boolean;
  error?: string;
  status?: number;
  retryable?: boolean;
  retryAfterMs?: number;
  importedCount?: number;
  duplicate?: boolean;
  [key: string]: unknown;
}
export const REQUEST_TIMEOUT_MS = 20_000;
export async function getJson(opts: ApiClientOptions, path: string): Promise<DeliveryResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let status: number | undefined;
  let retryDelay: number | undefined;
  const timeout = new Promise<DeliveryResult>(resolve => { timer=setTimeout(() => { controller.abort(); resolve({ok:false,error:"timeout",status,
    retryable:status === undefined || status===408 || status===429 || status>=500 || status>=200 && status<300,retryAfterMs:retryDelay}); },opts.timeoutMs ?? REQUEST_TIMEOUT_MS); });
  const work = async ():Promise<DeliveryResult> => {
    try {
      const response=await (opts.fetchImpl ?? fetch)(`${opts.baseUrl}${path}`,{method:"GET",redirect:"error",credentials:"omit",cache:"no-store",
        signal:controller.signal,headers:{...(opts.token ? {Authorization:`Bearer ${opts.token}`} : {})}});
      status=response.status;
      retryDelay=retryAfterMs(response.headers.get("retry-after"));
      const text=await response.text();
      if (text.length>1_000_000) throw new Error("invalid_response");
      const data:unknown=JSON.parse(text);
      if (!data || typeof data!=="object" || Array.isArray(data)) throw new Error("invalid_response");
      const result=data as DeliveryResult;
      return {...result,ok:response.ok && result.ok===true,status:response.status,
        retryable:response.status===408 || response.status===429 || response.status>=500 || response.ok && result.ok!==true,retryAfterMs:retryDelay};
    } catch { return {ok:false,error:status === undefined ? "network" : "invalid_response",status,
      retryable:status === undefined || status===408 || status===429 || status>=500 || status>=200 && status<300,retryAfterMs:retryDelay}; }
  };
  try { return await Promise.race([work(),timeout]); } finally {clearTimeout(timer);controller.abort();}
}
export function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const delay = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(0, delay) : undefined;
}
export async function postJson(opts: ApiClientOptions, path: string, payload: unknown, requestId?: string): Promise<DeliveryResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let status: number | undefined;
  let retryDelay: number | undefined;
  const retryableStatus = () => status === undefined || status === 408 || status === 429 || status >= 500 || (status >= 200 && status < 300);
  const timeout = new Promise<DeliveryResult>(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false, error: "timeout", status, retryable: retryableStatus(), retryAfterMs: retryDelay });
    }, opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
  });
  const work = async (): Promise<DeliveryResult> => {
    try {
      const response = await (opts.fetchImpl ?? fetch)(`${opts.baseUrl}${path}`, {
        method: "POST", redirect: "error", credentials: "omit", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
          ...(requestId ? { "Idempotency-Key": requestId } : {}) },
        body: JSON.stringify(payload),
      });
      status = response.status;
      retryDelay = retryAfterMs(response.headers.get("retry-after"));
      const raw = await response.text();
      if (raw.length > 1_000_000) throw new Error("invalid_response");
      const body: unknown = JSON.parse(raw);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_response");
      const data = body as DeliveryResult;
      return { ...data, ok: response.ok && data.ok === true, status,
        error: typeof data.error === "string" ? data.error.slice(0, 160) : data.ok === true && response.ok ? undefined : "invalid_response",
        retryable: status === 408 || status === 429 || status >= 500 || (response.ok && data.ok !== true), retryAfterMs: retryDelay };
    } catch {
      return { ok: false, error: status ? "invalid_response" : "network", status,
        retryable: retryableStatus(), retryAfterMs: retryDelay };
    }
  };
  try { return await Promise.race([work(), timeout]); }
  finally { clearTimeout(timer); }
}
export async function postCapture(opts: ApiClientOptions, payload: CapturePayload): Promise<CaptureResult & DeliveryResult> {
  const result = await postJson(opts, "/api/extension/captures", { ...payload, mode: "manual" }, payload.requestId);
  if (result.ok && (typeof result.productId !== "string" || !result.productId)) return { ok: false, error: "invalid_response", retryable: true };
  return result as CaptureResult & DeliveryResult;
}
export async function exchangePairingCode(opts: ApiClientOptions, pairingCode: string): Promise<PairExchangeResult & DeliveryResult> {
  const result = await postJson(opts, "/api/extension/pair/exchange", { pairingCode });
  if (result.ok && (typeof result.deviceId !== "string" || !result.deviceId || typeof result.deviceToken !== "string" || !result.deviceToken.startsWith("bm_ext_")))
    return { ok: false, error: "invalid_response" };
  return result as PairExchangeResult & DeliveryResult;
}
