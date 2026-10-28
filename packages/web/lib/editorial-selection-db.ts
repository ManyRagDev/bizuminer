import { scopedTenantId } from "./account-scope.ts";
import { sameOfferConfigurationSql } from "./offer-history.ts";
import { db } from "./db.ts";
import { getProductPresentations, hydrateProductPresentations } from "./product-presentation-db.ts";
import { sourceProductPresentation } from "./product-presentation.ts";
import { productSlug } from "./marketplaces.ts";
import { catalogHeroPresentation, rankHeroCandidates } from "./hero-ranking.ts";
import { composeHomepage, type HomepageContinuity } from "./homepage-policy.ts";
import {
  EDITORIAL_MAX_PRODUCTS, EDITORIAL_POLICY_VERSION, editorialEvidenceFingerprint, editorialSelectionBlockers,
  hasSuperiorityClaim,
  validateEditorialAssessment, validateEditorialSelection,
  type EditorialAssessment, type EditorialAssessmentInput, type EditorialCandidate,
  type EditorialDestination, type EditorialSelection, type PublishedEditorialSelection,
  type ReplaceEditorialSelectionInput,
} from "./editorial-selection.ts";

import { resolveVariantEvidence, isMateriallyEquivalent, normalizeUrl } from "./comparison-evidence.ts";

type SqlClient = ReturnType<typeof db>;
type QueryClient = Pick<SqlClient, "unsafe">;
type CandidateRow = {
  id: string; title: string; marketplace: string; external_id: string; image_url: string | null;
  category: string | null; product_url: string; last_seen_at: Date | string; status: string;
  price_cents: number; original_price_cents: number | null; claimed_discount_rate: number | null;
  previous_min_price_cents: number | null; observation_count: number; history_days: number;
  lowest_verified: boolean; rating_star: number | null; sales_label: string | null; sales_count: number | null;
  observed_at: Date | string; offer_evidence: unknown; history_comparable: boolean;
};

type CanonicalProductEvidence = {
  id: string;
  marketplace: string;
  external_id: string;
  product_url: string;
  title: string;
  status: string;
  observation_id: string | null;
  price_cents: number;
  observed_at: Date | string | null;
  offer_evidence: unknown;
  latest_curation_event_id: string | null;
  latest_evidence_event_id: string | null;
};

async function fetchCanonicalProductEvidence(
  tx: QueryClient,
  tenantId: string,
  productIds: string[]
): Promise<{ rows: CanonicalProductEvidence[]; tableUnavailable: boolean }> {
  if (!productIds.length) return { rows: [], tableUnavailable: false };
  const rows = await tx.unsafe<any[]>(`
    select p.id, p.marketplace, p.external_id, p.product_url, p.title, c.status,
           obs.id as observation_id,
           coalesce(obs.price_cents, 0)::int as price_cents,
           obs.observed_at,
           obs.offer_evidence,
           (select max(e.id)::text from garimpa.curation_event e where e.tenant_id = p.tenant_id and e.product_id = p.id) as latest_curation_event_id
    from garimpa.product p
    join garimpa.product_curation c on c.tenant_id = p.tenant_id and c.product_id = p.id
    left join lateral (
      select o.id, o.price_cents, o.observed_at, o.offer_evidence
      from garimpa.price_observation o
      where o.tenant_id = p.tenant_id and o.product_id = p.id
      order by o.observed_at desc, o.id desc limit 1
    ) obs on true
    where p.tenant_id = $1 and p.id = any($2)
  `, [tenantId, productIds]);

  let eventMap = new Map<string, string>();
  let tableUnavailable = false;
  try {
    const eventRows = await tx.unsafe<{ product_id: string; max_id: string }[]>(`
      select product_id, max(id)::text as max_id
      from garimpa.comparative_evidence_event
      where tenant_id = $1 and product_id = any($2)
      group by product_id
    `, [tenantId, productIds]);
    eventMap = new Map(eventRows.map((r) => [r.product_id, r.max_id]));
  } catch (err: any) {
    if (err?.code === "42P01") {
      tableUnavailable = true;
    } else {
      throw err;
    }
  }

  const resultRows: CanonicalProductEvidence[] = rows.map((r) => ({
    id: r.id,
    marketplace: r.marketplace,
    external_id: r.external_id,
    product_url: r.product_url,
    title: r.title,
    status: r.status,
    observation_id: r.observation_id,
    price_cents: r.price_cents,
    observed_at: r.observed_at,
    offer_evidence: r.offer_evidence,
    latest_curation_event_id: r.latest_curation_event_id,
    latest_evidence_event_id: eventMap.get(r.id) ?? "0",
  }));

  return { rows: resultRows, tableUnavailable };
}

type ObservationRow = {
  id: string;
  product_id: string;
  price_cents: number;
  observed_at: Date | string | null;
  offer_evidence: unknown;
};

type IneligibilityEventRow = {
  id: string;
  product_id: string;
  from_status: string;
  to_status: string;
  created_at: Date | string;
};

type ComparativeEvidenceEventRow = {
  id: string;
  tenant_id: string;
  product_id: string;
  subject: string;
  operation: string;
  observation_id: string | null;
  material_projection: Record<string, any>;
  recorded_at: Date | string;
};

async function validateSuperiorityClaimsInBatch(
  tx: QueryClient,
  tenantId: string,
  assessments: EditorialAssessment[],
  now: Date
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  const claimAssessments = assessments.filter(
    (a) => hasSuperiorityClaim(a.publicRationale) || (a.comparativeBasis && a.comparativeBasis.alternativeProductIds?.length > 0)
  );
  if (!claimAssessments.length) return result;

  const allProductIds = new Set<string>();
  for (const a of claimAssessments) {
    if (!a.comparativeBasis || a.comparativeBasis.version !== "v3" || !a.comparativeBasis.alternativeProductIds?.length) {
      result.set(a.id, false);
      continue;
    }
    allProductIds.add(a.productId);
    for (const altId of a.comparativeBasis.alternativeProductIds) {
      allProductIds.add(altId);
    }
  }

  const pids = Array.from(allProductIds);
  if (!pids.length) return result;

  let evidenceEvents: ComparativeEvidenceEventRow[] = [];
  try {
    evidenceEvents = await tx.unsafe<ComparativeEvidenceEventRow[]>(`
      select id::text as id, tenant_id, product_id, subject, operation,
             observation_id, material_projection, recorded_at
      from garimpa.comparative_evidence_event
      where tenant_id = $1 and product_id = any($2)
      order by product_id, id asc
    `, [tenantId, pids]);
  } catch (err: any) {
    if (err?.code === "42P01") {
      // AC-037.2: Se a tabela de eventos ainda não existir (42P01), alegações novas/antigas falham fechado
      for (const a of claimAssessments) {
        result.set(a.id, false);
      }
      return result;
    }
    throw err;
  }

  const eventsByProduct = new Map<string, ComparativeEvidenceEventRow[]>();
  for (const ev of evidenceEvents) {
    let list = eventsByProduct.get(ev.product_id);
    if (!list) {
      list = [];
      eventsByProduct.set(ev.product_id, list);
    }
    list.push(ev);
  }

  const curations = await tx.unsafe<{ product_id: string; status: string }[]>(`
    select product_id, status
    from garimpa.product_curation
    where tenant_id = $1 and product_id = any($2)
  `, [tenantId, pids]);
  const curationMap = new Map(curations.map((c) => [c.product_id, c.status]));

  const observations = await tx.unsafe<ObservationRow[]>(`
    select id, product_id, price_cents, observed_at, offer_evidence
    from garimpa.price_observation
    where tenant_id = $1 and product_id = any($2)
    order by product_id, observed_at desc, id desc
  `, [tenantId, pids]);

  const obsByProduct = new Map<string, ObservationRow[]>();
  for (const obs of observations) {
    let list = obsByProduct.get(obs.product_id);
    if (!list) {
      list = [];
      obsByProduct.set(obs.product_id, list);
    }
    list.push(obs);
  }

  const ineligibilityEvents = await tx.unsafe<IneligibilityEventRow[]>(`
    select id::text as id, product_id, from_status, to_status, created_at
    from garimpa.curation_event
    where tenant_id = $1 and product_id = any($2) and to_status <> 'approved'
  `, [tenantId, pids]);

  const curationEventsByProduct = new Map<string, IneligibilityEventRow[]>();
  for (const ev of ineligibilityEvents) {
    let list = curationEventsByProduct.get(ev.product_id);
    if (!list) {
      list = [];
      curationEventsByProduct.set(ev.product_id, list);
    }
    list.push(ev);
  }

  for (const a of claimAssessments) {
    if (result.has(a.id) && result.get(a.id) === false) continue;
    const basis = a.comparativeBasis;
    if (!basis || basis.version !== "v3" || !basis.alternativeProductIds?.length || !basis.evidenceReferences) {
      result.set(a.id, false);
      continue;
    }
    const refs = basis.evidenceReferences;
    const productsToCheck = [a.productId, ...basis.alternativeProductIds];
    let valid = true;

    for (const pid of productsToCheck) {
      const ref = refs[pid];
      if (!ref) {
        valid = false;
        break;
      }

      // 1. Current curation status
      const currentStatus = curationMap.get(pid);
      if (currentStatus !== "approved") {
        valid = false;
        break;
      }

      // 2. Ineligibility event in curation_event since assessment cutoff
      const cEvents = curationEventsByProduct.get(pid) ?? [];
      const assessmentCreatedAt = new Date(a.createdAt).getTime();
      const cutoffCurationEventId = ref.latestCurationEventId != null ? BigInt(ref.latestCurationEventId) : null;

      const hasIneligibilityAfter = cEvents.some((ev) => {
        const evTime = new Date(ev.created_at).getTime();
        const evId = BigInt(ev.id);
        if (cutoffCurationEventId != null && evId > cutoffCurationEventId) return true;
        if (evTime >= assessmentCreatedAt) return true;
        return false;
      });
      if (hasIneligibilityAfter) {
        valid = false;
        break;
      }

      // 3. Observations check: latest observation freshness and integrity
      const pObsList = obsByProduct.get(pid) ?? [];
      if (!pObsList.length) {
        valid = false;
        break;
      }

      const latestObs = pObsList[0];
      const latestTime = latestObs.observed_at ? new Date(latestObs.observed_at).getTime() : NaN;
      if (isNaN(latestTime) || now.getTime() - latestTime > 48 * 3600000 || latestTime > now.getTime() + 60000) {
        valid = false;
        break;
      }
      if (!Number.isSafeInteger(latestObs.price_cents) || latestObs.price_cents <= 0) {
        valid = false;
        break;
      }
      if (ref.priceCents != null && latestObs.price_cents !== ref.priceCents) {
        valid = false;
        break;
      }
      const latestVariant = resolveVariantEvidence(latestObs.offer_evidence);
      if (ref.variantConfirmed) {
        if (!latestVariant.confirmed || latestVariant.variantKey !== ref.variantKey) {
          valid = false;
          break;
        }
      } else {
        if (latestVariant.confirmed || latestVariant.variantKey != null) {
          valid = false;
          break;
        }
      }

      // 4. Memory of historical mutations: inspect comparative_evidence_event since cutoff
      const pEvidenceEvents = eventsByProduct.get(pid) ?? [];
      const cutoffEvidenceId = ref.latestEvidenceEventId != null ? BigInt(ref.latestEvidenceEventId) : 0n;

      for (const ev of pEvidenceEvents) {
        if (BigInt(ev.id) > cutoffEvidenceId) {
          if (!isMateriallyEquivalent(ref, ev.material_projection)) {
            valid = false;
            break;
          }
        }
      }

      if (!valid) break;
    }

    result.set(a.id, valid);
  }

  return result;
}

export async function editorialSelectionSchemaReady(sql: QueryClient): Promise<boolean> {
  const rows = await sql.unsafe<{ ready: boolean }[]>(`select
    to_regclass('garimpa.editorial_assessment') is not null
    and to_regclass('garimpa.editorial_selection') is not null
    and to_regclass('garimpa.editorial_selection_item') is not null
    and exists (select 1 from information_schema.columns where table_schema='garimpa'
      and table_name='price_observation' and column_name='offer_evidence') as ready`);
  return rows[0]?.ready === true;
}

async function candidateRows(sql: QueryClient, tenantId: string, productIds?: string[]): Promise<CandidateRow[]> {
  return sql.unsafe<CandidateRow[]>(`select f.*, obs.offer_evidence,
    (obs.offer_evidence->>'variantKey' is not null and not exists (
      select 1 from garimpa.price_observation historical where historical.tenant_id=f.tenant_id
      and historical.product_id=f.id and not ${sameOfferConfigurationSql("obs", "historical")}
    )) as history_comparable
    from garimpa.curation_queue_facts f
    join lateral (select offer_evidence from garimpa.price_observation o
      where o.tenant_id=f.tenant_id and o.product_id=f.id
      order by o.observed_at desc, o.id desc limit 1) obs on true
    where f.tenant_id=$1 and ($2::text[] is null or f.id=any($2))
      and ($2::text[] is not null or (f.status='approved' and f.last_seen_at >= now()-interval '7 days'))
    order by f.observed_at desc, f.id`, [tenantId, productIds ?? null]);
}

function toCandidate(row: CandidateRow, assessment: EditorialAssessment | null, now = new Date()): EditorialCandidate {
  const evidence = row.offer_evidence && typeof row.offer_evidence === "object" ? row.offer_evidence as Record<string, unknown> : {};
  const material = { title: row.title, imageUrl: row.image_url, category: row.category, productUrl: row.product_url,
    ratingStar: row.rating_star, offerEvidence: row.offer_evidence };
  const candidate: EditorialCandidate = {
    id: row.id, slug: productSlug(row.marketplace, row.external_id), title: row.title,
    marketplace: row.marketplace, imageUrl: row.image_url, category: row.category,
    priceCents: row.price_cents, originalPriceCents: row.original_price_cents,
    currency: typeof evidence.currency === "string" && /^[A-Z]{3}$/.test(evidence.currency) ? evidence.currency : undefined,
    priceType: ["exact", "from", "range", "unknown"].includes(String(evidence.priceType)) ? evidence.priceType as EditorialCandidate["priceType"] : undefined,
    priceMinCents: typeof evidence.priceMinCents === "number" ? evidence.priceMinCents : undefined,
    priceMaxCents: typeof evidence.priceMaxCents === "number" ? evidence.priceMaxCents : undefined,
    originalPriceKind: ["source_claimed", "derived_from_claim", "unknown"].includes(String(evidence.originalPriceKind)) ? evidence.originalPriceKind as EditorialCandidate["originalPriceKind"] : undefined,
    previousMinPriceCents: row.history_comparable ? row.previous_min_price_cents : null,
    discountPercent: row.claimed_discount_rate == null ? null : Math.round(row.claimed_discount_rate * 100),
    ratingStar: row.rating_star && row.rating_star > 0 ? row.rating_star : null,
    salesLabel: row.sales_label, salesCount: row.sales_count,
    observationCount: row.observation_count, historyDays: row.history_days,
    lowestVerified: row.history_comparable && row.lowest_verified, evidenceObservedAt: new Date(row.observed_at).toISOString(),
    productUrl: row.product_url, lastSeenAt: new Date(row.last_seen_at).toISOString(),
    curationStatus: row.status, offerEvidence: row.offer_evidence,
    evidenceFingerprint: editorialEvidenceFingerprint(material), assessment, selectionBlockers: [],
  };
  candidate.selectionBlockers = editorialSelectionBlockers(candidate, assessment, now);
  return candidate;
}

type AssessmentRow = { id: string; product_id: string; assessment: EditorialAssessmentInput; snapshot: { price_cents?: number }; policy_version: string; created_at: Date | string; presentation_invalidated_at?: string | null };
function toAssessment(row: AssessmentRow): EditorialAssessment {
  return { ...row.assessment, id: row.id, policyVersion: row.policy_version, createdAt: new Date(row.created_at).toISOString(),
    priceCentsAtAssessment: row.snapshot?.price_cents, presentationInvalidatedAt: row.presentation_invalidated_at ?? null };
}
async function latestAssessments(sql: QueryClient, tenantId: string): Promise<Map<string, EditorialAssessment>> {
  const rows = await sql.unsafe<AssessmentRow[]>(`select distinct on (product_id)
    id, product_id, assessment, snapshot, policy_version, created_at,
    to_jsonb(editorial_assessment)->>'presentation_invalidated_at' as presentation_invalidated_at from garimpa.editorial_assessment
    where tenant_id=$1 and coalesce(assessment->>'schemaVersion','1')<>'2' order by product_id, created_at desc, id desc`, [tenantId]);
  return new Map(rows.map((row) => [row.product_id, toAssessment(row)]));
}

async function readSelection(sql: QueryClient, tenantId: string): Promise<EditorialSelection | null> {
  const rows = await sql.unsafe<{ id: string; version: number; valid_until: Date | string }[]>(`select id, version, valid_until
    from garimpa.editorial_selection where tenant_id=$1 and status='active'`, [tenantId]);
  if (!rows.length) return null;
  const head = rows[0];
  const items = await sql.unsafe<{ product_id: string; assessment_id: string; position: number; destinations: EditorialDestination[]; context: string; assessment: EditorialAssessmentInput }[]>(`select
    i.product_id, i.assessment_id, i.position, i.destinations, i.context, a.assessment
    from garimpa.editorial_selection_item i join garimpa.editorial_assessment a
      on a.id=i.assessment_id and a.product_id=i.product_id and a.tenant_id=i.tenant_id
    where i.selection_id=$1 and i.tenant_id=$2 order by i.position`, [head.id, tenantId]);
  return { id: head.id, version: head.version, validUntil: new Date(head.valid_until).toISOString(), items: items.map((item) => ({
    productId: item.product_id, assessmentId: item.assessment_id, position: item.position,
    destinations: item.destinations, context: item.context, publicRationale: item.assessment.publicRationale,
  })) };
}

async function hasEditorialEdition(sql: QueryClient, tenantId: string): Promise<boolean> {
  const rows = await sql.unsafe<{ exists: boolean }[]>("select exists(select 1 from garimpa.editorial_selection where tenant_id=$1) as exists", [tenantId]);
  return rows[0]?.exists === true;
}

function publicProduct(candidate: EditorialCandidate) {
  const { productUrl: _url, lastSeenAt: _seen, curationStatus: _status, evidenceFingerprint: _key,
    offerEvidence: _evidence, assessment: _assessment, selectionBlockers: _blockers, ...product } = candidate;
  return product;
}

function highlightDeadline(candidates: EditorialCandidate[], editionValidUntil?: string): string | null {
  if (!candidates.length) return null;
  return new Date(Math.min(editionValidUntil ? Date.parse(editionValidUntil) : Infinity, ...candidates.flatMap((candidate) => [
    new Date(candidate.evidenceObservedAt!).getTime() + 48 * 3_600_000,
    Date.parse(candidate.lastSeenAt) + 7 * 86_400_000,
  ]))).toISOString();
}

export async function getEditorialSelectionDesk(tenantId = scopedTenantId(), sqlFactory: typeof db = db): Promise<{
  schemaReady: boolean; selection: EditorialSelection | null; candidates: EditorialCandidate[]; catalogHeroActive: boolean;
}> {
  if (!process.env.DATABASE_URL) return { schemaReady: false, selection: null, candidates: [], catalogHeroActive: false };
  const sql = sqlFactory();
  try {
    if (!await editorialSelectionSchemaReady(sql)) return { schemaReady: false, selection: null, candidates: [], catalogHeroActive: false };
    // One repeatable snapshot for desk state and optimistic version.
    return await sql.begin("isolation level repeatable read read only", async (tx) => {
      await tx`select set_config('garimpa.tenant_id', ${tenantId}, true)`;
      const selection = await readSelection(tx, tenantId);
      const assessments = await latestAssessments(tx, tenantId);
      const rows = await candidateRows(tx, tenantId);
      // The latest assessment may be a draft; cover status comes from the current
      // public revision, using this same snapshot and one bounded batch per 200 IDs.
      const presentationFactory = (() => {
        const local = (...args: unknown[]) => (tx as unknown as (...values: unknown[]) => unknown)(...args);
        return Object.assign(local, { end: async () => {} });
      }) as typeof db;
      const presentations = await getProductPresentations(rows.map(row => row.id), tenantId, presentationFactory);
      return { schemaReady: true, selection, candidates: rows.map((row) => ({
        ...toCandidate(row, assessments.get(row.id) ?? null),
        ...(presentations.get(row.id) ?? sourceProductPresentation(row.title)),
      })),
        catalogHeroActive: !selection && !await hasEditorialEdition(tx, tenantId) };
    });
  } finally { await sql.end(); }
}

export async function saveEditorialAssessment(input: EditorialAssessmentInput, reviewerId: string, tenantId = scopedTenantId(), sqlFactory: typeof db = db):
Promise<{ ok: true; assessment: EditorialAssessment } | { ok: false; error: string }> {
  if (!reviewerId || !process.env.DATABASE_URL) return { ok: false, error: "forbidden" };
  const sql = sqlFactory();
  try {
    if (!await editorialSelectionSchemaReady(sql)) return { ok: false, error: "migration_required" };
    return await sql.begin(async (tx) => {
      await tx`select set_config('garimpa.tenant_id', ${tenantId}, true)`;
      const [columns]=await tx`select exists(select 1 from information_schema.columns where table_schema='garimpa' and table_name='affiliate_membership' and column_name='revoked_at') as revocation`;
      const actors = await tx`select m.app_user_id as id from garimpa.affiliate_membership m join garimpa.affiliate_account a on a.id=m.affiliate_id where m.app_user_id=${reviewerId} and a.tenant_id=${tenantId} and ${tx.unsafe(columns?.revocation?"m.revoked_at is null":"true")}`;
      if (!actors.length) return { ok: false as const, error: "forbidden" };
      await tx`select id from garimpa.product where id=${input.productId} and tenant_id=${tenantId} for no key update`;
      if (input.presentation) {
        const [schema] = await tx`select to_regprocedure('garimpa.public_product_presentations(text,text[])') is not null as ready`;
        if (!schema?.ready) return { ok: false as const, error: "presentation_migration_required" };
        const current = await tx<{ id: string }[]>`select id from garimpa.editorial_assessment where tenant_id=${tenantId} and product_id=${input.productId}
          and coalesce(assessment->>'schemaVersion','1')<>'2' order by created_at desc,id desc limit 1`;
        if (input.expectedAssessmentId === undefined || (current[0]?.id ?? null) !== input.expectedAssessmentId) return { ok: false as const, error: "assessment_conflict" };
      }
      const rows = await candidateRows(tx, tenantId, [input.productId]);
      if (!rows[0] || rows[0].status !== "approved") return { ok: false as const, error: "product_not_approved" };
      const candidate = toCandidate(rows[0], null);
      if (candidate.evidenceFingerprint !== input.evidenceFingerprint) return { ok: false as const, error: "evidence_changed" };

      let assessmentToValidate: EditorialAssessmentInput = input;
      if (input.comparativeBasis) {
        const altIds = input.comparativeBasis.alternativeProductIds;
        if (!altIds || !altIds.length) {
          return { ok: false as const, error: "comparative_basis_alternatives_required" };
        }
        // AC-037.2: Bloqueio determinístico dos produtos em ordem para sincronização com writers
        const allIdsToFetch = Array.from(new Set([input.productId, ...altIds])).sort();
        await tx.unsafe(`
          select id from garimpa.product
          where tenant_id = $1 and id = any($2)
          order by id
          for update
        `, [tenantId, allIdsToFetch]);

        const { rows: evidenceRows, tableUnavailable } = await fetchCanonicalProductEvidence(tx, tenantId, allIdsToFetch);
        if (tableUnavailable) {
          return { ok: false as const, error: "comparative_evidence_table_unavailable" };
        }
        const evidenceMap = new Map(evidenceRows.map((r) => [r.id, r]));

        for (const altId of altIds) {
          const alt = evidenceMap.get(altId);
          if (!alt) {
            return { ok: false as const, error: "comparative_basis_alternative_not_found" };
          }
          if (alt.status !== "approved") {
            return { ok: false as const, error: "comparative_basis_alternative_not_approved" };
          }
          const obsTime = alt.observed_at ? new Date(alt.observed_at).getTime() : NaN;
          const now = new Date();
          if (isNaN(obsTime) || now.getTime() - obsTime > 48 * 3600000 || obsTime > now.getTime() + 60000) {
            return { ok: false as const, error: "comparative_basis_alternative_expired" };
          }
          if (!Number.isSafeInteger(alt.price_cents) || alt.price_cents <= 0) {
            return { ok: false as const, error: "comparative_basis_alternative_expired" };
          }
        }

        const candidateEvidence = evidenceMap.get(input.productId);
        if (!candidateEvidence || !candidateEvidence.observation_id || !candidateEvidence.observed_at) {
          return { ok: false as const, error: "missing_evidence_fingerprint" };
        }

        // Build server-derived canonical evidence references for candidate and alternatives (AC-037.2, versão v3)
        const canonicalRefs: Record<string, any> = {};
        for (const pid of allIdsToFetch) {
          const row = evidenceMap.get(pid)!;
          const variant = resolveVariantEvidence(row.offer_evidence);
          const rawSource = row.offer_evidence && typeof row.offer_evidence === "object"
            ? (row.offer_evidence as Record<string, unknown>).source ?? null
            : null;
          const sourceUrl = rawSource && typeof (rawSource as any).url === "string" ? (rawSource as any).url : null;
          const sourceMarketplace = rawSource && typeof (rawSource as any).marketplace === "string" ? (rawSource as any).marketplace : null;
          canonicalRefs[pid] = {
            productId: pid,
            marketplace: row.marketplace,
            externalId: row.external_id,
            productUrl: row.product_url,
            curationStatus: row.status,
            variantKey: variant.variantKey,
            variantLabel: variant.variantLabel,
            variantConfirmed: variant.confirmed,
            source: rawSource,
            sourceUrl,
            sourceMarketplace,
            observationId: row.observation_id,
            observedAt: new Date(row.observed_at!).toISOString(),
            priceCents: row.price_cents,
            latestCurationEventId: row.latest_curation_event_id,
            latestEvidenceEventId: row.latest_evidence_event_id,
            materialSequenceMark: `${row.observation_id}:${row.price_cents}:${variant.variantKey ?? "none"}:${row.latest_evidence_event_id ?? "0"}`,
          };
        }

        assessmentToValidate = {
          ...input,
          comparativeBasis: {
            ...input.comparativeBasis,
            version: "v3",
            candidateProductId: input.productId,
            checkedAt: new Date().toISOString(),
            evidenceReferences: canonicalRefs,
          },
        };
      }

      const validated = validateEditorialAssessment(assessmentToValidate);
      if (!validated.ok) return validated;

      const stored = await tx<AssessmentRow[]>`insert into garimpa.editorial_assessment
        (tenant_id, product_id, actor_app_user_id, policy_version, evidence_fingerprint, assessment, snapshot)
        values (${tenantId}, ${candidate.id}, ${reviewerId}, ${EDITORIAL_POLICY_VERSION},
          ${candidate.evidenceFingerprint}, ${tx.json(validated.value as unknown as Parameters<typeof tx.json>[0])},
          ${tx.json(rows[0] as unknown as Parameters<typeof tx.json>[0])})
        returning id, product_id, assessment, snapshot, policy_version, created_at`;
      return { ok: true as const, assessment: toAssessment(stored[0]) };
    });
  } finally { await sql.end(); }
}

export async function replaceEditorialSelection(input: ReplaceEditorialSelectionInput, reviewerId: string, tenantId = scopedTenantId(), sqlFactory: typeof db = db):
Promise<{ ok: true; selection: EditorialSelection } | { ok: false; error: string }> {
  const validated = validateEditorialSelection(input);
  if (!validated.ok) return validated;
  if (!reviewerId || !process.env.DATABASE_URL) return { ok: false, error: "forbidden" };
  const sql = sqlFactory();
  try {
    if (!await editorialSelectionSchemaReady(sql)) return { ok: false, error: "migration_required" };
    return await sql.begin(async (tx) => {
      await tx`select set_config('garimpa.tenant_id', ${tenantId}, true)`;
      await tx`select pg_advisory_xact_lock(hashtextextended(${`editorial-selection:${tenantId}`}, 0))`;
      const [columns]=await tx`select exists(select 1 from information_schema.columns where table_schema='garimpa' and table_name='affiliate_membership' and column_name='revoked_at') as revocation`;
      const actors = await tx`select m.app_user_id as id from garimpa.affiliate_membership m join garimpa.affiliate_account a on a.id=m.affiliate_id where m.app_user_id=${reviewerId} and a.tenant_id=${tenantId} and ${tx.unsafe(columns?.revocation?"m.revoked_at is null":"true")}`;
      if (!actors.length) return { ok: false as const, error: "forbidden" };
      const current = await readSelection(tx, tenantId);
      if ((current?.version ?? null) !== validated.value.expectedVersion) return { ok: false as const, error: "selection_conflict" };
      const ids = validated.value.items.map((item) => item.productId);
      // Locks approval and product identity through activation. Public reads
      // still re-check facts because price capture can change later.
      if (ids.length) {
        await tx`select id from garimpa.product where tenant_id=${tenantId} and id=any(${ids}) order by id for no key update`;
        await tx`select product_id from garimpa.product_curation where tenant_id=${tenantId} and product_id=any(${ids}) order by product_id for update`;
      }
      const rows = ids.length ? await candidateRows(tx, tenantId, ids) : [];
      const byId = new Map(rows.map((row) => [row.id, row]));
      const itemAssessments = new Map<string, EditorialAssessment>();
      const newest = await latestAssessments(tx, tenantId);
      for (const item of validated.value.items) {
        const stored = await tx<AssessmentRow[]>`select id, product_id, assessment, snapshot, policy_version, created_at from garimpa.editorial_assessment
          where id=${item.assessmentId} and product_id=${item.productId} and tenant_id=${tenantId}`;
        const row = byId.get(item.productId);
        if (!row || !stored.length) return { ok: false as const, error: "assessment_not_found" };
        const assessment = toAssessment(stored[0]);
        if (newest.get(item.productId)?.id !== assessment.id) return { ok: false as const, error: "assessment_superseded" };
        if (editorialSelectionBlockers(toCandidate(row, assessment), assessment).length) return { ok: false as const, error: "selection_item_blocked" };
        itemAssessments.set(item.productId, assessment);
      }

      // Revalidação temporal de alegações de superioridade (AC-036.1 / AC-036.2 / BUG-021)
      const now = new Date();
      const claimValidity = await validateSuperiorityClaimsInBatch(tx, tenantId, Array.from(itemAssessments.values()), now);
      for (const item of validated.value.items) {
        const assessment = itemAssessments.get(item.productId)!;
        const hasClaim = hasSuperiorityClaim(assessment.publicRationale) || hasSuperiorityClaim(item.context);
        if (hasClaim) {
          if (claimValidity.get(assessment.id) !== true) {
            return { ok: false as const, error: "selection_item_blocked" };
          }
        }
      }
      const versions = await tx<{ version: number }[]>`select coalesce(max(version),0)::int as version from garimpa.editorial_selection where tenant_id=${tenantId}`;
      await tx`update garimpa.editorial_selection set status='retired' where tenant_id=${tenantId} and status='active'`;
      const created = await tx<{ id: string; version: number; valid_until: Date | string }[]>`insert into garimpa.editorial_selection
        (tenant_id, version, status, valid_until, actor_app_user_id)
        values (${tenantId}, ${versions[0].version + 1}, 'active', ${validated.value.validUntil}, ${reviewerId}) returning id, version, valid_until`;
      const head = created[0];
      for (let position = 0; position < validated.value.items.length; position++) {
        const item = validated.value.items[position];
        await tx`insert into garimpa.editorial_selection_item
          (tenant_id, selection_id, product_id, assessment_id, position, destinations, context)
          values (${tenantId}, ${head.id}, ${item.productId}, ${item.assessmentId}, ${position}, ${item.destinations}, ${item.context ?? ""})`;
      }
      return { ok: true as const, selection: { id: head.id, version: head.version, validUntil: new Date(head.valid_until).toISOString(),
        items: validated.value.items.map((item, position) => ({ ...item, context: item.context ?? "", position,
          publicRationale: itemAssessments.get(item.productId)!.publicRationale })) } };
    });
  } finally { await sql.end(); }
}

/** Background computation. Public requests consume the stored edition below. */
export async function computeEditorialSelection(destination: EditorialDestination | "all", tenantId = scopedTenantId(), sqlFactory: typeof db = db, previous?: HomepageContinuity, compose = true): Promise<PublishedEditorialSelection> {
  const empty: PublishedEditorialSelection = { mode: "unavailable", schemaReady: false, id: null, version: null, validUntil: null, products: [], heroProductIds: [], heroValidUntil: null };
  if (!process.env.DATABASE_URL) return empty;
  const sql = sqlFactory();
  try {
    if (!await editorialSelectionSchemaReady(sql)) return empty;
    return await sql.begin("isolation level repeatable read read only", async (tx) => {
      await tx`select set_config('garimpa.tenant_id', ${tenantId}, true)`;
      const presentationFactory = (() => {
        const local = (...args: unknown[]) => (tx as unknown as (...values: unknown[]) => unknown)(...args);
        return Object.assign(local, { end: async () => {} });
      }) as typeof db;
      const present = async (value: PublishedEditorialSelection): Promise<PublishedEditorialSelection> => ({
        ...value, products: await hydrateProductPresentations(value.products, tenantId, presentationFactory),
      });
      const selection = await readSelection(tx, tenantId);
      const now = new Date();
      const published = compose ? await tx<{ product_id: string; slug: string }[]>`select distinct on(pub.product_id) pub.product_id,pub.slug
        from garimpa.publication pub join garimpa.affiliate_account a on a.id=pub.affiliate_id and a.tenant_id=pub.tenant_id and a.status='active'
        where pub.tenant_id=${tenantId} and pub.channel='web' and pub.status='active'
        order by pub.product_id,pub.published_at desc,pub.id` : [];
      const publicSlugs = new Map(published.map(p => [p.product_id, p.slug]));
      if (!selection) {
        // Bootstrap only: never resurrect an explicitly empty, expired or
        // retired edition through the approved catalog.
        if (await hasEditorialEdition(tx, tenantId)) return { ...empty, schemaReady: true, mode: "editorial" };
        const assessments = await latestAssessments(tx, tenantId);
        const rows = await candidateRows(tx, tenantId);
        const candidates = rows.filter(row => !compose || publicSlugs.has(row.id)).map((row) => ({
          ...toCandidate(row, assessments.get(row.id) ?? null, now), ...(compose ? { slug: publicSlugs.get(row.id)! } : {}),
        }));

        // Revalidação de alegações de superioridade no ramo de catálogo antes da 1ª edição (BUG-021)
        const candidateAssessments = candidates
          .map((c) => c.assessment)
          .filter((a): a is EditorialAssessment => a !== null);
        const catalogClaimValidity = await validateSuperiorityClaimsInBatch(tx, tenantId, candidateAssessments, now);

        const eligibleCandidates = candidates.filter((candidate) => {
          if (candidate.assessment) {
            if (candidate.selectionBlockers.length) return false;
            if (hasSuperiorityClaim(candidate.assessment.publicRationale)) {
              if (catalogClaimValidity.get(candidate.assessment.id) !== true) return false;
            }
          }
          return true;
        });

        const ranked = rankHeroCandidates(eligibleCandidates, now).filter(entry => entry.classification.status === "hero").slice(0, EDITORIAL_MAX_PRODUCTS);
        const { selected, heroes: highlights } = compose ? composeHomepage(eligibleCandidates, now, previous)
          : { selected: ranked, heroes: ranked.filter(entry => entry.selectedForHero) };
        const validUntil = highlightDeadline(selected.map(({ candidate }) => candidate));
        const heroValidUntil = highlightDeadline(highlights.map(({ candidate }) => candidate));
        return present({ ...empty, schemaReady: true, mode: "catalog", validUntil, heroValidUntil,
          heroProductIds: highlights.map(({ candidate }) => candidate.id),
          products: selected.map(({ candidate, classification }) => ({ ...publicProduct(candidate),
            ...(candidate.assessment ? { editorialRationale: candidate.assessment.publicRationale, editorialPurchaseContents: candidate.assessment.purchaseContents } : catalogHeroPresentation(candidate, classification)),
            selectionItemId: `catalog:${candidate.id}`, editorialContext: "" })) });
      }
      const result: PublishedEditorialSelection = { mode: "editorial", schemaReady: true, id: selection.id, version: selection.version, validUntil: selection.validUntil, products: [], heroProductIds: [], heroValidUntil: null };
      if (new Date(selection.validUntil) <= now) return result;
      // The same global hero ranking accompanies every destination. Pauta-only
      // products cannot compete for the homepage's most prominent position.
      const items = selection.items;
      if (!items.length) return result;
      const rows = await candidateRows(tx, tenantId, items.map((item) => item.productId));
      const byId = new Map(rows.map((row) => [row.id, row]));
      const newest = await latestAssessments(tx, tenantId);

      // Revalidação em lote de todas as alternativas de alegações de superioridade (BUG-021)
      const itemAssessmentList: EditorialAssessment[] = [];
      const itemAssessmentMap = new Map<string, EditorialAssessment>();
      for (const item of items) {
        const stored = await tx<AssessmentRow[]>`select id, product_id, assessment, snapshot, policy_version, created_at from garimpa.editorial_assessment
          where id=${item.assessmentId} and product_id=${item.productId} and tenant_id=${tenantId}`;
        if (!stored.length) continue;
        const assessment = toAssessment(stored[0]);
        itemAssessmentList.push(assessment);
        itemAssessmentMap.set(item.productId, assessment);
      }
      const claimValidity = await validateSuperiorityClaimsInBatch(tx, tenantId, itemAssessmentList, now);

      const heroCandidates: EditorialCandidate[] = [];
      for (const item of items) {
        const assessment = itemAssessmentMap.get(item.productId);
        const row = byId.get(item.productId);
        if (!row || !assessment) continue;
        if (newest.get(item.productId)?.id !== assessment.id) continue;
        const candidate = toCandidate(row, assessment, now);
        if (compose) {
          if (!publicSlugs.has(candidate.id)) continue;
          candidate.slug = publicSlugs.get(candidate.id)!;
        }
        if (candidate.selectionBlockers.length) continue;
        const hasClaim = hasSuperiorityClaim(assessment.publicRationale) || hasSuperiorityClaim(item.context);
        if (hasClaim) {
          if (claimValidity.get(assessment.id) !== true) continue; // Omitir item cuja alegação de superioridade não se sustenta mais
        }
        if (item.destinations.includes("home")) heroCandidates.push(candidate);
        if (destination !== "all" && !item.destinations.includes(destination)) continue;
        // Explicit public projection: never serialize internal judgments or doubts.
        result.products.push({ ...publicProduct(candidate), editorialRationale: assessment.publicRationale,
          editorialPurchaseContents: assessment.purchaseContents,
          selectionItemId: `${selection.id}:${candidate.id}`, editorialContext: item.context });
      }
      const positions = new Map(items.map((item) => [item.productId, item.position]));
      const legacy = rankHeroCandidates(heroCandidates, now, positions);
      const { selected: home, heroes: highlights } = compose ? composeHomepage(heroCandidates, now, previous, positions)
        : { selected: legacy, heroes: legacy.filter(entry => entry.selectedForHero) };
      if (compose && (destination === "home" || destination === "all")) {
        const products = new Map(result.products.map(product => [product.id, product]));
        const pautaOnly = destination === "all" ? result.products.filter(p => !heroCandidates.some(c => c.id === p.id)) : [];
        result.products = [...home.flatMap(({ candidate }) => products.has(candidate.id) ? [products.get(candidate.id)!] : []), ...pautaOnly];
      }
      result.heroProductIds = highlights.map(({ candidate }) => candidate.id);
      result.heroValidUntil = highlightDeadline(highlights.map(({ candidate }) => candidate), selection.validUntil);
      return present(result);
    });
  } finally { await sql.end(); }
}

export async function getPublishedEditorialSelection(destination: EditorialDestination | "all", tenantId = scopedTenantId(), sqlFactory: typeof db = db): Promise<PublishedEditorialSelection> {
  const { readHomepageEdition } = await import("./homepage-db.ts");
  const stored = await readHomepageEdition(destination, tenantId, sqlFactory);
  // Transition until explicit initialization. An initialized empty edition stays empty.
  return stored ?? await computeEditorialSelection(destination, tenantId, sqlFactory, undefined, false);
}

export async function getEditorialProductPresentation(productId: string, tenantId = scopedTenantId()) {
  const presentation = (await getProductPresentations([productId], tenantId)).get(productId);
  if (!presentation || presentation.titleOrigin !== "editorial") return null;
  return { ...presentation, editorialRationale: presentation.benefit ?? "", editorialPurchaseContents: presentation.purchaseContents ?? "" };
}
