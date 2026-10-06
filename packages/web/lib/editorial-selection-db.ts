import { sameOfferConfigurationSql } from "./offer-history.ts";
import { db } from "./db.ts";
import { productSlug } from "./marketplaces.ts";
import { catalogHeroPresentation, rankHeroCandidates } from "./hero-ranking.ts";
import {
  EDITORIAL_POLICY_VERSION, editorialEvidenceFingerprint, editorialSelectionBlockers,
  validateEditorialAssessment, validateEditorialSelection,
  type EditorialAssessment, type EditorialAssessmentInput, type EditorialCandidate,
  type EditorialDestination, type EditorialSelection, type PublishedEditorialSelection,
  type ReplaceEditorialSelectionInput,
} from "./editorial-selection.ts";

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
  const material = { title: row.title, imageUrl: row.image_url, category: row.category, productUrl: row.product_url,
    ratingStar: row.rating_star, offerEvidence: row.offer_evidence };
  const candidate: EditorialCandidate = {
    id: row.id, slug: productSlug(row.marketplace, row.external_id), title: row.title,
    marketplace: row.marketplace, imageUrl: row.image_url, category: row.category,
    priceCents: row.price_cents, originalPriceCents: row.original_price_cents,
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

type AssessmentRow = { id: string; product_id: string; assessment: EditorialAssessmentInput; snapshot: { price_cents?: number }; policy_version: string; created_at: Date | string };
function toAssessment(row: AssessmentRow): EditorialAssessment {
  return { ...row.assessment, id: row.id, policyVersion: row.policy_version, createdAt: new Date(row.created_at).toISOString(),
    priceCentsAtAssessment: row.snapshot?.price_cents };
}
async function latestAssessments(sql: QueryClient, tenantId: string): Promise<Map<string, EditorialAssessment>> {
  const rows = await sql.unsafe<AssessmentRow[]>(`select distinct on (product_id)
    id, product_id, assessment, snapshot, policy_version, created_at from garimpa.editorial_assessment
    where tenant_id=$1 order by product_id, created_at desc, id desc`, [tenantId]);
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

export async function getEditorialSelectionDesk(tenantId = "local", sqlFactory: typeof db = db): Promise<{
  schemaReady: boolean; selection: EditorialSelection | null; candidates: EditorialCandidate[]; catalogHeroActive: boolean;
}> {
  if (!process.env.DATABASE_URL) return { schemaReady: false, selection: null, candidates: [], catalogHeroActive: false };
  const sql = sqlFactory();
  try {
    if (!await editorialSelectionSchemaReady(sql)) return { schemaReady: false, selection: null, candidates: [], catalogHeroActive: false };
    // One repeatable snapshot for desk state and optimistic version.
    return await sql.begin("isolation level repeatable read read only", async (tx) => {
      const selection = await readSelection(tx, tenantId);
      const assessments = await latestAssessments(tx, tenantId);
      const rows = await candidateRows(tx, tenantId);
      return { schemaReady: true, selection, candidates: rows.map((row) => toCandidate(row, assessments.get(row.id) ?? null)),
        catalogHeroActive: !selection && !await hasEditorialEdition(tx, tenantId) };
    });
  } finally { await sql.end(); }
}

export async function saveEditorialAssessment(input: EditorialAssessmentInput, reviewerId: string, tenantId = "local", sqlFactory: typeof db = db):
Promise<{ ok: true; assessment: EditorialAssessment } | { ok: false; error: string }> {
  const validated = validateEditorialAssessment(input);
  if (!validated.ok) return validated;
  if (!reviewerId || !process.env.DATABASE_URL) return { ok: false, error: "forbidden" };
  const sql = sqlFactory();
  try {
    if (!await editorialSelectionSchemaReady(sql)) return { ok: false, error: "migration_required" };
    return await sql.begin(async (tx) => {
      const actors = await tx`select id from garimpa.app_user where id=${reviewerId} and tenant_id=${tenantId}`;
      if (!actors.length) return { ok: false as const, error: "forbidden" };
      await tx`select id from garimpa.product where id=${validated.value.productId} and tenant_id=${tenantId} for no key update`;
      const rows = await candidateRows(tx, tenantId, [validated.value.productId]);
      if (!rows[0] || rows[0].status !== "approved") return { ok: false as const, error: "product_not_approved" };
      const candidate = toCandidate(rows[0], null);
      if (candidate.evidenceFingerprint !== validated.value.evidenceFingerprint) return { ok: false as const, error: "evidence_changed" };
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

export async function replaceEditorialSelection(input: ReplaceEditorialSelectionInput, reviewerId: string, tenantId = "local", sqlFactory: typeof db = db):
Promise<{ ok: true; selection: EditorialSelection } | { ok: false; error: string }> {
  const validated = validateEditorialSelection(input);
  if (!validated.ok) return validated;
  if (!reviewerId || !process.env.DATABASE_URL) return { ok: false, error: "forbidden" };
  const sql = sqlFactory();
  try {
    if (!await editorialSelectionSchemaReady(sql)) return { ok: false, error: "migration_required" };
    return await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${`editorial-selection:${tenantId}`}, 0))`;
      const actors = await tx`select id from garimpa.app_user where id=${reviewerId} and tenant_id=${tenantId}`;
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

export async function getPublishedEditorialSelection(destination: EditorialDestination | "all", tenantId = "local", sqlFactory: typeof db = db): Promise<PublishedEditorialSelection> {
  const empty: PublishedEditorialSelection = { mode: "unavailable", schemaReady: false, id: null, version: null, validUntil: null, products: [], heroProductIds: [], heroValidUntil: null };
  if (!process.env.DATABASE_URL) return empty;
  const sql = sqlFactory();
  try {
    if (!await editorialSelectionSchemaReady(sql)) return empty;
    return await sql.begin("isolation level repeatable read read only", async (tx) => {
      const selection = await readSelection(tx, tenantId);
      const now = new Date();
      if (!selection) {
        // Bootstrap only: never resurrect an explicitly empty, expired or
        // retired edition through the approved catalog.
        if (await hasEditorialEdition(tx, tenantId)) return { ...empty, schemaReady: true, mode: "editorial" };
        const assessments = await latestAssessments(tx, tenantId);
        const rows = await candidateRows(tx, tenantId);
        const candidates = rows.map((row) => toCandidate(row, assessments.get(row.id) ?? null, now));
        const highlights = rankHeroCandidates(candidates, now).filter((entry) => entry.selectedForHero);
        const validUntil = highlightDeadline(highlights.map(({ candidate }) => candidate));
        return { ...empty, schemaReady: true, mode: "catalog", validUntil, heroValidUntil: validUntil,
          heroProductIds: highlights.map(({ candidate }) => candidate.id),
          products: highlights.map(({ candidate, classification }) => ({ ...publicProduct(candidate),
            ...(candidate.assessment ? { editorialRationale: candidate.assessment.publicRationale, editorialPurchaseContents: candidate.assessment.purchaseContents } : catalogHeroPresentation(candidate, classification)),
            selectionItemId: `catalog:${candidate.id}`, editorialContext: "" })) };
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
      const heroCandidates: EditorialCandidate[] = [];
      for (const item of items) {
        const stored = await tx<AssessmentRow[]>`select id, product_id, assessment, snapshot, policy_version, created_at from garimpa.editorial_assessment
          where id=${item.assessmentId} and product_id=${item.productId} and tenant_id=${tenantId}`;
        const row = byId.get(item.productId);
        if (!row || !stored.length) continue;
        const assessment = toAssessment(stored[0]);
        if (newest.get(item.productId)?.id !== assessment.id) continue;
        const candidate = toCandidate(row, assessment, now);
        if (candidate.selectionBlockers.length) continue;
        if (item.destinations.includes("home")) heroCandidates.push(candidate);
        if (destination !== "all" && !item.destinations.includes(destination)) continue;
        // Explicit public projection: never serialize internal judgments or doubts.
        result.products.push({ ...publicProduct(candidate), editorialRationale: assessment.publicRationale,
          editorialPurchaseContents: assessment.purchaseContents,
          selectionItemId: `${selection.id}:${candidate.id}`, editorialContext: item.context });
      }
      const positions = new Map(items.map((item) => [item.productId, item.position]));
      const highlights = rankHeroCandidates(heroCandidates, now, positions).filter((entry) => entry.selectedForHero);
      result.heroProductIds = highlights.map(({ candidate }) => candidate.id);
      result.heroValidUntil = highlightDeadline(highlights.map(({ candidate }) => candidate), selection.validUntil);
      return result;
    });
  } finally { await sql.end(); }
}

export async function getEditorialProductPresentation(productId: string, tenantId = "local") {
  const selection = await getPublishedEditorialSelection("all", tenantId);
  return selection.products.find((product) => product.id === productId) ?? null;
}
