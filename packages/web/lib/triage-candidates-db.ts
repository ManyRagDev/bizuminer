import type postgres from "postgres";
import type { CandidateProduct } from "./curation-pipeline.ts";
import type { TriageInputVersion } from "./ai-curation-contract.ts";
import { PRODUCT_EVIDENCE_TTL_DAYS } from "./catalog-policy.ts";
import { sameOfferConfigurationSql } from "./offer-history.ts";
import {
  MIN_PRODUCT_VALUE_CENTS_DEFAULT, TRIAGE_VALUE_POLICY_VERSION,
  VALUE_REFERENCE_LOOKBACK_DAYS, VALUE_REFERENCE_MIN_DAYS, VALUE_REFERENCE_MIN_OBSERVATIONS,
} from "./triage-value-policy.ts";

type QueryClient = Pick<postgres.Sql, "unsafe">;
type CandidateRow = Omit<CandidateProduct, "comparablePriceHistory" | "inputVersion"> & {
  referencePriceCents: number | null; referenceObservationCount: number; referenceHistoryDays: number;
  currentStatus: "pending" | "held"; latestEventId: string | null;
  priceObservationId: string; offerEvidenceKey: string; observedAt: Date | string;
};

/** Read-only, tenant-scoped screening. Never trusts the seller's crossed-out price. */
export async function loadAutomatedTriageCandidates(
  sql: QueryClient,
  tenantId: string,
  limit: number,
  minValueCents = MIN_PRODUCT_VALUE_CENTS_DEFAULT,
  captureBatchId?: string,
): Promise<CandidateProduct[]> {
  const comparable = sameOfferConfigurationSql("latest", "historical");
  const rows = await sql.unsafe<CandidateRow[]>(`
    with candidates as (
      select f.id, f.marketplace, f.title, f.price_cents as "priceCents",
        f.rating_star as "ratingStar", f.sales_count as "salesCount", f.family_key as "familyKey", f.category,
        f.status as "currentStatus", event.id::text as "latestEventId",
        latest.id::text as "priceObservationId", md5(coalesce(latest.offer_evidence::text,'null')) as "offerEvidenceKey",
        latest.observed_at as "observedAt", f.queued_at,
        history.reference_price_cents as "referencePriceCents",
        history.observation_count as "referenceObservationCount", history.history_days as "referenceHistoryDays",
        (f.price_cents >= $3 or (history.reference_price_cents >= $3 and f.price_cents > 0
          and f.price_cents < history.reference_price_cents
          and history.observation_count >= ${VALUE_REFERENCE_MIN_OBSERVATIONS}
          and history.history_days >= ${VALUE_REFERENCE_MIN_DAYS})) as value_eligible,
        (f.status='pending' and not exists (
          select 1 from garimpa.curation_event e where e.tenant_id=f.tenant_id and e.product_id=f.id
            and e.actor_type in ('rule','llm'))) as never_triaged,
        (f.status='held' and event.actor_type='rule' and event.to_status='held'
          and f.reason_code=event.reason_code and (
            event.reason_code='weak_offer' or (event.reason_code='insufficient_evidence'
              and event.metadata->'automation'->'pricePolicy'->>'version'=$4
              and event.metadata->'automation'->'pricePolicy'->>'outcome' in ('unverified_value','invalid_price'))
          )) as automatic_price_hold
      from garimpa.curation_queue_facts f
      join lateral (select o.id,o.price_cents,o.observed_at,o.offer_evidence
        from garimpa.price_observation o where o.tenant_id=f.tenant_id and o.product_id=f.id
        order by o.observed_at desc,o.id desc limit 1) latest on true
      left join lateral (select e.id,e.actor_type,e.to_status,e.reason_code,e.metadata
        from garimpa.curation_event e where e.tenant_id=f.tenant_id and e.product_id=f.id
        order by e.id desc limit 1) event on true
      cross join lateral (select min(historical.price_cents) as reference_price_cents,
        count(*)::int as observation_count,
        coalesce(floor(extract(epoch from (max(historical.observed_at)-min(historical.observed_at)))/86400),0)::int as history_days
        from garimpa.price_observation historical
        where historical.tenant_id=f.tenant_id and historical.product_id=f.id
          and historical.observed_at < latest.observed_at
          and historical.observed_at >= latest.observed_at - interval '${VALUE_REFERENCE_LOOKBACK_DAYS} days'
          and historical.price_cents > 0
          and jsonb_typeof(latest.offer_evidence->'variantKey')='string'
          and nullif(btrim(latest.offer_evidence->>'variantKey'),'') is not null
          and ${comparable}) history
      where f.tenant_id=$1 and f.status in ('pending','held')
        and (f.deferred_until is null or f.deferred_until<=now())
        and f.last_seen_at>=now()-interval '${PRODUCT_EVIDENCE_TTL_DAYS} days'
        and ($5::uuid is null or exists (
          select 1 from garimpa.price_observation batch_observation
          join garimpa.capture_run batch_run on batch_run.id=batch_observation.capture_run_id
            and batch_run.tenant_id=batch_observation.tenant_id
          where batch_observation.tenant_id=f.tenant_id and batch_observation.product_id=f.id
            and batch_run.parameters->>'operationBatchId'=$5::text
        ))
    )
    select * from candidates where never_triaged or (automatic_price_hold and value_eligible)
    order by value_eligible desc,queued_at asc,id asc limit $2
  `, [tenantId, Math.min(Math.max(limit, 1), 200), minValueCents, TRIAGE_VALUE_POLICY_VERSION, captureBatchId ?? null]);
  return rows.map((row) => ({
    id: row.id, marketplace: row.marketplace, title: row.title, priceCents: row.priceCents,
    ratingStar: row.ratingStar, salesCount: row.salesCount, familyKey: row.familyKey, category: row.category,
    comparablePriceHistory: { referencePriceCents: row.referencePriceCents,
      observationCount: row.referenceObservationCount, historyDays: row.referenceHistoryDays },
    inputVersion: { status: row.currentStatus, latestEventId: row.latestEventId,
      priceObservationId: row.priceObservationId, priceCents: row.priceCents, offerEvidenceKey: row.offerEvidenceKey,
      observedAt: new Date(row.observedAt).toISOString() },
  }));
}

/** A human decision or a new observation during the AI call invalidates its input. */
export async function triageInputStillCurrent(
  sql: QueryClient, tenantId: string, productId: string, expected: TriageInputVersion,
): Promise<boolean> {
  const rows = await sql.unsafe<{ status: string; latestEventId: string | null;
    priceObservationId: string | null; priceCents: number | null; offerEvidenceKey: string | null; observedAt: Date | string }[]>(`
    select c.status,
      (select e.id::text from garimpa.curation_event e
        where e.tenant_id=c.tenant_id and e.product_id=c.product_id order by e.id desc limit 1) as "latestEventId",
      latest.id::text as "priceObservationId", latest.price_cents as "priceCents",
      md5(coalesce(latest.offer_evidence::text,'null')) as "offerEvidenceKey", latest.observed_at as "observedAt"
    from garimpa.product_curation c
    join lateral (select o.id,o.price_cents,o.offer_evidence,o.observed_at from garimpa.price_observation o
      where o.tenant_id=c.tenant_id and o.product_id=c.product_id
      order by o.observed_at desc,o.id desc limit 1) latest on true
    where c.tenant_id=$1 and c.product_id=$2
  `, [tenantId, productId]);
  return rows.length === 1 && rows[0].status === expected.status
    && rows[0].latestEventId === expected.latestEventId && rows[0].priceObservationId === expected.priceObservationId
    && rows[0].priceCents === expected.priceCents && rows[0].offerEvidenceKey === expected.offerEvidenceKey
    && new Date(rows[0].observedAt).toISOString() === expected.observedAt;
}
