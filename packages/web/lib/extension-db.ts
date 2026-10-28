/**
 * Operações de banco da extensão (E4): dispositivo, pareamento e captura
 * idempotente. A identidade (affiliate/tenant) vem SEMPRE do dispositivo
 * resolvido pelo token — nunca do payload.
 */

import { db } from "./db.ts";
import { withOwnerAccountDb } from "./owner-account-db.ts";
import { withAccountDb, withTenantDb, type AccountContext } from "./tenant-db.ts";
import { generateDeviceToken, generatePairingCode, hashPairingCode, hashToken, tokenPrefix } from "./extension-token.ts";
import { browserOfferEvidence } from "./extension-contract.ts";
import type { ExtensionCapturePayload } from "./extension-contract.ts";

export const PAIRING_TTL_MS = 10 * 60 * 1000; // 10 minutos

export interface DeviceIdentity {
  deviceId: string;
  affiliateId: string;
  tenantId: string;
  affiliatePublicSlug: string;
  affiliateDisplayName: string;
  appUserId: string;
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
 * Usa garimpa.authenticate_extension_device (SECURITY DEFINER) para resolver
 * dispositivo e tenant sem exigir policy irrestrita.
 */
export async function authenticateDevice(tokenHash: string, factory: typeof db=db): Promise<DeviceAuth> {
  const sql = factory();
  try {
    let rows: {
      device_id: string;
      affiliate_id: string;
      tenant_id: string;
      public_slug: string;
      display_name: string;
      revoked_at: string | null;
      account_status: string;
      role_active: boolean;
      app_user_id: string;
    }[] = [];
    try {
      rows = await sql<typeof rows>`
        select * from garimpa.authenticate_extension_device(${tokenHash})
      `;
    } catch {
      rows = await sql<typeof rows>`
        select d.id as device_id, d.created_by_app_user_id as app_user_id, a.id as affiliate_id, a.tenant_id, a.public_slug, a.display_name,
               d.revoked_at::text, a.status as account_status,
               exists (
                 select 1
                 from garimpa.app_user_role aur
                 join garimpa.affiliate_membership am
                   on am.app_user_id = aur.app_user_id
                  and am.affiliate_id = d.affiliate_id
                 where aur.app_user_id = d.created_by_app_user_id
                   and aur.role = 'afiliado'::garimpa.app_role
                   and aur.revoked_at is null
                   and am.revoked_at is null
               ) as role_active
        from garimpa.extension_device d
        join garimpa.affiliate_account a on a.id = d.affiliate_id
        where d.token_hash = ${tokenHash}
        limit 1
      `;
    }
    const row = rows[0];
    if (!row) return { kind: "unknown" };
    if (row.revoked_at !== null || row.account_status !== "active" || !row.role_active) {
      return { kind: "revoked" };
    }
    return {
      kind: "ok",
      device: {
        deviceId: row.device_id,
        affiliateId: row.affiliate_id,
        tenantId: row.tenant_id,
        affiliatePublicSlug: row.public_slug,
        affiliateDisplayName: row.display_name,
        appUserId: row.app_user_id,
      },
    };
  } finally {
    await sql.end();
  }
}

/** Cria um dispositivo pendente com código de pareamento de uso único. */
export async function createPairingCode(input: {
  appUserId: string;
  deviceName: string;
}, factory: typeof db=db): Promise<{ deviceId: string; pairingCode: string; expiresAt: Date }> {
  return withOwnerAccountDb(input.appUserId, async (sql,affiliateId) => {
    const code = generatePairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);

    // Invalida códigos pendentes anteriores do mesmo dispositivo/usuário.
    await sql`
      update garimpa.extension_device
      set pairing_code_hash = null, pairing_expires_at = null
      where created_by_app_user_id = ${input.appUserId} and affiliate_id=${affiliateId}
        and pairing_code_hash is not null
    `;

    const rows = await sql<{ id: string }[]>`
      insert into garimpa.extension_device
        (affiliate_id, created_by_app_user_id, name, pairing_code_hash, pairing_expires_at)
      select am.affiliate_id, ${input.appUserId}, ${input.deviceName},
             ${hashPairingCode(code)}, ${expiresAt}
      from garimpa.affiliate_membership am
      join garimpa.affiliate_account a
        on a.id = am.affiliate_id and a.status = 'active'
      join garimpa.app_user_role aur
        on aur.app_user_id = am.app_user_id
       and aur.role = 'afiliado'::garimpa.app_role
       and aur.revoked_at is null
      where am.app_user_id = ${input.appUserId} and am.affiliate_id=${affiliateId} and am.role='owner'
        and am.revoked_at is null
      order by (am.role = 'owner') desc, am.created_at asc
      limit 1
      returning id
    `;

    if (!rows[0]) throw new Error("affiliate_access_required");

    return { deviceId: rows[0]!.id, pairingCode: code, expiresAt };
  }, factory);
}

/**
 * Troca um código de pareamento por token. Atômica: código válido, não
 * consumido, dentro do prazo; grava hash do token, limpa o código e marca
 * paired_at. Código inválido/expirado → mensagem genérica (não vaza estado).
 */
export async function exchangePairingCode(pairingCode: string, factory: typeof db=db): Promise<ExchangeResult | null> {
  const sql = factory();
  try {
    return await sql.begin(async (tx) => {
      const token = generateDeviceToken();
      const rows = await tx<{device_id:string;display_name:string}[]>`
        select * from garimpa.exchange_extension_pairing(${hashPairingCode(pairingCode)},${hashToken(token)},${tokenPrefix(token)})`;
      const row = rows[0];
      if (!row) return null;
      return { deviceId: row.device_id, deviceToken: token, affiliate: { displayName: row.display_name } };
    });
  } catch { throw new Error("extension_pairing_failed"); } finally {
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
  sqlFactory: typeof db = db,
): Promise<CaptureWriteResult> {
  const p = payload.product;
  const clientCapturedAt = new Date(payload.clientCapturedAt);
  const originalPriceCents = p.originalPriceCents !== undefined && p.originalPriceCents > p.priceCents ? p.originalPriceCents : null;
  const claimedDiscountRate = originalPriceCents !== null ? 1 - p.priceCents / originalPriceCents : null;
  const slug = `ml-${p.externalId}-${device.affiliatePublicSlug}`;

  const context: AccountContext = {
    tenantId: device.tenantId,
    affiliateId: device.affiliateId,
    actor: "device",
    actorAppUserId: device.appUserId,
    authenticatedAuthUserId: null,
    membershipRole: "operator",
    requestId: payload.requestId,
  };

  return await withAccountDb(context, async (tx) => {
      // Revalida dentro da transação para que revogação de role, membership,
      // conta ou dispositivo interrompa também um request já autenticado.
      const access = await tx<{ allowed: boolean }[]>`
        select exists (
          select 1
          from garimpa.extension_device d
          join garimpa.affiliate_account a
            on a.id = d.affiliate_id and a.status = 'active'
          join garimpa.affiliate_membership am
            on am.affiliate_id = d.affiliate_id
           and am.app_user_id = d.created_by_app_user_id
          join garimpa.app_user_role aur
            on aur.app_user_id = d.created_by_app_user_id
           and aur.role = 'afiliado'::garimpa.app_role
           and aur.revoked_at is null
           and am.revoked_at is null
          where d.id = ${device.deviceId}
            and d.revoked_at is null
            and d.affiliate_id = ${device.affiliateId} and d.created_by_app_user_id=${device.appUserId} and a.tenant_id=${device.tenantId}
        ) as allowed
      `;
      if (!access[0]?.allowed) throw new Error("affiliate_access_required");

      // Serialize retries before touching the product. Reusing a request ID
      // cannot overwrite the product while retaining an older observation.
      await tx`select pg_advisory_xact_lock(hashtextextended(${`extension-capture:${device.deviceId}:${payload.requestId}`},0))`;
      const [previousRequest] = await tx<{id:string;product_id:string;external_id:string}[]>`
        select o.id,o.product_id,product.external_id from garimpa.price_observation o
        join garimpa.product product on product.id=o.product_id and product.tenant_id=o.tenant_id
        where o.tenant_id=${device.tenantId} and o.extension_device_id=${device.deviceId}
          and o.client_request_id=${payload.requestId}::uuid limit 1`;
      if(previousRequest) return {ok:true,duplicate:true,productId:previousRequest.product_id,
        observationId:previousRequest.id,publication:{slug:`ml-${previousRequest.external_id}-${device.affiliatePublicSlug}`}};


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
           source_page_url, client_captured_at, title_snapshot, product_url_snapshot, image_url_snapshot, offer_evidence)
        select gen_random_uuid()::text, ${device.tenantId}, ${productId}, ${p.priceCents},
               ${originalPriceCents}, ${claimedDiscountRate}, now(),
               'extension', ${device.deviceId}, ${payload.requestId}::uuid,
               ${payload.page.url}, ${clientCapturedAt}, ${p.title}, ${p.productUrl}, ${p.imageUrl ?? null},
               ${tx.json({ ...browserOfferEvidence(p, p.productUrl, payload.clientCapturedAt) } as any)}
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
      const [touched]=await tx<{ok:boolean}[]>`select garimpa.touch_extension_device(${device.deviceId}) as ok`;
      if(!touched?.ok)throw new Error('affiliate_access_required');

      return { ok: true, duplicate, productId, observationId, publication: { slug } };
    }, sqlFactory);
}
