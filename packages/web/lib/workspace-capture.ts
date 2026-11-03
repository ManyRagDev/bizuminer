import { randomUUID } from "node:crypto";
import { db } from "./db.ts";
import { withCommercialDb, type AccountContext } from "./commercial-rollout.ts";
import { sourceProduct } from "./affiliate-workspace-contract.ts";
import { reserveOperationQuota } from "./saas-entitlement-db.ts";
/** A human records what is visible. This never requests or scrapes the store. */
export async function registerWorkspaceOffer(
  c: AccountContext,
  i: { url: string; title: string; priceCents: number; requestId: string },
  factory: typeof db = db,
) {
  const source = sourceProduct(i.url);
  if (
    !source ||
    typeof i.title !== "string" ||
    i.title.trim().length < 3 ||
    i.title.length > 500 ||
    !Number.isSafeInteger(i.priceCents) ||
    i.priceCents <= 0 ||
    i.priceCents > 100000000 ||
    !/^[-a-f0-9]{36}$/i.test(i.requestId) ||
    !c.actorAppUserId
  )
    throw new Error("invalid_input");
  return withCommercialDb(
    c,
    async (tx) => {
      await reserveOperationQuota(tx, c, "use_marketplace", i.requestId, {
        marketplace: source.marketplace,
      });
      await tx`select pg_advisory_xact_lock(hashtextextended(${`manual-offer:${c.tenantId}:${source.marketplace}:${source.externalId}`},0))`;
      const [prior] = await tx<
        any[]
      >`select p.id,c.status from garimpa.product p left join garimpa.product_curation c on c.product_id=p.id and c.tenant_id=p.tenant_id where p.tenant_id=${c.tenantId} and p.marketplace=${source.marketplace} and p.external_id=${source.externalId}`;
      // Existing captures and decisions are preserved; no rejection is reopened.
      if (prior?.status === "rejected") throw new Error("product_rejected");
      if (prior) return { productId: prior.id, alreadyExisted: true };
      const productId = randomUUID(),
        now = new Date();
      await tx`insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents,last_seen_at,first_seen_at)
   values(${productId},${c.tenantId},${source.marketplace},${source.externalId},${i.title.trim()},${source.url},${i.priceCents},${now},${now})`;
      await tx`insert into garimpa.product_curation(tenant_id,product_id,status) values(${c.tenantId},${productId},'pending')`;
      await tx`insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,title_snapshot,product_url_snapshot,offer_evidence)
   values(${randomUUID()},${c.tenantId},${productId},${i.priceCents},${now},${i.title.trim()},${source.url},${tx.json({ version: 2, priceType: "unknown", source: { marketplace: source.marketplace, method: "browser", url: source.url, capturedAt: now.toISOString() }, verification: { method: "manual_listing", checkedAt: now.toISOString(), note: "Preço anotado pelo afiliado; opção e moeda ainda precisam de confirmação." } })})`;
      return { productId, alreadyExisted: false };
    },
    factory,
  );
}
