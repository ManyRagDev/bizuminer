import { randomUUID } from "node:crypto";
import { db } from "./db.ts";
import { currentAccount, scopedTenantId } from "./account-scope.ts";
import { withPublicDb } from "./public-offer-db.ts";
import { HOMEPAGE_POLICY_VERSION, HOMEPAGE_RENEWAL_MS, type HomepageContinuity } from "./homepage-policy.ts";
import type { EditorialDestination, PublishedEditorialSelection } from "./editorial-selection.ts";
import { homepageRenewalSchemaReady, recordHomepageRenewalFailure } from "./homepage-renewal-db.ts";

export async function homepageSchemaReady(sql: Pick<ReturnType<typeof db>, "unsafe">) {
  const [row] = await sql.unsafe<{ ready: boolean }[]>("select to_regprocedure('garimpa.read_homepage_edition(text,text)') is not null as ready");
  return row?.ready === true;
}

/** No cache of authorization/eligibility: the bounded SQL read validates every edition. */
export async function readHomepageEdition(destination: EditorialDestination | "all", tenantId: string, sqlFactory: typeof db = db) {
  if (!process.env.DATABASE_URL) return null;
  const sql = sqlFactory();
  try { if (!await homepageSchemaReady(sql)) return null; } finally { await sql.end(); }
  return withPublicDb(async tx => {
    const [row] = await tx<{ value: PublishedEditorialSelection | null }[]>`select garimpa.read_homepage_edition(${tenantId},${destination}) as value`;
    return row?.value ?? null; // Initial activation is explicit; existing editions never fall back.
  }, sqlFactory);
}

type Edition = { id: string; policy_version: string; source_selection_id: string | null; selection: PublishedEditorialSelection; renewed_at: Date | string; renew_after: Date | string };
/** Called after ingestion/review or by the existing monitoring worker, never by a public GET. */
export async function refreshHomepageEdition(tenantId = scopedTenantId(), sqlFactory: typeof db = db, now = new Date(), dryRun = false, initialize = true): Promise<{ready:boolean;count:number;changed:boolean;blocked?:string;heroCount?:number;products?:Array<{id:string;title:string;category:string|null;marketplace:string}>}> {
  const { refreshRecommendationEditions }=await import("./recommendation-db.ts");
  const result=await refreshRecommendationEditions(tenantId,sqlFactory,dryRun,now);
  if(!result.ready)return {ready:false,changed:false,count:0,blocked:"migration_required"};
  if(!result.configured)return {ready:true,changed:false,count:0,blocked:"policy_activation_required"};
  return {ready:true,changed:result.channels.some(c=>c.changed),count:result.channels.reduce((n,c)=>n+c.count,0)};
}

/** Compatibility/rollback tooling only. New worker and UI never consume old opt-in. */
export async function refreshLegacyHomepageEdition(tenantId = scopedTenantId(), sqlFactory: typeof db = db, now = new Date(), dryRun = false, initialize = true): Promise<Awaited<ReturnType<typeof refreshHomepageAttempt>>> {
  for (let attempt = 0; ; attempt++) {
    try { return await refreshHomepageAttempt(tenantId, sqlFactory, now, dryRun, initialize); }
    catch (error) { if (attempt >= 2 || (error as { code?: string }).code !== "40001") throw error; }
  }
}
async function refreshHomepageAttempt(tenantId: string, sqlFactory: typeof db, now: Date, dryRun: boolean, initialize: boolean) {
  if (currentAccount() && currentAccount()!.tenantId !== tenantId) throw new Error("forbidden_account_scope");
  const sql = sqlFactory();
  try {
    if (!await homepageSchemaReady(sql)) return { ready: false, count: 0, changed: false, blocked: "migration_required" };
    return await sql.begin("isolation level repeatable read", async tx => {
      await tx`select set_config('garimpa.tenant_id',${tenantId},true)`;
      if (!currentAccount()) await tx`select set_config('garimpa.actor_type','worker',true)`;
      // Keep concurrent marketplaces from publishing competing editions.
      await tx`select pg_advisory_xact_lock(hashtextextended(${`homepage:${tenantId}`},0))`;
      const [previous] = await tx<Edition[]>`select * from garimpa.homepage_edition where tenant_id=${tenantId}`;
      const renewalReady = await homepageRenewalSchemaReady(tx);
      const [renewal] = renewalReady ? await tx<{ enabled: boolean }[]>`select enabled from garimpa.homepage_renewal where tenant_id=${tenantId}` : [];
      const canInitialize = initialize || renewal?.enabled === true;
      if (!previous && !canInitialize && !dryRun) return { ready: true, changed: false, count: 0, blocked: "initialization_required" };
      const outcome = async (value: string) => {
        if (renewalReady && !dryRun) await tx`update garimpa.homepage_renewal set last_attempt_at=${now},outcome=${value} where tenant_id=${tenantId}`;
      };
      const [source] = await tx<{ id: string }[]>`select id from garimpa.editorial_selection where tenant_id=${tenantId} and status='active'`;
      const history = await tx<{ product_id: string; last_featured_at?: Date | string }[]>`select * from garimpa.homepage_product_history where tenant_id=${tenantId}`;
      const continuity: HomepageContinuity | undefined = previous && [HOMEPAGE_POLICY_VERSION, "home-v1"].includes(previous.policy_version) && previous.source_selection_id === (source?.id ?? null) ? {
        productIds: previous.selection.products.map(p => p.id), heroProductIds: previous.selection.heroProductIds,
        seenProductIds: history.map(p => p.product_id), renewAfter: new Date(previous.renew_after).toISOString(),
        lastFeaturedAt: Object.fromEntries(history.filter(p => p.last_featured_at).map(p => [p.product_id, new Date(p.last_featured_at!).toISOString()])),
      } : undefined;
      // Reuse this transaction and its snapshot; no nested pool or duplicate computation per destination.
      const localFactory = (() => {
        const proxy: any = (...args: any[]) => (tx as any)(...args);
        proxy.unsafe = tx.unsafe.bind(tx); proxy.json = tx.json.bind(tx);
        proxy.begin = async (...args: any[]) => args.at(-1)(tx); proxy.end = async () => {};
        return proxy;
      }) as typeof db;
      const { computeEditorialSelection } = await import("./editorial-selection-db.ts");
      const selection = await computeEditorialSelection("all", tenantId, localFactory, continuity, true, now);
      selection.homepageReady = true;
      const ids = selection.products.map(p => p.id);
      if (!dryRun && !previous && (selection.mode === "catalog" && !ids.length)) {
        await outcome("awaiting_review");
        return { ready: true, changed: false, count: ids.length, blocked: "no_qualified_products" };
      }
      const material = ids.length ? await tx<any[]>`select p.id,p.product_url,o.id as observation_id,
        o.observed_at,p.last_seen_at,a.id as assessment_id,a.assessment,
        coalesce(i.destinations,array['home','pauta']::text[]) as destinations
        from garimpa.product p join lateral(select id,observed_at from garimpa.price_observation o
          where o.tenant_id=p.tenant_id and o.product_id=p.id order by observed_at desc,id desc limit 1) o on true
        left join lateral(select id,assessment from garimpa.editorial_assessment a where a.tenant_id=p.tenant_id and a.product_id=p.id
          and coalesce(a.assessment->>'schemaVersion','1')<>'2' order by a.created_at desc,a.id desc limit 1) a on true
        left join garimpa.editorial_selection_item i on i.product_id=p.id and i.tenant_id=p.tenant_id and i.selection_id=${selection.id}
        where p.tenant_id=${tenantId} and p.id=any(${ids})` : [];
      const inputs = material.map(row => ({ productId: row.id, productUrl: row.product_url, observationId: row.observation_id,
        assessmentId: row.assessment_id, destinations: row.destinations,
        validUntil: new Date(Math.min(new Date(row.observed_at).getTime() + 48 * 3_600_000,
          new Date(row.last_seen_at).getTime() + 7 * 86_400_000,
          selection.mode === "editorial" && selection.validUntil ? Date.parse(selection.validUntil) : Infinity,
          row.assessment?.comparativeBasis?.checkedAt ? Date.parse(row.assessment.comparativeBasis.checkedAt) + 48 * 3_600_000 : Infinity)).toISOString(),
      }));
      const dependencies: Array<Record<string, unknown>> = [];
      for (const row of material) {
        const alternatives = row.assessment?.comparativeBasis?.alternativeProductIds ?? [];
        if (!alternatives.length) continue;
        const facts = await tx<any[]>`select p.id,p.title,p.product_url,p.image_url,o.id as observation_id from garimpa.product p
          join lateral(select id from garimpa.price_observation o where o.tenant_id=p.tenant_id and o.product_id=p.id
            order by observed_at desc,id desc limit 1) o on true where p.tenant_id=${tenantId} and p.id=any(${alternatives})`;
        dependencies.push(...facts.map(f => ({ ownerProductId: row.id, productId: f.id, title: f.title,
          productUrl: f.product_url, imageUrl: f.image_url, observationId: f.observation_id })));
      }
      const identity = (value: PublishedEditorialSelection) => JSON.stringify([value.id, value.version,
        value.products.map(p => p.id), value.heroProductIds]);
      const changed = !previous || previous.policy_version !== HOMEPAGE_POLICY_VERSION || identity(previous.selection) !== identity(selection);
      const editionId = changed ? randomUUID() : previous.id;
      selection.homepageEditionId = editionId;
      const renewing = !continuity || now >= new Date(continuity.renewAfter);
      const renewAfter = renewing ? new Date(now.getTime() + HOMEPAGE_RENEWAL_MS) : new Date(continuity.renewAfter);
      selection.renewedAt = renewing ? now.toISOString() : new Date(previous.renewed_at).toISOString();
      selection.renewAfter = renewAfter.toISOString();
      if (dryRun) return { ready: true, changed, count: ids.length, heroCount: selection.heroProductIds.length,
        products: selection.products.map(p => ({ id: p.id, title: p.title, category: p.category, marketplace: p.marketplace })) };
      await tx`insert into garimpa.homepage_edition(tenant_id,id,policy_version,source_selection_id,renewed_at,renew_after,selection,inputs,dependencies)
        values(${tenantId},${editionId},${HOMEPAGE_POLICY_VERSION},${selection.id},${now},${renewAfter},${tx.json(selection as unknown as Parameters<typeof tx.json>[0])},${tx.json(inputs)},${tx.json(dependencies as Parameters<typeof tx.json>[0])})
        on conflict(tenant_id) do update set id=excluded.id,policy_version=excluded.policy_version,source_selection_id=excluded.source_selection_id,
          renewed_at=case when ${renewing} then excluded.renewed_at else homepage_edition.renewed_at end,renew_after=excluded.renew_after,
          refreshed_at=now(),selection=excluded.selection,inputs=excluded.inputs,dependencies=excluded.dependencies`;
      const homeIds = inputs.filter(input => input.destinations.includes("home")).map(input => input.productId);
      if (homeIds.length) {
        if (renewalReady) await tx`insert into garimpa.homepage_product_history(tenant_id,product_id,first_featured_at,last_featured_at)
          select ${tenantId},unnest(${homeIds}::text[]),${now},${now} on conflict(tenant_id,product_id) do update set last_featured_at=excluded.last_featured_at`;
        else await tx`insert into garimpa.homepage_product_history(tenant_id,product_id)
          select ${tenantId},unnest(${homeIds}::text[]) on conflict do nothing`;
      }
      await outcome(selection.mode === "editorial" ? "manual_edition" : !ids.length ? "awaiting_review" : changed ? "published" : "unchanged");
      await tx`delete from garimpa.homepage_engagement where tenant_id=${tenantId} and created_at<now()-interval '7 days'`;
      return { ready: true, changed, count: ids.length, heroCount: selection.heroProductIds.length,
        ...(selection.mode === "catalog" && !ids.length ? { blocked: "no_qualified_products" } : {}) };
    });
  } finally { await sql.end(); }
}

/** Failure to refresh never reopens a withdrawn/expired item: reads fail closed. */
export async function refreshHomepageAfterChange(tenantId = scopedTenantId(), initialize = false) {
  try { return await refreshHomepageEdition(tenantId, undefined, new Date(), false, initialize); }
  catch {
    console.error("homepage_refresh_failed", { tenantId });
    await recordHomepageRenewalFailure(tenantId).catch(() => {});
    return { ready: false, count: 0, changed: false };
  }
}

export async function homepageEngagementReport(tenantId = scopedTenantId(), sqlFactory: typeof db = db) {
  if (currentAccount() && currentAccount()!.tenantId !== tenantId) throw new Error("forbidden_account_scope");
  const sql = sqlFactory();
  try {
    if (!await homepageSchemaReady(sql)) return [];
    return await sql.begin(async tx => {
      await tx`select set_config('garimpa.tenant_id',${tenantId},true)`;
      return tx<{ product_id: string; surface: string; position: number; impressions: number; details: number; favorites: number; outbound: number }[]>`
        select product_id,surface,position,count(*) filter(where impressed)::int as impressions,
          count(*) filter(where impressed and detail)::int as details,count(*) filter(where impressed and favorite)::int as favorites,
          count(*) filter(where impressed and outbound)::int as outbound from garimpa.homepage_engagement
        where tenant_id=${tenantId} and created_at>now()-interval '7 days'
        group by product_id,surface,position order by impressions desc,product_id,position`;
    });
  } finally { await sql.end(); }
}
