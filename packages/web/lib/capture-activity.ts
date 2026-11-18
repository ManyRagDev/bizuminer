import { createHash } from "node:crypto";

export const captureOrigins = ["manual", "batch", "run", "individual"] as const;
export type CaptureOrigin = typeof captureOrigins[number];
export const captureStates = ["saved", "running", "ok", "partial", "error"] as const;
export const captureStores = ["mercadolivre", "amazon", "aliexpress", "shopee"] as const;
export class CaptureInputError extends Error { constructor() { super("invalid_capture_filter"); } }
const invalid = (): never => { throw new CaptureInputError(); };
export const record = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
export const count = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
export const instant = (value: unknown): string | null => (typeof value === "string" || value instanceof Date)
  && Number.isFinite(+new Date(value)) ? new Date(value).toISOString() : null;

export function captureReference(value: unknown): { reference: string; kind: CaptureOrigin; id: string; requestId?: string } {
  if (typeof value !== "string" || value.length > 400 || /[\x00-\x20/?#]/.test(value)) return invalid();
  const separator = value.indexOf(":"), kind = value.slice(0, separator) as CaptureOrigin, id = value.slice(separator + 1);
  if (!captureOrigins.includes(kind) || !id || id.length > 300) return invalid();
  if (kind === "manual") {
    const split = id.lastIndexOf(":"), device = id.slice(0, split), requestId = id.slice(split + 1);
    if (!device || device.length > 160 || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/.test(requestId)) return invalid();
    return { reference: value, kind, id: device, requestId };
  }
  if (kind === "batch" && !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/.test(id)) return invalid();
  return { reference: value, kind, id };
}

/** Page and route-handler params may differ in decoding across Next transports.
 * Normalize exactly one path segment before strict identity validation. */
export function capturePathReference(value:unknown):string {
  if(typeof value!=='string'||value.length>1200)return invalid();
  let decoded:string;try{decoded=decodeURIComponent(value);}catch{return invalid();}
  if(decoded.includes('%'))return invalid();
  return captureReference(decoded).reference;
}

function option(value: unknown, allowed: readonly string[]) {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || !allowed.includes(value)) return invalid();
  return value;
}
function day(value: unknown) {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString().slice(0,10) !== value) return invalid();
  return value;
}
export function captureFilters(input: Record<string, unknown> = {}, defaultLimit = 30) {
  const from = day(input.de), to = day(input.ate);
  if (from && to && from > to) return invalid();
  const reference = input.referencia === undefined || input.referencia === "" ? null : input.referencia;
  if (reference !== null && (typeof reference !== "string" || reference.length > 400 || /[\x00-\x1f]/.test(reference))) return invalid();
  const limit = input.limite === undefined || input.limite === "" ? defaultLimit : Number(input.limite);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return invalid();
  return { store: option(input.loja, captureStores), origin: option(input.origem, captureOrigins),
    purpose: option(input.finalidade, ["capturas", "internas", "todas"]) ?? "capturas",
    state: option(input.situacao, captureStates), from, to, reference: reference as string | null, limit };
}
export type CaptureFilters = ReturnType<typeof captureFilters>;
export function captureQuery(params:URLSearchParams):Record<string,string> {
  for(const key of params.keys()) if(params.getAll(key).length!==1) return invalid();
  return Object.fromEntries(params);
}
export function captureCursor(scope: unknown, position: unknown) {
  return Buffer.from(JSON.stringify({ v: 1, scope: cursorScope(scope), position })).toString("base64url");
}
function cursorScope(scope: unknown) { return createHash("sha256").update(JSON.stringify(scope)).digest("hex"); }
export function decodeCaptureCursor(value: unknown, scope: unknown): Record<string, any> | null {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 2000 || !/^[\w-]+$/.test(value)) return invalid();
  try {
    const raw = Buffer.from(value, "base64url");
    if (raw.toString("base64url") !== value) return invalid();
    const parsed = JSON.parse(raw.toString("utf8"));
    if (parsed.v !== 1 || parsed.scope !== cursorScope(scope) || !parsed.position || typeof parsed.position !== "object") return invalid();
    return parsed.position;
  } catch { return invalid(); }
}
export function captureListHref(tenantId: string, input: Record<string, unknown> = {}) {
  const query = new URLSearchParams({ conta: tenantId });
  for (const key of ["loja", "origem", "finalidade", "situacao", "de", "ate", "referencia", "depois", "limite"])
    if (typeof input[key] === "string" && input[key]) query.set(key, input[key] as string);
  return `/admin/capturas?${query}`;
}
export function captureDetailHref(reference: string, tenantId: string, input: Record<string, unknown> = {}) {
  const query = new URLSearchParams({ conta: tenantId });
  for (const key of ["loja", "origem", "finalidade", "situacao", "de", "ate", "referencia", "depois", "limite", "produtosDepois", "buscasDepois"])
    if (typeof input[key] === "string" && input[key]) query.set(key, input[key] as string);
  return `/admin/capturas/${encodeURIComponent(reference)}?${query}`;
}
export const captureStateLabels: Record<string,string> = { saved: "Importação salva", running: "Execução não encerrada", ok: "Concluída", partial: "Concluída com pendências", error: "Encerrada com falha" };
export const captureOriginLabels: Record<CaptureOrigin,string> = { manual: "Extensão · importação manual", batch: "Lote de captura", run: "Execução avulsa", individual: "Registro individual" };
export const captureValidationLabels:Record<string,string>={duplicate_external_id:'O mesmo anúncio apareceu mais de uma vez',product_invalid:'Dados do produto inválidos',
  product_id_invalid:'Identificador do anúncio inválido',product_title_invalid:'Título inválido',product_url_invalid:'Endereço do anúncio inválido',
  product_identity_invalid:'O endereço não corresponde ao anúncio',product_price_invalid:'Preço inválido',product_original_price_invalid:'Preço anterior inválido',
  product_price_range_invalid:'Faixa de preços inválida',image_url_invalid:'Endereço da imagem inválido'};
export const captureDate = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Não registrado";

const knownIssues: Record<string,string> = {
  affiliate_links_pending: "O recebimento terminou, mas há vínculos afiliados pendentes.",
  execution_timeout: "O prazo registrado de execução terminou.", capture_batch_timeout: "O prazo registrado do lote terminou.",
  credential_rejected: "A conexão da loja precisa ser conferida.", capture_failed: "A captura registrou uma falha.",
};
export function captureIssue(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return knownIssues[value] ?? "Há um problema registrado nesta execução; o diagnóstico detalhado não está disponível nesta tela.";
}
