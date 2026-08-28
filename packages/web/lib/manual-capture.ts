/**
 * Captura manual via bookmarklet — bloco BM1.
 *
 * O bookmarklet roda na página do Mercado Livre que o humano já abriu (ação
 * humana, sem requisição automatizada — ver decisão 24/08/2026). Ele lê o DOM
 * da página, monta um payload e gera um bloco texto que o curador cola no
 * painel. Esta lib decodifica, valida e persiste o bloco.
 *
 * Formato do bloco:
 *   BM1.<payload-base64url>.<checksum-fnv1a>
 *
 * O checksum NÃO é segurança — é integridade de cópia: detecta bloco truncado
 * ou alterado na colagem manual. A autenticidade do pedido vem da sessão do
 * painel (admin), não do bloco. Cifra não esconde nada aqui (o payload é dado
 * público do ML) — decidido em 24/08 não fingir proteção que não existe.
 *
 * `source` = 'manual' distingue do sweep em `product.capture_source` (quando
 * existir). Até lá, a distinção é a ausência de capture_run vinculado.
 */

import { db } from "./db.ts";

export const MANUAL_BLOCK_VERSION = "BM1";

/** Instante mínimo plausível de captura — evita bloco com relógio descalibrado. */
const MIN_CAPTURED_AT = Date.UTC(2024, 0, 1);

/** Campos do payload extraídos pelo bookmarklet da página aberta. */
export interface ManualCapturePayload {
  /** Versão do bloco. */
  v: 1;
  /** Marketplace de origem — hoje só mercadolivre. */
  m: "mercadolivre";
  /** URL canônica do produto (href real da página aberta). */
  u: string;
  /** ID externo do anúncio (MLB...). */
  i: string;
  /** Título lido da página. */
  t: string;
  /** Preço atual em centavos. */
  p: number;
  /** Preço original/anterior em centavos (opcional). */
  op?: number;
  /** URL da imagem principal (opcional). */
  img?: string;
  /** Epoch ms em que o bookmarklet rodou. */
  c: number;
}

/** FNV-1a 32-bit — mesmo algoritmo no bookmarklet e aqui (determinístico). */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Codifica em base64url sem padding (conjunto URL-safe, sem '=' no fim). */
export function base64urlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodifica base64url (tolerante a padding ausente). */
export function base64urlDecode(value: string): string {
  let b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) b64 += "=";
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Gera um bloco BM1 a partir do payload — usado no bookmarklet e nos testes. */
export function encodeManualCaptureBlock(payload: ManualCapturePayload): string {
  const json = JSON.stringify(payload);
  const encoded = base64urlEncode(json);
  const checksum = fnv1a32(encoded).toString(16);
  return `${MANUAL_BLOCK_VERSION}.${encoded}.${checksum}`;
}

/** Valida o payload e normaliza o que for ambíguo (op = opcional). */
export function parseManualPayload(raw: unknown): ManualCapturePayload {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("bloco inválido: payload não é objeto");
  }
  const p = raw as Record<string, unknown>;

  if (p.v !== 1) throw new Error("bloco inválido: versão não suportada");
  if (p.m !== "mercadolivre") throw new Error("bloco inválido: marketplace não suportado");

  if (typeof p.u !== "string" || !/^https:\/\//.test(p.u)) {
    throw new Error("bloco inválido: URL ausente ou não é https");
  }
  let host: string;
  try {
    host = new URL(p.u).host;
  } catch {
    throw new Error("bloco inválido: URL malformada");
  }
  if (!/(^|\.)(mercadolivre\.com\.br|mercadolibre\.com)$/.test(host)) {
    throw new Error("bloco inválido: URL não é do Mercado Livre");
  }

  if (typeof p.i !== "string" || !/^MLB\d{6,}$/.test(p.i)) {
    throw new Error("bloco inválido: ID do anúncio ausente ou inválido");
  }
  if (typeof p.t !== "string" || p.t.trim().length === 0) {
    throw new Error("bloco inválido: título ausente");
  }
  if (typeof p.p !== "number" || !Number.isInteger(p.p) || p.p <= 0) {
    throw new Error("bloco inválido: preço ausente ou inválido");
  }
  if (p.op !== undefined && (typeof p.op !== "number" || !Number.isInteger(p.op) || p.op <= 0)) {
    throw new Error("bloco inválido: preço original inválido");
  }
  if (typeof p.c !== "number" || !Number.isFinite(p.c) || p.c < MIN_CAPTURED_AT) {
    throw new Error("bloco inválido: timestamp de captura ausente ou impossível");
  }

  return {
    v: 1,
    m: "mercadolivre",
    u: p.u,
    i: p.i,
    t: p.t.trim(),
    p: p.p,
    op: p.op as number | undefined,
    img: typeof p.img === "string" && p.img.length > 0 ? p.img : undefined,
    c: p.c,
  };
}

/** Decodifica e valida um bloco BM1 colado no painel. */
export function decodeManualCaptureBlock(block: string): ManualCapturePayload {
  const trimmed = block.trim();
  const parts = trimmed.split(".");
  if (parts.length !== 3 || parts[0] !== MANUAL_BLOCK_VERSION) {
    throw new Error("bloco inválido: formato esperado BM1.<dados>.<checksum>");
  }
  const [, encoded, checksum] = parts as [string, string, string];

  if (fnv1a32(encoded).toString(16) !== checksum.toLowerCase()) {
    throw new Error("bloco inválido: checksum não confere — cópia truncada ou alterada");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(base64urlDecode(encoded));
  } catch {
    throw new Error("bloco inválido: payload não é JSON válido");
  }
  return parseManualPayload(raw);
}

export interface ManualCaptureResult {
  productId: string;
  externalId: string;
  title: string;
  priceCents: number;
  originalPriceCents: number | null;
  claimedDiscountRate: number | null;
  isNew: boolean;
  previousPriceCents: number | null;
  capturedAt: Date;
}

/**
 * Persiste a captura manual: produto + observação de preço.
 *
 * Diferente do sweep, NÃO cria capture_run — a observação fica com
 * capture_run_id nulo (permitido pelo schema). Consequência de design
 * (decisão 24/08): o preço manual congela; não participa do "menor preço
 * verificado" (que exige ≥3 observações em ≥7 dias) até que o produto passe a
 * ser varrido pelo robô.
 */
export async function persistManualCapture(
  payload: ManualCapturePayload,
  tenantId = "local",
): Promise<ManualCaptureResult> {
  const capturedAt = new Date(payload.c);
  const originalPriceCents =
    payload.op !== undefined && payload.op > payload.p ? payload.op : null;
  const claimedDiscountRate =
    originalPriceCents !== null ? 1 - payload.p / originalPriceCents : null;

  const sql = db();
  try {
    const rows = await sql<{
      id: string;
      is_new: boolean;
      previous_price_cents: number | null;
    }[]>`
      with prev as (
        select id, last_price_cents
        from garimpa.product
        where tenant_id = ${tenantId}
          and marketplace = 'mercadolivre'
          and external_id = ${payload.i}
      ), up as (
        insert into garimpa.product as p
          (id, tenant_id, marketplace, external_id, title, product_url, image_url,
           last_price_cents, first_seen_at, last_seen_at)
        values (gen_random_uuid()::text, ${tenantId}, 'mercadolivre', ${payload.i},
                ${payload.t}, ${payload.u}, ${payload.img ?? null},
                ${payload.p}, ${capturedAt}, ${capturedAt})
        on conflict (tenant_id, marketplace, external_id) do update set
          title = excluded.title,
          product_url = excluded.product_url,
          image_url = coalesce(excluded.image_url, p.image_url),
          last_price_cents = excluded.last_price_cents,
          last_seen_at = excluded.last_seen_at,
          updated_at = now()
        returning id, (xmax = 0) as is_new
      ), ins as (
        insert into garimpa.price_observation
          (id, tenant_id, product_id, price_cents, original_price_cents,
           claimed_discount_rate, observed_at,
           title_snapshot, product_url_snapshot, image_url_snapshot)
        select gen_random_uuid()::text, ${tenantId}, id, ${payload.p},
               ${originalPriceCents}, ${claimedDiscountRate}, ${capturedAt},
               ${payload.t}, ${payload.u}, ${payload.img ?? null}
        from up
      )
      select up.id, up.is_new, prev.last_price_cents as previous_price_cents
      from up left join prev on true
    `;

    const row = rows[0]!;
    return {
      productId: row.id,
      externalId: payload.i,
      title: payload.t,
      priceCents: payload.p,
      originalPriceCents,
      claimedDiscountRate,
      isNew: row.is_new,
      previousPriceCents: row.previous_price_cents,
      capturedAt,
    };
  } finally {
    await sql.end();
  }
}
