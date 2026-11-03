import { createHash } from "node:crypto";
import { db } from "./db.ts";
import { withCommercialDb, type AccountContext } from "./commercial-rollout.ts";
import { resolveAccountMarketplaceCredentials } from "../../persistence/src/account-credentials.ts";
import { reserveOperationQuota } from "./saas-entitlement-db.ts";
import { shopeeCaptureEnabled } from "./shopee-capture.ts";
import { aliexpressCaptureEnabled } from "./aliexpress-capture.ts";
import { ShopeeAdapter } from "../../capture/src/adapters/shopee/index.ts";
import { AliExpressAdapter } from "../../capture/src/adapters/aliexpress/index.ts";
import type { CaptureAdapter } from "../../capture/src/types.ts";
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
/** Explicit per-product conversion through the existing official adapters. No ML collection. */
export async function prepareWorkspaceLink(
  c: AccountContext,
  i: { productId: string; requestId: string },
  factory: typeof db = db,
  adapters: Record<string, CaptureAdapter> = {},
) {
  if (
    c.actor !== "human" ||
    !c.actorAppUserId ||
    !/^[a-zA-Z0-9_-]{1,120}$/.test(i.productId) ||
    typeof i.requestId !== "string" ||
    i.requestId.length > 128
  )
    throw new Error("invalid_input");
  const prepared = await withCommercialDb(
    c,
    async (tx) => {
      const [p] = await tx<
        any[]
      >`select p.*,a.public_slug from garimpa.product p join garimpa.product_curation review on review.product_id=p.id and review.tenant_id=p.tenant_id and review.status='approved' join garimpa.affiliate_account a on a.tenant_id=p.tenant_id where p.tenant_id=${c.tenantId} and p.id=${i.productId}`;
      if (!p) throw new Error("offer_unavailable");
      await reserveOperationQuota(tx, c, "use_marketplace", i.requestId, {
        marketplace: p.marketplace,
      });
      const prefix = (
        { shopee: "shp", aliexpress: "ali", mercadolivre: "ml" } as Record<
          string,
          string
        >
      )[p.marketplace];
      if (!prefix) throw new Error("invalid_input");
      const slug =
        (c.tenantId === "local" ? "" : p.public_slug + "-") +
        prefix +
        "-" +
        p.external_id;
      const [pub] = await tx<
        any[]
      >`insert into garimpa.publication(id,tenant_id,product_id,affiliate_id,channel,slug,status)
   values(gen_random_uuid()::text,${c.tenantId},${p.id},${c.affiliateId},'web',${slug},'active')
   on conflict(affiliate_id,product_id,channel) do update set slug=excluded.slug returning id,slug,affiliate_url,status`;
      if (pub.status !== "active") throw new Error("link_unavailable");
      if (p.marketplace === "mercadolivre") {
        const [target] =
          await tx`select url from garimpa.public_monetized_target(${pub.slug})`;
        if (!target?.url) throw new Error("link_unavailable");
        return { ready: true as const };
      }
      if (pub.affiliate_url) return { ready: true as const };
      const credential = await resolveAccountMarketplaceCredentials(
        c.tenantId,
        p.marketplace,
        tx,
      );
      const enabled =
        p.marketplace === "shopee"
          ? shopeeCaptureEnabled({
              SHOPEE_CAPTURE_ENABLED: process.env.SHOPEE_CAPTURE_ENABLED,
              SHOPEE_APP_ID: credential.appId,
              SHOPEE_APP_SECRET: credential.appSecret,
            })
          : aliexpressCaptureEnabled({
              ALIEXPRESS_CAPTURE_ENABLED:
                process.env.ALIEXPRESS_CAPTURE_ENABLED,
              ALIEXPRESS_APP_KEY: credential.appKey,
              ALIEXPRESS_APP_SECRET: credential.appSecret,
              ALIEXPRESS_TRACKING_ID: credential.trackingId,
            });
      if (!enabled) throw new Error("marketplace_disabled");
      const { tenantId: _t, marketplace, ...secret } = credential;
      return {
        ready: false as const,
        pub,
        productId: p.id,
        url: p.product_url,
        marketplace,
        secret: secret as Record<string, string>,
        digest: digest(credential),
      };
    },
    factory,
  );
  if (prepared.ready) return { ready: true };
  const adapter =
    adapters[prepared.marketplace] ??
    (prepared.marketplace === "shopee"
      ? new ShopeeAdapter()
      : new AliExpressAdapter());
  if (!adapter.buildAffiliateLink) throw new Error("link_unavailable");
  const url = await adapter.buildAffiliateLink(
    { marketplace: prepared.marketplace, secret: prepared.secret },
    prepared.url,
    {
      marketplace: prepared.marketplace,
      trackingId: prepared.secret.trackingId ?? c.affiliateId,
      subIds: [prepared.pub.id.replace(/-/g, "")],
    },
    { runId: i.requestId, signal: AbortSignal.timeout(15000), log: () => {} },
  );
  const target = new URL(url),
    hosts =
      prepared.marketplace === "shopee"
        ? ["shopee.com.br", "shope.ee"]
        : ["aliexpress.com"];
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    !hosts.some(
      (h) => target.hostname === h || target.hostname.endsWith("." + h),
    )
  )
    throw new Error("link_unavailable");
  return withCommercialDb(
    c,
    async (tx) => {
      const credentials = await resolveAccountMarketplaceCredentials(
        c.tenantId,
        prepared.marketplace,
        tx,
      );
      if (digest(credentials) !== prepared.digest)
        throw new Error("connection_conflict");
      const [p] =
        await tx`select id from garimpa.product where id=${prepared.productId} and tenant_id=${c.tenantId} and product_url=${prepared.url}`;
      if (!p) throw new Error("option_changed");
      await tx`update garimpa.publication set affiliate_url=coalesce(affiliate_url,${url}),affiliate_url_generated_at=coalesce(affiliate_url_generated_at,now()) where id=${prepared.pub.id} and tenant_id=${c.tenantId} and affiliate_id=${c.affiliateId} and status='active'`;
      return { ready: true };
    },
    factory,
  );
}
