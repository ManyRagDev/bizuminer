/**
 * Operações de banco da extensão (E4): dispositivo, pareamento e captura
 * idempotente. A identidade (affiliate/tenant) vem SEMPRE do dispositivo
 * resolvido pelo token — nunca do payload.
 */

import { createHash } from "node:crypto";
import type postgres from "postgres";
import { extensionCaptureMode, type ExtensionCaptureMode } from "./flags.ts";
import type { BrowserCapturePayload, BrowserCaptureProduct, BrowserCaptureDiagnostics } from "./browser-capture-contract.ts";
import { db } from "./db.ts";
import { withOwnerAccountDb } from "./owner-account-db.ts";
import { withAccountDb, withTenantDb, type AccountContext } from "./tenant-db.ts";
import { generateDeviceToken, generatePairingCode, hashPairingCode, hashToken, tokenPrefix } from "./extension-token.ts";
import { browserOfferEvidence } from "./extension-contract.ts";
import { pageObservationMethod, sourcePageUrl } from "../../capture/src/source-page-url.ts";
import { productSlug } from "./marketplaces.ts";
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
  created?: boolean;
  productId: string;
  observationId: string;
  publication: { slug: string } | null;
  mode: ExtensionCaptureMode;
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

/** One transaction owns device revalidation, writes and the final revocation check. */
export async function withDeviceCapture<T>(device: DeviceIdentity, requestId: string,
  write: (tx: postgres.TransactionSql) => Promise<T>, sqlFactory: typeof db = db, readOnly = false): Promise<T> {
  const context: AccountContext = {
    tenantId: device.tenantId, affiliateId: device.affiliateId, actor: "device",
    actorAppUserId: device.appUserId, authenticatedAuthUserId: null,
    membershipRole: "operator", requestId,
  };
  return withAccountDb(context, async (tx) => {
      await tx`select set_config('garimpa.device_id',${device.deviceId},true)`;
      // Revalida dentro da transação para que revogação de role, membership,
      // conta ou dispositivo interrompa também um request já autenticado.
      const access = await tx<{ allowed: boolean }[]>`
        select true as allowed
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
          for share of a
      `;
      if (!access[0]?.allowed) throw new Error("affiliate_access_required");
    // The existing scoped DEFINER function locks the device without granting
    // owner-only device/membership updates to the caller. Recheck before commit.
    if (!readOnly) {
      const [started] = await tx<{ok:boolean}[]>`select garimpa.touch_extension_device(${device.deviceId}) as ok`;
      if (!started?.ok) throw new Error("affiliate_access_required");
    }

    const result = await write(tx);
    if (!readOnly) {
      const [touched] = await tx<{ok:boolean}[]>`select garimpa.touch_extension_device(${device.deviceId}) as ok`;
      if (!touched?.ok) throw new Error("affiliate_access_required");
    }
    return result;
  }, sqlFactory);
}

export async function persistCaptureItem(tx: postgres.TransactionSql, device: DeviceIdentity,
  payload: ExtensionCapturePayload, mode: ExtensionCaptureMode): Promise<CaptureWriteResult> {
  const p = payload.product as BrowserCaptureProduct;
  const clientCapturedAt = new Date(payload.clientCapturedAt);
  const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const originalPriceCents = p.originalPriceCents !== undefined && p.originalPriceCents > p.priceCents ? p.originalPriceCents : null;
  const claimedDiscountRate = originalPriceCents !== null ? 1 - p.priceCents / originalPriceCents : null;
  const slug = `${productSlug(payload.marketplace,p.externalId)}-${device.affiliatePublicSlug}`;
  const existingPublication=async (productId:string) => {
    const [row]=await tx<{slug:string}[]>`select slug from garimpa.publication where tenant_id=${device.tenantId}
      and affiliate_id=${device.affiliateId} and product_id=${productId} and channel='web' limit 1`;
    return row ? {slug:row.slug} : null;
  };

      // Serialize retries before touching the product. Reusing a request ID
      // cannot overwrite the product while retaining an older observation.
      await tx`select pg_advisory_xact_lock(hashtextextended(${`extension-capture:${device.deviceId}:${payload.requestId}`},0))`;
      const [previousRequest] = await tx<{id:string;product_id:string;external_id:string;capture_payload_fingerprint:string|null}[]>`
        select o.id,o.product_id,product.external_id,o.capture_payload_fingerprint from garimpa.price_observation o
        join garimpa.product product on product.id=o.product_id and product.tenant_id=o.tenant_id
        where o.tenant_id=${device.tenantId} and o.extension_device_id=${device.deviceId}
          and o.client_request_id=${payload.requestId}::uuid limit 1`;
      if(previousRequest) {
        if (previousRequest.capture_payload_fingerprint && previousRequest.capture_payload_fingerprint !== fingerprint)
          throw new Error("capture_request_conflict");
        return {ok:true,duplicate:true,productId:previousRequest.product_id,
          observationId:previousRequest.id,mode,publication:mode === "durable" ? await existingPublication(previousRequest.product_id) : null};
      }

      // The browser timestamp is evidence, but it must not move the current
      // product clock into the future. Use the same bounded instant for the
      // product and its observation, including delayed captures.
      const [clock]=await tx<{fact_at:Date}[]>`select least(clock_timestamp(),${clientCapturedAt}::timestamptz) as fact_at`;
      const factAt=clock!.fact_at;

      // 1. produto (upsert por tenant+marketplace+external_id)
      const product = await tx<{ id: string; is_new: boolean }[]>`
        insert into garimpa.product as prod
          (id, tenant_id, marketplace, external_id, title, product_url, image_url,
           last_price_cents, first_seen_at, last_seen_at)
        values (gen_random_uuid()::text, ${device.tenantId}, ${payload.marketplace}, ${p.externalId},
                ${p.title}, ${p.productUrl}, ${p.imageUrl ?? null},
                ${p.priceCents}, ${factAt}, ${factAt})
        on conflict (tenant_id, marketplace, external_id) do update set
          title = excluded.title,
          product_url = excluded.product_url,
          image_url = coalesce(excluded.image_url, prod.image_url),
          last_price_cents = excluded.last_price_cents,
          last_seen_at = excluded.last_seen_at,
          updated_at = now()
        where excluded.last_seen_at > prod.last_seen_at
        returning id, (xmax = 0) as is_new
      `;
      // A delayed request still contributes history, but cannot replace newer facts.
      const saved = product[0] ?? (await tx<{ id: string; is_new: boolean }[]>`
        select id,false as is_new from garimpa.product where tenant_id=${device.tenantId}
          and marketplace=${payload.marketplace} and external_id=${p.externalId}`)[0];
      if (!saved) throw new Error("capture_product_missing");
      const productId = saved.id;

      await tx`insert into garimpa.product_curation(tenant_id,product_id,status)
        values(${device.tenantId},${productId},'pending') on conflict(tenant_id,product_id) do nothing`;

      // 2. observação (idempotente por device+requestId)
      const insertedObs = await tx<{ id: string }[]>`
        insert into garimpa.price_observation
          (id, tenant_id, product_id, price_cents, original_price_cents, claimed_discount_rate,
           observed_at, capture_source, extension_device_id, client_request_id,
           source_page_url, client_captured_at, title_snapshot, product_url_snapshot, image_url_snapshot, rating_star, sales_count, sales_label, offer_evidence, capture_payload_fingerprint)
        select gen_random_uuid()::text, ${device.tenantId}, ${productId}, ${p.priceCents},
               ${originalPriceCents}, ${claimedDiscountRate}, ${factAt},
               'extension', ${device.deviceId}, ${payload.requestId}::uuid,
               ${payload.page.url}, ${clientCapturedAt}, ${p.title}, ${p.productUrl}, ${p.imageUrl ?? null},
               ${p.ratingStar ?? null}, ${p.salesCount ?? null}, ${p.salesLabel ?? null},
               ${tx.json({ ...browserOfferEvidence(p, p.productUrl, payload.clientCapturedAt, payload.marketplace,
                 pageObservationMethod(payload.marketplace, payload.page, p.externalId)) } as any)}, ${fingerprint}
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

      // Manual capture only records evidence for human curation.
      if (mode === "durable") await tx`
        insert into garimpa.publication (id, tenant_id, product_id, affiliate_id, channel, slug)
        values (gen_random_uuid()::text, ${device.tenantId}, ${productId}, ${device.affiliateId}, 'web', ${slug})
        on conflict (affiliate_id, product_id, channel) do nothing
      `;

  return { ok: true, duplicate, created: !duplicate && saved.is_new, productId, observationId, mode,
    publication: mode === "durable" ? await existingPublication(productId) : null };
}

/** Manual is the default; only explicit durable mode retains legacy publication. */
export async function persistExtensionCapture(device: DeviceIdentity, payload: ExtensionCapturePayload,
  sqlFactory: typeof db = db, mode: ExtensionCaptureMode | null = extensionCaptureMode()): Promise<CaptureWriteResult> {
  if (!mode) throw new Error("extension_capture_mode_invalid");
  return withDeviceCapture(device, payload.requestId,
    tx => persistCaptureItem(tx, device, payload, mode), sqlFactory);
}

/** Stable per-item identity reuses the existing device/request unique observation key. */
export function manualExtensionItemRequestId(deviceId: string, requestId: string, marketplace: string, externalId: string): string {
  const digest = createHash("sha256").update(JSON.stringify(["extension-manual-v1", deviceId, requestId.toLowerCase(), marketplace, externalId])).digest();
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.subarray(0,16).toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

/** All normalized products commit together; no capture job, publication or AI is created. */
export async function persistManualExtensionBatch(device: DeviceIdentity, payload: BrowserCapturePayload,
  sqlFactory: typeof db = db, diagnostics?: BrowserCaptureDiagnostics) {
  return withDeviceCapture(device, payload.requestId, async tx => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${`extension-manual-batch:${device.deviceId}:${payload.requestId.toLowerCase()}`},0))`;
    const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const [receipt] = await tx<{ fingerprint: string; result: { productIds: string[] } }[]>`
      select fingerprint,result from garimpa.extension_capture_receipt where tenant_id=${device.tenantId}
        and device_id=${device.deviceId} and request_id=${payload.requestId}::uuid`;
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw new Error("capture_request_conflict");
      return { ok: true as const, mode: "manual" as const, importedCount: 0, duplicate: true, productIds: receipt.result.productIds,
        receiptRef: `manual:${device.deviceId}:${payload.requestId.toLowerCase()}`, replayed: true };
    }
    let importedCount = 0;
    const productIds: string[] = [];
    const items: Array<{productId:string;observationId:string;created:boolean|null}> = [];
    // Stable order avoids lock inversions between concurrent batches sharing products.
    for (const product of [...payload.products].sort((a,b) => a.externalId.localeCompare(b.externalId))) {
      const result = await persistCaptureItem(tx, device, {
        version: 1, marketplace: payload.marketplace, clientCapturedAt: payload.clientCapturedAt,
        page: payload.page, product,
        requestId: manualExtensionItemRequestId(device.deviceId, payload.requestId, payload.marketplace, product.externalId),
      }, "manual");
      if (!result.duplicate) importedCount++;
      productIds.push(result.productId);
      items.push({productId:result.productId,observationId:result.observationId,created:result.created ?? null});
    }
    // Additive private metadata: the accepted-payload fingerprint above is unchanged.
    // Validation diagnostics are calculated by the server, never part of idempotency.
    const result = { version: 2, productIds, items, marketplace: payload.marketplace,
      page: {kind:payload.page.kind,url:sourcePageUrl(new URL(payload.page.url),payload.marketplace)},
      clientCapturedAt:payload.clientCapturedAt,
      counts:{received:diagnostics?.received ?? null,valid:payload.products.length,
        rejected:diagnostics?.rejected ?? null,duplicates:diagnostics?.duplicates ?? null,
        observationsSaved:importedCount,alreadyRecorded:payload.products.length-importedCount,
        productsCreated:items.every(item=>item.created!==null) ? items.filter(item=>item.created).length : null,
        productsUpdated:items.every(item=>item.created!==null) ? items.filter(item=>item.created===false).length : null},
      validation: diagnostics ? {items:diagnostics.items.map(item=>({index:item.index,externalId:item.externalId,status:item.status,reason:item.reason}))} : null };
    await tx`insert into garimpa.extension_capture_receipt(tenant_id,device_id,request_id,fingerprint,result)
      values(${device.tenantId},${device.deviceId},${payload.requestId}::uuid,${fingerprint},${tx.json(result)})`;
    return { ok: true as const, mode: "manual" as const, importedCount, duplicate: importedCount === 0, productIds,
      receiptRef: `manual:${device.deviceId}:${payload.requestId.toLowerCase()}`, replayed: false };
  }, sqlFactory);
}
