/**
 * Operações de banco da extensão (E4): dispositivo, pareamento e captura
 * idempotente. A identidade (affiliate/tenant) vem SEMPRE do dispositivo
 * resolvido pelo token — nunca do payload.
 */

import { db } from "./db.ts";
import { generateDeviceToken, generatePairingCode, hashPairingCode, hashToken, tokenPrefix } from "./extension-token.ts";
import type { ExtensionCapturePayload } from "./extension-contract.ts";

export const PAIRING_TTL_MS = 10 * 60 * 1000; // 10 minutos

export interface DeviceIdentity {
  deviceId: string;
  affiliateId: string;
  tenantId: string;
  affiliatePublicSlug: string;
  affiliateDisplayName: string;
}

export type DeviceAuth =
  | { kind: "ok"; device: DeviceIdentity }
  | { kind: "revoked" }
  | { kind: "unknown" };

export interface ExchangeResult {
  deviceId: string;
  deviceToken: string;
  affiliate: { displayName: string };
}

export interface CaptureWriteResult {
  ok: boolean;
  duplicate: boolean;
  productId: string;
  observationId: string;
  publication: { slug: string };
}

/**
 * Autentica o token do dispositivo (hash). Distingue revogado (403) de
 * desconhecido (401) para a borda responder o status correto.
 */
export async function authenticateDevice(tokenHash: string): Promise<DeviceAuth> {
  const sql = db();
  try {
    const rows = await sql<{
      device_id: string;
      affiliate_id: string;
      tenant_id: string;
      public_slug: string;
      display_name: string;
      revoked_at: string | null;
    }[]>`
      select d.id as device_id, a.id as affiliate_id, a.tenant_id, a.public_slug, a.display_name,
             d.revoked_at::text
      from garimpa.extension_device d
      join garimpa.affiliate_account a on a.id = d.affiliate_id
      where d.token_hash = ${tokenHash}
      limit 1
    `;
    const row = rows[0];
    if (!row) return { kind: "unknown" };
    if (row.revoked_at !== null) return { kind: "revoked" };
    return {
      kind: "ok",
      device: {
        deviceId: row.device_id,
        affiliateId: row.affiliate_id,
        tenantId: row.tenant_id,
        affiliatePublicSlug: row.public_slug,
        affiliateDisplayName: row.display_name,
      },
    };
  } finally {
    await sql.end();
  }
}

/** Cria um dispositivo pendente com código de pareamento de uso único. */
export async function createPairingCode(input: {
  affiliateId: string;
  appUserId: string;
  deviceName: string;
}): Promise<{ deviceId: string; pairingCode: string; expiresAt: Date }> {
  const sql = db();
  try {
    const code = generatePairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);

    // Invalida códigos pendentes anteriores do mesmo dispositivo/usuário.
    await sql`
      update garimpa.extension_device
      set pairing_code_hash = null, pairing_expires_at = null
      where created_by_app_user_id = ${input.appUserId}
        and affiliate_id = ${input.affiliateId}
        and pairing_code_hash is not null
    `;

    const rows = await sql<{ id: string }[]>`
      insert into garimpa.extension_device
        (affiliate_id, created_by_app_user_id, name, pairing_code_hash, pairing_expires_at)
      values (${input.affiliateId}, ${input.appUserId}, ${input.deviceName},
              ${hashPairingCode(code)}, ${expiresAt})
      returning id
    `;

    return { deviceId: rows[0]!.id, pairingCode: code, expiresAt };
  } finally {
    await sql.end();
  }
}

/**
 * Troca um código de pareamento por token. Atômica: código válido, não
 * consumido, dentro do prazo; grava hash do token, limpa o código e marca
 * paired_at. Código inválido/expirado → mensagem genérica (não vaza estado).
 */
export async function exchangePairingCode(pairingCode: string): Promise<ExchangeResult | null> {
  const sql = db();
  try {
    return await sql.begin(async (tx) => {
      const token = generateDeviceToken();
      const rows = await tx<{
        device_id: string;
        display_name: string;
      }[]>`
        update garimpa.extension_device
        set token_hash = ${hashToken(token)},
            token_prefix = ${tokenPrefix(token)},
            pairing_code_hash = null,
            pairing_expires_at = null,
            paired_at = now(),
            revoked_at = null
        where pairing_code_hash = ${hashPairingCode(pairingCode)}
          and pairing_expires_at > now()
          and token_hash is null
        returning id as device_id,
                  (select a.display_name from garimpa.affiliate_account a where a.id = garimpa.extension_device.affiliate_id) as display_name
      `;
      const row = rows[0];
      if (!row) return null;
      return { deviceId: row.device_id, deviceToken: token, affiliate: { displayName: row.display_name } };
    });
  } finally {
    await sql.end();
  }
}

/**
 * Captura idempotente: produto + observação + publicação numa transação.
 * Retry com o mesmo requestId devolve o mesmo resultado sem nova observação
 * (única por (extension_device_id, client_request_id)).
 */
export async function persistExtensionCapture(
  device: DeviceIdentity,
  payload: ExtensionCapturePayload,
): Promise<CaptureWriteResult> {
  const sql = db();
  const p = payload.product;
  const clientCapturedAt = new Date(payload.clientCapturedAt);
  const originalPriceCents = p.originalPriceCents !== undefined && p.originalPriceCents > p.priceCents ? p.originalPriceCents : null;
  const claimedDiscountRate = originalPriceCents !== null ? 1 - p.priceCents / originalPriceCents : null;
  const slug = `ml-${p.externalId}-${device.affiliatePublicSlug}`;

  try {
    return await sql.begin(async (tx) => {
      // 1. produto (upsert por tenant+marketplace+external_id)
      const product = await tx<{ id: string; is_new: boolean }[]>`
        insert into garimpa.product as prod
          (id, tenant_id, marketplace, external_id, title, product_url, image_url,
           last_price_cents, first_seen_at, last_seen_at)
        values (gen_random_uuid()::text, ${device.tenantId}, 'mercadolivre', ${p.externalId},
                ${p.title}, ${p.productUrl}, ${p.imageUrl ?? null},
                ${p.priceCents}, ${clientCapturedAt}, ${clientCapturedAt})
        on conflict (tenant_id, marketplace, external_id) do update set
          title = excluded.title,
          product_url = excluded.product_url,
          image_url = coalesce(excluded.image_url, prod.image_url),
          last_price_cents = excluded.last_price_cents,
          last_seen_at = excluded.last_seen_at,
          updated_at = now()
        returning id, (xmax = 0) as is_new
      `;
      const productId = product[0]!.id;

      // 2. observação (idempotente por device+requestId)
      const insertedObs = await tx<{ id: string }[]>`
        insert into garimpa.price_observation
          (id, tenant_id, product_id, price_cents, original_price_cents, claimed_discount_rate,
           observed_at, capture_source, extension_device_id, client_request_id,
           source_page_url, client_captured_at, title_snapshot, product_url_snapshot, image_url_snapshot)
        select gen_random_uuid()::text, ${device.tenantId}, ${productId}, ${p.priceCents},
               ${originalPriceCents}, ${claimedDiscountRate}, now(),
               'extension', ${device.deviceId}, ${payload.requestId}::uuid,
               ${payload.page.url}, ${clientCapturedAt}, ${p.title}, ${p.productUrl}, ${p.imageUrl ?? null}
        on conflict (extension_device_id, client_request_id)
          where extension_device_id is not null and client_request_id is not null
        do nothing
        returning id
      `;

      let observationId: string;
      let duplicate = false;
      if (insertedObs.length > 0) {
        observationId = insertedObs[0]!.id;
      } else {
        duplicate = true;
        const existing = await tx<{ id: string }[]>`
          select id from garimpa.price_observation
          where extension_device_id = ${device.deviceId}
            and client_request_id = ${payload.requestId}::uuid
          limit 1
        `;
        observationId = existing[0]!.id;
      }

      // 3. publicação nasce na captura (não no primeiro clique) — E3.
      await tx`
        insert into garimpa.publication (id, tenant_id, product_id, affiliate_id, channel, slug)
        values (gen_random_uuid()::text, ${device.tenantId}, ${productId}, ${device.affiliateId}, 'web', ${slug})
        on conflict (affiliate_id, product_id, channel) do nothing
      `;

      // 4. marca uso do dispositivo.
      await tx`
        update garimpa.extension_device set last_used_at = now() where id = ${device.deviceId}
      `;

      return { ok: true, duplicate, productId, observationId, publication: { slug } };
    });
  } finally {
    await sql.end();
  }
}
