import { scopedTenantId } from "./account-scope.ts";
import type postgres from "postgres";
import { PRODUCT_EVIDENCE_TTL_DAYS } from "./catalog-policy.ts";
import { db } from "./db.ts";
import { withTenantDb, withAccountDb, type AccountContext } from "./tenant-db.ts";
import { projectConservativePriceEvidence } from "./offer-history.ts";
import { productSlug } from "./marketplaces.ts";
import type {
  CurationBulkContext,
  CurationReason,
  CurationStatus,
  ValidCurationBulk,
  ValidCurationDeferral,
  ValidCurationDecision,
  ValidGroupAction,
} from "./curation-contract.ts";
import type { TriageDecision } from "./ai-curation-contract.ts";
import {
  processIngestionPipeline,
  type CandidateProduct,
  type PipelineOptions,
} from "./curation-pipeline.ts";
import { getEditorialGuideline, getGoldenExamples } from "./editorial-compass.ts";
import { loadAutomatedTriageCandidates, triageInputStillCurrent } from "./triage-candidates-db.ts";
import { curationSignalsFor, type CurationSignalId } from "./curation-signals.ts";
import { buildSnapshotMetadata, type CurationSnapshotFacts, type CurationSnapshotProvenance } from "./curation-snapshot.ts";
import { resolveVariantEvidence } from "./comparison-evidence.ts";
import {
  editorialGroupIdFor,
  matchesEditorialGroup,
  selectRepresentatives,
  type GroupMemberProduct,
} from "./editorial-groups.ts";
import { stateAfterDecision, stateRestoredByUndo, type StoredCurationState } from "./curation-transition.ts";

export interface CurationSummary {
  awaiting: number;
  newPending: number;
  legacyVisible: number;
  held: number;
  approved: number;
  rejected: number;
  deferred: number;
}

/**
 * Fatos da fila — mesmo formato para a tela e para o snapshot da decisão.
 * A leitura usa a view `garimpa.curation_queue_facts` (única fonte).
 */
export interface CurationQueueRow {
  id: string;
  external_id: string;
  title: string;
  productUrl: string;
  imageUrl: string | null;
  category: string | null;
  familyKey: string | null;
  familyLabel: string | null;
  familyMethod: string | null;
  familyVersion: string | null;
  marketplace: string;
  status: Extract<CurationStatus, "legacy_visible" | "pending" | "held">;
  reasonCode?: CurationReason | null;
  reasonDetail?: string | null;
  priceCents: number;
  originalPriceCents: number | null;
  claimedDiscountRate: number | null;
  ratingStar: number | null;
  salesLabel: string | null;
  salesCount: number | null;
  observedAt: Date | string;
  observationCount: number;
  historyDays: number;
  previousMinPriceCents: number | null;
  lowestVerified: boolean;
  queuedAt: Date | string;
  deferredUntil: string | null;
  presentingCaptureRunId: string | null;
  presentingMarketplace: string | null;
  presentingPlanId: string | null;
  presentingQueryId: string | null;
  presentingMode: string | null;
  presentingTargetCategory: string | null;
  presentingTargetFamily: string | null;
  offerEvidence?: Record<string, unknown> | null;
  variant?: { confirmed: boolean; description: string; variantKey: string | null; variantLabel: string | null } | null;
}

export interface CurationAiInsight {
  score: number;
  justification: string;
  editorialCategory?: string;
}

export interface CurationQueueProduct extends CurationQueueRow {
  slug: string;
  aiInsight?: CurationAiInsight | null;
}

const QUEUE_FACTS_COLUMNS = `
  f.id, f.external_id, f.title, f.product_url as "productUrl", f.image_url as "imageUrl",
  f.category, f.family_key as "familyKey", f.family_label as "familyLabel",
  f.family_method as "familyMethod", f.family_version as "familyVersion",
  f.marketplace, f.status, f.reason_code as "reasonCode", f.reason_detail as "reasonDetail", f.price_cents as "priceCents",
  f.original_price_cents as "originalPriceCents",
  f.claimed_discount_rate as "claimedDiscountRate",
  f.rating_star as "ratingStar", f.sales_label as "salesLabel",
  f.sales_count as "salesCount", f.observed_at as "observedAt",
  f.observation_count as "observationCount", f.history_days as "historyDays",
  f.previous_min_price_cents as "previousMinPriceCents",
  f.lowest_verified as "lowestVerified", f.queued_at as "queuedAt",
  f.deferred_until::text as "deferredUntil",
  f.presenting_capture_run_id as "presentingCaptureRunId",
  f.presenting_marketplace as "presentingMarketplace",
  f.presenting_plan_id as "presentingPlanId",
  f.presenting_query_id as "presentingQueryId",
  f.presenting_mode as "presentingMode",
  f.presenting_target_category as "presentingTargetCategory",
  f.presenting_target_family as "presentingTargetFamily"
`;

/** Conexão de transação usada nas consultas de fatos da fila. */
type TxLike = postgres.TransactionSql | postgres.Sql<{}>;

export async function curationSummary(
  tenantId = scopedTenantId(),
  sqlFactory: typeof db = db,
  context?: AccountContext,
): Promise<CurationSummary> {
  if (!context) throw new Error("account_context_required: private curation summary requires authorized AccountContext");
  if (context.tenantId !== tenantId) throw new Error("forbidden: tenant inválido para o contexto de conta");
  const { readInRequest } = await import("./request-read.ts");
  return readInRequest(["curationSummary", tenantId, context.tenantId, sqlFactory, context?.affiliateId, context?.actor,
    context?.actorAppUserId, context?.authenticatedAuthUserId, context?.membershipRole, context?.requestId],
    () => readCurationSummary(tenantId, sqlFactory, context));
}

async function readCurationSummary(
  tenantId = scopedTenantId(),
  sqlFactory: typeof db = db,
  context?: AccountContext,
): Promise<CurationSummary> {
  if (!context) {
    throw new Error("account_context_required: private curation summary requires authorized AccountContext");
  }
  if (context.tenantId !== tenantId) {
    throw new Error("forbidden: tenant inválido para o contexto de conta");
  }

  const queryFn = async (sql: any) => {
    const rows = await sql<Array<Record<string, number>>>`
      select
        count(*) filter (where status in ('legacy_visible', 'pending')
          and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
          and (deferred_until is null or deferred_until <= now()))::int as awaiting,
        count(*) filter (where status = 'pending'
          and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
          and (deferred_until is null or deferred_until <= now()))::int as new_pending,
        count(*) filter (where status = 'legacy_visible'
          and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
          and (deferred_until is null or deferred_until <= now()))::int as legacy_visible,
        count(*) filter (where status = 'held'
          and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
          and (deferred_until is null or deferred_until <= now()))::int as held,
        count(*) filter (where status = 'approved'
          and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day'))::int as approved,
        count(*) filter (where status in ('legacy_visible','pending','held')
          and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
          and deferred_until > now())::int as deferred,
        count(*) filter (where status = 'rejected')::int as rejected
      from garimpa.product_curation c
      join garimpa.product p on p.id = c.product_id and p.tenant_id = c.tenant_id
      where c.tenant_id = ${tenantId}
    `;
    const row = rows[0] ?? {};
    return {
      awaiting: row.awaiting ?? 0,
      newPending: row.new_pending ?? 0,
      legacyVisible: row.legacy_visible ?? 0,
      held: row.held ?? 0,
      approved: row.approved ?? 0,
      rejected: row.rejected ?? 0,
      deferred: row.deferred ?? 0,
    };
  };

  return await withAccountDb(context, queryFn, sqlFactory);
}

export async function curationQueue(
  limit = 20,
  tenantId = scopedTenantId(),
  queue: "awaiting" | "held" | "deferred" = "awaiting",
  sqlFactory: typeof db = db,
): Promise<CurationQueueProduct[]> {
  return await withTenantDb(tenantId, async (sql) => {
    const rows = await sql<CurationQueueRow[]>`
      select
        ${sql.unsafe(QUEUE_FACTS_COLUMNS)},
        latest_obs.offer_evidence as "offerEvidence"
      from garimpa.curation_queue_facts f
      left join lateral (
        select obs.offer_evidence
        from garimpa.price_observation obs
        where obs.tenant_id = f.tenant_id and obs.product_id = f.id
        order by obs.observed_at desc
        limit 1
      ) latest_obs on true
      where f.tenant_id = ${tenantId}
        and f.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
        and (
          (${queue} = 'awaiting' and f.status in ('legacy_visible', 'pending')
            and (f.deferred_until is null or f.deferred_until <= now()))
          or (${queue} = 'held' and f.status = 'held'
            and (f.deferred_until is null or f.deferred_until <= now()))
          or (${queue} = 'deferred' and f.status in ('legacy_visible','pending','held') and f.deferred_until > now())
        )
      order by
        (f.status = 'pending') desc,
        f.last_seen_at desc,
        f.queued_at asc,
        f.id asc
      limit ${Math.min(Math.max(limit, 1), 50)}
    `;

    const productIds = rows.map((r) => r.id);
    const aiInsightMap = new Map<string, CurationAiInsight>();
    const rationaleMap = new Map<string, string>();
    if (productIds.length > 0) {
      const events = await sql<{ product_id: string; metadata: any }[]>`
        select distinct on (product_id) product_id, metadata
        from garimpa.curation_event
        where tenant_id = ${tenantId}
          and product_id = any(${productIds})
        order by product_id, id desc
      `;
      for (const e of events) {
        const auto = e.metadata?.automation;
        if (typeof auto?.rationale === "string") rationaleMap.set(e.product_id, auto.rationale);
        if (auto && typeof auto.aiScore === "number" && typeof auto.aiJustification === "string") {
          aiInsightMap.set(e.product_id, {
            score: auto.aiScore,
            justification: auto.aiJustification,
            editorialCategory: auto.editorialCategory,
          });
        }
      }
    }

    return rows.map((r) => {
      const row = projectConservativePriceEvidence(r);
      const variant = resolveVariantEvidence({ externalId: row.external_id, title: row.title, offerEvidence: row.offerEvidence });
      return {
        ...row,
        variant,
        reasonDetail: row.reasonDetail ?? (row.status === "held" ? rationaleMap.get(row.id) ?? null : null),
        slug: productSlug(row.marketplace, row.external_id),
        aiInsight: aiInsightMap.get(row.id) ?? null,
      };
    });
  }, sqlFactory);
}

export interface CurationGroupCard {
  groupId: string;
  familyKey: string;
  familyLabel: string;
  familyMethod: string;
  familyVersion: string;
  groupingReason: string;
  totalCount: number;
  marketplaceDistribution: Record<string, number>;
  priceRange: { minCents: number; maxCents: number };
  representatives: CurationQueueProduct[];
  withoutFamilyCount: number;
}

function toGroupMemberProduct(row: CurationQueueRow, tenantId: string): GroupMemberProduct {
  const variant = resolveVariantEvidence({
    externalId: row.external_id,
    title: row.title,
    offerEvidence: row.offerEvidence,
  });
  const rawReviewCount = (row.offerEvidence as any)?.review_count ?? (row.offerEvidence as any)?.reviewCount;
  const reviewCount = typeof rawReviewCount === "number" && Number.isSafeInteger(rawReviewCount) && rawReviewCount >= 0
    ? rawReviewCount
    : null;

  return {
    tenantId,
    productId: row.id,
    marketplace: row.marketplace,
    family: row.familyKey && row.familyMethod && row.familyVersion
      ? {
          key: row.familyKey,
          label: row.familyLabel ?? undefined,
          method: row.familyMethod,
          version: row.familyVersion,
        }
      : null,
    status: row.status,
    observedAt: new Date(row.observedAt).toISOString(),
    priceCents: row.priceCents,
    ratingStar: row.ratingStar,
    salesLabel: row.salesLabel,
    salesCount: row.salesCount,
    observationCount: row.observationCount,
    lowestVerified: row.lowestVerified,
    reviewCount,
    variant,
    offerEvidence: row.offerEvidence ?? null,
  };
}

/**
 * Consulta de cards de grupos para a aba "Grupos repetitivos" (M4-E).
 * Retorna grupos ordenados por volume e até 5 representantes por evidência e variação,
 * sem carregar centenas de produtos desnecessariamente para a memória do cliente.
 */
export async function curationGroupCards(
  limit = 20,
  tenantId = scopedTenantId(),
  sqlFactory: typeof db = db,
): Promise<CurationGroupCard[]> {
  return await withTenantDb(tenantId, async (sql) => {
    const withoutFamilyRow = await sql<{ count: number }[]>`
      select count(*)::int as count
      from garimpa.product p
      join garimpa.product_curation c on c.product_id = p.id and c.tenant_id = p.tenant_id
      where p.tenant_id = ${tenantId}
        and p.family_key is null
        and c.status in ('legacy_visible', 'pending')
        and (c.deferred_until is null or c.deferred_until <= now())
        and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
    `;
    const withoutFamilyCount = withoutFamilyRow[0]?.count ?? 0;

    // Buscar membros de grupos com família que estão aguardando avaliação
    const rows = await sql<CurationQueueRow[]>`
      select
        ${sql.unsafe(QUEUE_FACTS_COLUMNS)},
        latest_obs.offer_evidence as "offerEvidence"
      from garimpa.curation_queue_facts f
      left join lateral (
        select obs.offer_evidence
        from garimpa.price_observation obs
        where obs.tenant_id = f.tenant_id and obs.product_id = f.id
        order by obs.observed_at desc
        limit 1
      ) latest_obs on true
      where f.tenant_id = ${tenantId}
        and f.family_key is not null
        and f.status in ('legacy_visible', 'pending')
        and (f.deferred_until is null or f.deferred_until <= now())
        and f.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
      order by f.last_seen_at desc, f.queued_at asc
    `;

    if (rows.length === 0) return [];

    // Agrupar por família (key|method|version)
    const byFamily = new Map<string, CurationQueueRow[]>();
    for (const row of rows) {
      if (!row.familyKey || !row.familyMethod || !row.familyVersion) continue;
      const key = `${row.familyKey}|${row.familyMethod}|${row.familyVersion}`;
      const bucket = byFamily.get(key) ?? [];
      bucket.push(row);
      byFamily.set(key, bucket);
    }

    // Ordenar grupos por contagem descendente
    const sortedFamilies = [...byFamily.entries()]
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, Math.min(Math.max(limit, 1), 50));

    const cards: CurationGroupCard[] = [];
    for (const [, familyRows] of sortedFamilies) {
      const first = familyRows[0]!;
      const familyKey = first.familyKey!;
      const familyLabel = first.familyLabel ?? familyKey;
      const familyMethod = first.familyMethod!;
      const familyVersion = first.familyVersion!;
      const groupId = editorialGroupIdFor(tenantId, familyKey, familyMethod, familyVersion);

      const marketplaceDistribution: Record<string, number> = {};
      for (const r of familyRows) {
        marketplaceDistribution[r.marketplace] = (marketplaceDistribution[r.marketplace] ?? 0) + 1;
      }

      const prices = familyRows.map((r) => r.priceCents);
      const minCents = Math.min(...prices);
      const maxCents = Math.max(...prices);

      // Obter até 5 representantes ordenados por evidência e variação
      const memberProducts = familyRows.map((r) => toGroupMemberProduct(r, tenantId));
      const repIds = selectRepresentatives(memberProducts);
      const repRows = repIds
        .map((id) => familyRows.find((r) => r.id === id))
        .filter((r): r is CurationQueueRow => r !== undefined)
        .map((r) => ({
          ...projectConservativePriceEvidence(r),
          variant: resolveVariantEvidence({
            externalId: r.external_id,
            title: r.title,
            offerEvidence: r.offerEvidence,
          }),
          slug: productSlug(r.marketplace, r.external_id),
        }));

      cards.push({
        groupId,
        familyKey,
        familyLabel,
        familyMethod,
        familyVersion,
        groupingReason: `Palavras-chave do título (${familyMethod} ${familyVersion})`,
        totalCount: familyRows.length,
        marketplaceDistribution,
        priceRange: { minCents, maxCents },
        representatives: repRows,
        withoutFamilyCount,
      });
    }

    return cards;
  }, sqlFactory);
}

/** Busca sob demanda todos os membros de um grupo específico (M4-E). */
export async function groupMembers(
  groupId: string,
  tenantId = scopedTenantId(),
  sqlFactory: typeof db = db,
): Promise<CurationQueueProduct[]> {
  return await withTenantDb(tenantId, async (sql) => {
    const rows = await sql<CurationQueueRow[]>`
      select
        ${sql.unsafe(QUEUE_FACTS_COLUMNS)},
        latest_obs.offer_evidence as "offerEvidence"
      from garimpa.curation_queue_facts f
      left join lateral (
        select obs.offer_evidence
        from garimpa.price_observation obs
        where obs.tenant_id = f.tenant_id and obs.product_id = f.id
        order by obs.observed_at desc
        limit 1
      ) latest_obs on true
      where f.tenant_id = ${tenantId}
        and f.family_key is not null
        and f.status in ('legacy_visible', 'pending')
        and (f.deferred_until is null or f.deferred_until <= now())
        and f.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
      order by f.price_cents asc, f.id asc
    `;
    const members = rows.filter((r) =>
      r.familyKey && r.familyMethod && r.familyVersion &&
      matchesEditorialGroup(groupId, tenantId, {
        key: r.familyKey,
        method: r.familyMethod,
        version: r.familyVersion,
      })
    );
    return members.map((row) => ({
      ...projectConservativePriceEvidence(row),
      variant: resolveVariantEvidence({
        externalId: row.external_id,
        title: row.title,
        offerEvidence: row.offerEvidence,
      }),
      slug: productSlug(row.marketplace, row.external_id),
    }));
  }, sqlFactory);
}

/** Busca os fatos de um produto para o snapshot imutável (dentro da transação). */
async function queueFacts(
  tx: TxLike,
  tenantId: string,
  productId: string,
): Promise<CurationQueueRow | null> {
  const rows = await tx<CurationQueueRow[]>`
    select
      ${tx.unsafe(QUEUE_FACTS_COLUMNS)},
      latest_obs.offer_evidence as "offerEvidence"
    from garimpa.curation_queue_facts f
    left join lateral (
      select obs.offer_evidence
      from garimpa.price_observation obs
      where obs.tenant_id = f.tenant_id and obs.product_id = f.id
      order by obs.observed_at desc
      limit 1
    ) latest_obs on true
    where f.tenant_id = ${tenantId} and f.id = ${productId}
      and f.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
    limit 1
  `;
  return rows[0] ?? null;
}

export interface ReviewResult {
  eventId: string;
  productId: string;
  fromStatus: CurationStatus;
  toStatus: CurationStatus;
}

export interface ReviewContext {
  groupId?: string | null;
  reviewSessionId?: string | null;
  bulkActionId?: string | null;
}

const POLICY_VERSION = "v1";

function toSnapshotFacts(row: CurationQueueRow): CurationSnapshotFacts {
  const signals: CurationSignalId[] = curationSignalsFor({
    observationCount: row.observationCount,
    claimedDiscountRate: row.claimedDiscountRate,
    category: row.category,
    ratingStar: row.ratingStar,
  });
  const provenance: CurationSnapshotProvenance = {
    presentingCaptureRunId: row.presentingCaptureRunId ?? null,
    presentingMarketplace: row.presentingMarketplace ?? null,
    planId: row.presentingPlanId ?? null,
    queryId: row.presentingQueryId ?? null,
    mode: row.presentingMode ?? null,
    targetCategory: row.presentingTargetCategory ?? null,
    targetFamily: row.presentingTargetFamily ?? null,
  };
  const variant = resolveVariantEvidence({
    externalId: row.external_id,
    title: row.title,
    offerEvidence: row.offerEvidence,
  });
  const rawReviewCount = (row.offerEvidence as any)?.review_count ?? (row.offerEvidence as any)?.reviewCount;
  const reviewCount = typeof rawReviewCount === "number" && Number.isSafeInteger(rawReviewCount) && rawReviewCount >= 0
    ? rawReviewCount
    : null;

  return {
    productId: row.id,
    slug: productSlug(row.marketplace, row.external_id),
    marketplace: row.marketplace,
    externalId: row.external_id,
    title: row.title,
    productUrl: row.productUrl,
    imageUrl: row.imageUrl,
    category: row.category,
    family:
      row.familyKey && row.familyLabel && row.familyMethod && row.familyVersion
        ? { key: row.familyKey, label: row.familyLabel, method: row.familyMethod, version: row.familyVersion }
        : null,
    statusBefore: row.status,
    priceCents: row.priceCents,
    originalPriceCents: row.originalPriceCents,
    claimedDiscountRate: row.claimedDiscountRate,
    ratingStar: row.ratingStar,
    salesLabel: row.salesLabel,
    salesCount: row.salesCount,
    observedAt: new Date(row.observedAt).toISOString(),
    observationCount: row.observationCount,
    historyDays: row.historyDays,
    previousMinPriceCents: row.previousMinPriceCents,
    lowestVerified: row.lowestVerified,
    signalsShown: signals,
    provenance,
    reviewCount,
    variant,
    offerEvidenceSource: (() => {
      const rawSource = (row.offerEvidence as any)?.source;
      if (rawSource && typeof rawSource === "object" && typeof rawSource.marketplace === "string") {
        return {
          marketplace: rawSource.marketplace,
          method: typeof rawSource.method === "string" ? rawSource.method : null,
          url: typeof rawSource.url === "string" ? rawSource.url : null,
          capturedAt: typeof rawSource.capturedAt === "string" ? rawSource.capturedAt : null,
        };
      }
      return row.marketplace ? { marketplace: row.marketplace } : null;
    })(),
  };
}

async function applyDecision(
  tx: TxLike,
  tenantId: string,
  productId: string,
  decision: { status: CurationStatus; reasonCode: CurationReason | null; reasonDetail: string | null },
  reviewerAppUserId: string,
  via: "review" | "bulk",
  context: ReviewContext,
): Promise<ReviewResult | null> {
  const currentRows = await tx<StoredCurationState[]>`
    select status, reason_code as "reasonCode", reason_detail as "reasonDetail",
           deferred_until as "deferredUntil"
    from garimpa.product_curation
    where tenant_id = ${tenantId} and product_id = ${productId}
    for update
  `;
  const current = currentRows[0];
  if (!current) return null;

  const facts = await queueFacts(tx, tenantId, productId);
  if (!facts) return null;

  if (context.groupId) {
    const family = facts.familyKey && facts.familyMethod && facts.familyVersion
      ? { key: facts.familyKey, method: facts.familyMethod, version: facts.familyVersion }
      : null;
    if (!matchesEditorialGroup(context.groupId, tenantId, family)) {
      throw new Error("curation_group_mismatch");
    }
  }

  const target = stateAfterDecision(decision);

  const snapshotMetadata = buildSnapshotMetadata(toSnapshotFacts(facts), {
    via,
    groupId: context.groupId ?? null,
    reviewSessionId: context.reviewSessionId ?? null,
    bulkActionId: context.bulkActionId ?? null,
    policyVersion: POLICY_VERSION,
  });
  const metadata = snapshotMetadata;

  await tx`
    update garimpa.product_curation
    set status = ${target.status}, reason_code = ${target.reasonCode},
        reason_detail = ${target.reasonDetail}, deferred_until = ${target.deferredUntil},
        reviewed_by_app_user_id = ${reviewerAppUserId},
        reviewed_at = now(), updated_at = now()
    where tenant_id = ${tenantId} and product_id = ${productId}
  `;
  const events = await tx<{ id: string }[]>`
    insert into garimpa.curation_event
      (tenant_id, product_id, from_status, to_status, reason_code, reason_detail,
       from_reason_code, from_reason_detail, from_deferred_until,
       actor_type, actor_app_user_id, policy_version, metadata,
       group_id, review_session_id, bulk_action_id)
    values (${tenantId}, ${productId}, ${current.status}, ${target.status},
            ${target.reasonCode}, ${target.reasonDetail},
            ${current.reasonCode}, ${current.reasonDetail}, ${current.deferredUntil},
            'human', ${reviewerAppUserId},
            ${POLICY_VERSION}, ${tx.json(metadata)},
            ${context.groupId ?? null}, ${context.reviewSessionId ?? null},
            ${context.bulkActionId ?? null})
    returning id::text as id
  `;
  return {
    eventId: events[0]!.id,
    productId,
    fromStatus: current.status,
    toStatus: target.status,
  };
}

export async function reviewProduct(
  decision: ValidCurationDecision,
  reviewerAppUserId: string,
  tenantId = scopedTenantId(),
  context: ReviewContext = {},
  sqlFactory: typeof db = db,
): Promise<ReviewResult | null> {
  return await withTenantDb(tenantId, async (tx) => {
    return applyDecision(tx as TxLike, tenantId, decision.productId, decision, reviewerAppUserId, "review", context);
  }, sqlFactory);
}

/** Ação em lote: um evento por produto, mesma transação, ids de contexto comuns. */
export async function reviewProductsBulk(
  bulk: ValidCurationBulk,
  reviewerAppUserId: string,
  tenantId = scopedTenantId(),
  sqlFactory: typeof db = db,
): Promise<ReviewResult[]> {
  return await withTenantDb(tenantId, async (tx) => {
    const results: ReviewResult[] = [];
    for (const decision of bulk.decisions) {
      const result = await applyDecision(
        tx as TxLike,
        tenantId,
        decision.productId,
        decision,
        reviewerAppUserId,
        "bulk",
        bulk.context,
      );
      if (!result) throw new Error(`produto indisponível para decisão em lote: ${decision.productId}`);
      results.push(result);
    }
    return results;
  }, sqlFactory);
}

export async function undoReview(
  productId: string,
  eventId: string,
  reviewerAppUserId: string,
  tenantId = scopedTenantId(),
  sqlFactory: typeof db = db,
): Promise<boolean> {
  return await withTenantDb(tenantId, async (tx) => {
    const currentRows = await tx<StoredCurationState[]>`
        select status, reason_code as "reasonCode", reason_detail as "reasonDetail",
               deferred_until as "deferredUntil"
        from garimpa.product_curation
        where tenant_id = ${tenantId} and product_id = ${productId}
        for update
      `;
      const current = currentRows[0];
      if (!current) return false;

      const rows = await tx<{
        id: string;
        from_status: CurationStatus | null;
        to_status: CurationStatus;
        actor_app_user_id: string | null;
        group_id: string | null;
        review_session_id: string | null;
        bulk_action_id: string | null;
        from_reason_code: CurationReason | null;
        from_reason_detail: string | null;
        from_deferred_until: Date | string | null;
      }[]>`
        select id::text as id, from_status, to_status, actor_app_user_id,
               group_id, review_session_id, bulk_action_id,
               from_reason_code, from_reason_detail, from_deferred_until
        from garimpa.curation_event
        where tenant_id = ${tenantId} and product_id = ${productId}
        order by id desc
        limit 1
      `;
      const event = rows[0];
      if (!event || event.id !== eventId || event.actor_app_user_id !== reviewerAppUserId || !event.from_status) return false;
      if (current.status !== event.to_status) return false;

      const restored = stateRestoredByUndo({
        fromStatus: event.from_status,
        fromReasonCode: event.from_reason_code,
        fromReasonDetail: event.from_reason_detail,
        fromDeferredUntil: event.from_deferred_until,
      });
      if (!restored) return false;

      const facts = await queueFacts(tx as TxLike, tenantId, productId);
      if (!facts) return false;
      const factsBefore = { ...toSnapshotFacts(facts), statusBefore: event.to_status };
      const metadata = buildSnapshotMetadata(factsBefore, {
        via: "undo",
        groupId: event.group_id,
        reviewSessionId: event.review_session_id,
        bulkActionId: event.bulk_action_id,
        undoEventId: event.id,
        policyVersion: POLICY_VERSION,
      });

      const updated = await tx<{ product_id: string }[]>`
        update garimpa.product_curation
        set status = ${restored.status}, reason_code = ${restored.reasonCode},
            reason_detail = ${restored.reasonDetail}, deferred_until = ${restored.deferredUntil},
            reviewed_by_app_user_id = ${reviewerAppUserId}, reviewed_at = now(), updated_at = now()
        where tenant_id = ${tenantId} and product_id = ${productId} and status = ${event.to_status}
        returning product_id
      `;
      if (updated.length === 0) return false;

      await tx`
        insert into garimpa.curation_event
          (tenant_id, product_id, from_status, to_status, reason_code, reason_detail,
           from_reason_code, from_reason_detail, from_deferred_until, actor_type,
           actor_app_user_id, policy_version, metadata,
           group_id, review_session_id, bulk_action_id)
        values (${tenantId}, ${productId}, ${event.to_status}, ${restored.status},
                ${restored.reasonCode}, ${restored.reasonDetail},
                ${current.reasonCode}, ${current.reasonDetail}, ${current.deferredUntil},
                'human', ${reviewerAppUserId}, ${POLICY_VERSION}, ${tx.json(metadata)},
                ${event.group_id}, ${event.review_session_id}, ${event.bulk_action_id})
      `;
      return true;
    });
}

export interface GroupActionResult {
  bulkActionId: string;
  affectedCount: number;
  results: ReviewResult[];
}

/**
 * Ação em lote sobre grupo editorial (M4-E).
 * Executa em UMA ÚNICA transação atômica.
 * Recalcula e valida o groupId canônico no servidor.
 * Rejeita IDs duplicados antes da transação.
 * Se retainRemainingAsSaturation for true, retém os demais membros abertos como held/family_saturation.
 * Compartilha groupId, reviewSessionId e bulkActionId em todos os eventos gerados.
 */
export async function actOnGroup(
  input: ValidGroupAction,
  reviewerAppUserId: string,
  tenantId = scopedTenantId(),
  sqlFactory: typeof db = db,
): Promise<GroupActionResult> {
  const selectedIdSet = new Set(input.selectedProductIds);
  if (selectedIdSet.size !== input.selectedProductIds.length) {
    throw new Error("bulk_duplicate_product");
  }

  return await withTenantDb(tenantId, async (tx) => {
    const openRows = await tx<CurationQueueRow[]>`
        select
          ${tx.unsafe(QUEUE_FACTS_COLUMNS)},
          latest_obs.offer_evidence as "offerEvidence"
        from garimpa.curation_queue_facts f
        left join lateral (
          select obs.offer_evidence
          from garimpa.price_observation obs
          where obs.tenant_id = f.tenant_id and obs.product_id = f.id
          order by obs.observed_at desc
          limit 1
        ) latest_obs on true
        where f.tenant_id = ${tenantId}
          and f.status in ('legacy_visible', 'pending')
          and (f.deferred_until is null or f.deferred_until <= now())
          and f.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
          and f.family_key is not null
      `;

      const groupMembers = openRows.filter((r) =>
        r.familyKey && r.familyMethod && r.familyVersion &&
        matchesEditorialGroup(input.groupId, tenantId, {
          key: r.familyKey,
          method: r.familyMethod,
          version: r.familyVersion,
        })
      );

      if (groupMembers.length === 0) {
        throw new Error("curation_group_not_found");
      }

      const memberIdSet = new Set(groupMembers.map((m) => m.id));

      // AC-035.3 / BUG-019: Se retainRemainingAsSaturation for true, expectedMemberProductIds
      // é estritamente obrigatório e não pode ser ausente, vazio nem divergente.
      if (input.retainRemainingAsSaturation) {
        if (!input.expectedMemberProductIds || input.expectedMemberProductIds.length === 0) {
          throw new Error("curation_group_members_changed");
        }
      }

      if (input.expectedMemberProductIds) {
        if (input.expectedMemberProductIds.length === 0 && input.retainRemainingAsSaturation) {
          throw new Error("curation_group_members_changed");
        }
        if (input.expectedMemberProductIds.length > 0) {
          const expectedSet = new Set(input.expectedMemberProductIds);
          if (
            input.expectedMemberProductIds.length !== expectedSet.size ||
            memberIdSet.size !== expectedSet.size ||
            !input.expectedMemberProductIds.every((id) => memberIdSet.has(id))
          ) {
            throw new Error("curation_group_members_changed");
          }
        }
      }

      for (const id of input.selectedProductIds) {
        if (!memberIdSet.has(id)) {
          throw new Error(`curation_product_not_in_group: ${id}`);
        }
      }

      const decisions: ValidCurationDecision[] = [];

      for (const id of input.selectedProductIds) {
        decisions.push({
          productId: id,
          decision: input.action,
          status: input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "held",
          reasonCode: input.action === "approve" ? null : input.reasonCode,
          reasonDetail: input.action === "approve" ? null : input.reasonDetail,
        });
      }

      if (input.retainRemainingAsSaturation) {
        for (const member of groupMembers) {
          if (!selectedIdSet.has(member.id)) {
            decisions.push({
              productId: member.id,
              decision: "hold",
              status: "held",
              reasonCode: "family_saturation",
              reasonDetail: input.saturationJustification ?? null,
            });
          }
        }
      }

      if (decisions.length === 0) {
        throw new Error("bulk_empty");
      }

      const bulkActionId = crypto.randomUUID();
      const bulkContext: Required<CurationBulkContext> = {
        groupId: input.groupId,
        reviewSessionId: input.reviewSessionId,
        bulkActionId,
      };

      const results: ReviewResult[] = [];
      for (const dec of decisions) {
        const result = await applyDecision(
          tx as TxLike,
          tenantId,
          dec.productId,
          dec,
          reviewerAppUserId,
          "bulk",
          bulkContext,
        );
        if (!result) throw new Error(`produto indisponível para decisão em grupo: ${dec.productId}`);
        results.push(result);
      }

      return {
        bulkActionId,
        affectedCount: results.length,
        results,
      };
    }, sqlFactory);
}

/**
 * Desfaz integralmente uma ação em lote em UMA ÚNICA transação atômica (M4-E).
 * Restaura status, motivo, detalhe e adiamento anteriores de todos os produtos do lote.
 * Falha atômica se qualquer produto já tiver sofrido nova alteração ou divergir.
 */
export async function undoBulkReview(
  bulkActionId: string,
  reviewerAppUserId: string,
  tenantId = scopedTenantId(),
  sqlFactory: typeof db = db,
): Promise<boolean> {
  return await withTenantDb(tenantId, async (tx) => {
    const events = await tx<{
        id: string;
        product_id: string;
        from_status: CurationStatus | null;
        to_status: CurationStatus;
        actor_app_user_id: string | null;
        group_id: string | null;
        review_session_id: string | null;
        bulk_action_id: string | null;
        from_reason_code: CurationReason | null;
        from_reason_detail: string | null;
        from_deferred_until: Date | string | null;
      }[]>`
        select id::text as id, product_id, from_status, to_status,
               actor_app_user_id, group_id, review_session_id, bulk_action_id,
               from_reason_code, from_reason_detail, from_deferred_until
        from garimpa.curation_event
        where tenant_id = ${tenantId}
          and bulk_action_id = ${bulkActionId}
          and actor_app_user_id = ${reviewerAppUserId}
        order by id asc
      `;

      if (events.length === 0) return false;

      for (const event of events) {
        const currentRows = await tx<StoredCurationState[]>`
          select status, reason_code as "reasonCode", reason_detail as "reasonDetail",
                 deferred_until as "deferredUntil"
          from garimpa.product_curation
          where tenant_id = ${tenantId} and product_id = ${event.product_id}
          for update
        `;
        const current = currentRows[0];
        if (!current || current.status !== event.to_status) return false;

        const latestEvents = await tx<{ id: string }[]>`
          select id::text as id
          from garimpa.curation_event
          where tenant_id = ${tenantId} and product_id = ${event.product_id}
          order by id desc
          limit 1
        `;
        if (!latestEvents[0] || latestEvents[0].id !== event.id) return false;

        if (!event.from_status) return false;
        const restored = stateRestoredByUndo({
          fromStatus: event.from_status,
          fromReasonCode: event.from_reason_code,
          fromReasonDetail: event.from_reason_detail,
          fromDeferredUntil: event.from_deferred_until,
        });
        if (!restored) return false;
      }

      const undoBulkActionId = crypto.randomUUID();
      for (const event of events) {
        const restored = stateRestoredByUndo({
          fromStatus: event.from_status!,
          fromReasonCode: event.from_reason_code,
          fromReasonDetail: event.from_reason_detail,
          fromDeferredUntil: event.from_deferred_until,
        })!;

        const facts = await queueFacts(tx as TxLike, tenantId, event.product_id);
        if (!facts) return false;
        const factsBefore = { ...toSnapshotFacts(facts), statusBefore: event.to_status };
        const metadata = buildSnapshotMetadata(factsBefore, {
          via: "undo",
          groupId: event.group_id,
          reviewSessionId: event.review_session_id,
          bulkActionId: undoBulkActionId,
          undoEventId: event.id,
          policyVersion: POLICY_VERSION,
        });

        await tx`
          update garimpa.product_curation
          set status = ${restored.status}, reason_code = ${restored.reasonCode},
              reason_detail = ${restored.reasonDetail}, deferred_until = ${restored.deferredUntil},
              reviewed_by_app_user_id = ${reviewerAppUserId}, reviewed_at = now(), updated_at = now()
          where tenant_id = ${tenantId} and product_id = ${event.product_id} and status = ${event.to_status}
        `;

        await tx`
          insert into garimpa.curation_event
            (tenant_id, product_id, from_status, to_status, reason_code, reason_detail,
             from_reason_code, from_reason_detail, from_deferred_until, actor_type,
             actor_app_user_id, policy_version, metadata,
             group_id, review_session_id, bulk_action_id)
          values (${tenantId}, ${event.product_id}, ${event.to_status}, ${restored.status},
                  ${restored.reasonCode}, ${restored.reasonDetail},
                  ${event.to_status === 'approved' ? null : event.from_reason_code},
                  ${event.to_status === 'approved' ? null : event.from_reason_detail},
                  null,
                  'human', ${reviewerAppUserId}, ${POLICY_VERSION}, ${tx.json(metadata)},
                  ${event.group_id}, ${event.review_session_id}, ${undoBulkActionId})
        `;
      }

      return true;
    });
}

/** "Depois": adia o produto até a data, sem mudar o status editorial. */
export async function deferReview(
  deferral: ValidCurationDeferral,
  reviewerAppUserId: string,
  tenantId = scopedTenantId(),
  sqlFactory: typeof db = db,
): Promise<boolean> {
  return await withTenantDb(tenantId, async (sql) => {
    const updated = await sql<{ product_id: string }[]>`
      update garimpa.product_curation
      set deferred_until = ${new Date(deferral.deferredUntil)},
          reviewed_by_app_user_id = ${reviewerAppUserId},
          updated_at = now()
      where tenant_id = ${tenantId} and product_id = ${deferral.productId}
        and status in ('pending', 'legacy_visible', 'held')
      returning product_id
    `;
    return updated.length > 0;
  }, sqlFactory);
}

/** Desfaz o adiamento (volta para a fila imediatamente). */
export async function clearDeferredReview(
  productId: string,
  reviewerAppUserId: string,
  tenantId = scopedTenantId(),
  sqlFactory: typeof db = db,
): Promise<boolean> {
  return await withTenantDb(tenantId, async (sql) => {
    const updated = await sql<{ product_id: string }[]>`
      update garimpa.product_curation
      set deferred_until = null,
          reviewed_by_app_user_id = ${reviewerAppUserId},
          updated_at = now()
      where tenant_id = ${tenantId} and product_id = ${productId}
        and deferred_until is not null
      returning product_id
    `;
    return updated.length > 0;
  }, sqlFactory);
}

export interface TriageApplicationSummary {
  processed: number;
  approved: number;
  rejected: number;
  held: number;
  annotatedPending: number;
  triageRunId?: string;
}

export async function applyAutomatedTriageDecisions(
  decisions: TriageDecision[],
  tenantId = scopedTenantId(),
  triageRunId?: string,
  sqlFactory: typeof db = db,
  captureBatch?: { id: string; workerId: string },
): Promise<TriageApplicationSummary> {
  if (decisions.length === 0) {
    return { processed: 0, approved: 0, rejected: 0, held: 0, annotatedPending: 0, triageRunId };
  }

  return await withTenantDb(tenantId, async (tx) => {
      if (captureBatch) {
        const owners = await tx`select id from garimpa.capture_batch
          where id=${captureBatch.id} and tenant_id=${tenantId} and status='running'
            and metadata->'execution'->>'workerId'=${captureBatch.workerId}
            and (metadata->'execution'->>'deadline')::timestamptz>now() for update`;
        if (owners.length !== 1) throw new Error("capture_batch_ownership_lost");
      }
      let approved = 0;
      let rejected = 0;
      let held = 0;
      let annotatedPending = 0;

      for (const d of decisions) {
        // Ingestão atualiza o produto antes de inserir/alterar a observação.
        // Compartilhar esse lock preserva a evidência até o commit da decisão.
        if (d.inputVersion) await tx`
          select id from garimpa.product where tenant_id=${tenantId} and id=${d.productId} for update
        `;
        const currentRows = await tx<StoredCurationState[]>`
          select status, reason_code as "reasonCode", reason_detail as "reasonDetail",
                 deferred_until as "deferredUntil"
          from garimpa.product_curation
          where tenant_id = ${tenantId} and product_id = ${d.productId}
          for update
        `;
        const current = currentRows[0];
        if (!current) continue;

        // Decisões humanas já tomadas são invioláveis
        if (current.status === "approved" || current.status === "rejected") {
          continue;
        }
        if (d.inputVersion && !await triageInputStillCurrent(tx, tenantId, d.productId, d.inputVersion)) continue;

        const facts = await queueFacts(tx as TxLike, tenantId, d.productId);
        if (!facts) continue;

        const snapshotMetadata = buildSnapshotMetadata(toSnapshotFacts(facts), {
          via: "review",
          policyVersion: "ai-triage-v2",
        });

        const automationMetadata = {
          ...snapshotMetadata,
          automation: {
            kind: d.actorType === "llm" ? "ai_semantic_triage" : "hard_filter_rule",
            rationale: d.rationale,
            aiScore: d.aiScore,
            aiJustification: d.aiJustification,
            editorialCategory: d.editorialCategory,
            pricePolicy: d.pricePolicy,
            inputVersion: d.inputVersion,
          },
        };

        if (d.status !== "pending" || current.status !== "pending") {
          await tx`
            update garimpa.product_curation
            set status = ${d.status},
                reason_code = ${d.reasonCode},
                reason_detail = ${d.reasonDetail},
                reviewed_by_app_user_id = null,
                reviewed_at = now(),
                updated_at = now()
            where tenant_id = ${tenantId} and product_id = ${d.productId}
          `;
          if (d.status === "approved") approved++;
          if (d.status === "rejected") rejected++;
          if (d.status === "held") held++;
        }
        if (d.status === "pending") annotatedPending++;

        await tx`
          insert into garimpa.curation_event
            (tenant_id, product_id, from_status, to_status, reason_code, reason_detail,
             from_reason_code, from_reason_detail, from_deferred_until,
             actor_type, actor_app_user_id, policy_version, metadata, triage_run_id)
          values (${tenantId}, ${d.productId}, ${current.status}, ${d.status},
                  ${d.reasonCode}, ${d.reasonDetail},
                  ${current.reasonCode}, ${current.reasonDetail}, ${current.deferredUntil},
                  ${d.actorType}, null, 'ai-triage-v2', ${tx.json(automationMetadata)},
                  ${triageRunId ?? null})
        `;
      }

      return {
        processed: decisions.length,
        approved,
        rejected,
        held,
        annotatedPending,
        triageRunId,
      };
    }, sqlFactory);
}

export async function automatedTriageAvailability(tenantId = scopedTenantId(), sqlFactory: typeof db = db): Promise<number> {
  return await withTenantDb(tenantId, async (sql) => {
    return (await loadAutomatedTriageCandidates(sql, tenantId, 100)).length;
  }, sqlFactory);
}

export async function runPendingAutomatedTriage(
  tenantId = scopedTenantId(),
  limit = 50,
  options?: PipelineOptions & { captureBatch?: { id: string; workerId: string } },
  sqlFactory: typeof db = db,
): Promise<TriageApplicationSummary> {
  let candidates: CandidateProduct[];
  try {
    candidates = await withTenantDb(tenantId, async (sql) => {
      if (options?.captureBatch) {
        const owners = await sql`select id from garimpa.capture_batch
          where id=${options.captureBatch.id} and tenant_id=${tenantId} and status='running'
            and metadata->'execution'->>'workerId'=${options.captureBatch.workerId}
            and (metadata->'execution'->>'deadline')::timestamptz>now()`;
        if (owners.length !== 1) throw new Error("capture_batch_ownership_lost");
      }
      return await loadAutomatedTriageCandidates(sql, tenantId, limit, options?.minPriceCents, options?.captureBatch?.id);
    }, sqlFactory);
  } catch (err) {
    throw err;
  }

  if (candidates.length === 0) {
    return { processed: 0, approved: 0, rejected: 0, held: 0, annotatedPending: 0 };
  }

  const [guidelineConfig, goldenExamples] = await Promise.all([
    getEditorialGuideline(tenantId),
    getGoldenExamples(tenantId, 6),
  ]);

  const mergedOptions: PipelineOptions = {
    ...options,
    editorialGuideline: options?.editorialGuideline ?? guidelineConfig.guideline,
    autoPublish: options?.autoPublish ?? guidelineConfig.autoPublish,
    minScoreAutoPublish: options?.minScoreAutoPublish ?? guidelineConfig.minScoreAutoPublish,
    fewShotExamples: options?.fewShotExamples ?? goldenExamples,
  };

  let triageRunId: string | undefined;
  try {
    const inserted = await withTenantDb(tenantId, async (sqlRun) => {
      const [row] = await sqlRun<{ id: string }[]>`
        insert into garimpa.triage_run (tenant_id, status, total_input, model_name, pipeline_version, metadata)
        values (
          ${tenantId},
          'running',
          ${candidates.length},
          ${process.env.GEMINI_MODEL ?? "gemini-2.5-flash"},
          'curation-pipeline-v3',
          ${sqlRun.json({ captureBatchId: options?.captureBatch?.id ?? null })}
        )
        returning id
      `;
      return row;
    }, sqlFactory);
    triageRunId = inserted?.id;
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
      throw new Error("triage_in_progress");
    }
    console.error("[triage] Falha ao registrar início de triage_run:", err);
    throw err;
  }

  try {
    const decisions = await processIngestionPipeline(candidates, mergedOptions);
    const summary = await applyAutomatedTriageDecisions(decisions, tenantId, triageRunId, sqlFactory, options?.captureBatch);

    if (triageRunId) {
      try {
        await withTenantDb(tenantId, async (sqlUpdate) => {
          await sqlUpdate`
            update garimpa.triage_run
            set status = 'ok',
                finished_at = now(),
                total_input = ${summary.processed},
                approved_count = ${summary.approved},
                held_count = ${summary.held},
                rejected_count = ${summary.rejected},
                annotated_count = ${summary.annotatedPending}
            where id = ${triageRunId} and tenant_id = ${tenantId}
          `;
        }, sqlFactory);
      } catch (err) {
        console.error("[triage] Falha ao atualizar conclusão de triage_run:", err);
        throw new Error("triage_run_finalize_failed");
      }
    }

    return { ...summary, triageRunId };
  } catch (err) {
    if (triageRunId) {
      try {
        await withTenantDb(tenantId, async (sqlErr) => {
          await sqlErr`
            update garimpa.triage_run
            set status = 'error',
                finished_at = now(),
                error_message = ${err instanceof Error ? err.message : String(err)}
            where id = ${triageRunId} and tenant_id = ${tenantId}
          `;
        }, sqlFactory);
      } catch {
        // ignore
      }
    }
    throw err;
  }
}

export interface ApprovedVitrineProduct {
  id: string;
  marketplace: string;
  externalId: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  productUrl: string;
  priceCents: number;
  originalPriceCents: number | null;
  ratingStar: number | null;
  salesCount: number | null;
  category: string | null;
  reviewedAt: string | null;
  reasonCode: string | null;
  reasonDetail: string | null;
  actorType: string | null;
}

export async function getApprovedVitrineProducts(
  tenantId = scopedTenantId(),
  limit = 60,
  sqlFactory: typeof db = db,
): Promise<ApprovedVitrineProduct[]> {
  if (!process.env.DATABASE_URL) return [];

  return await withTenantDb(tenantId, async (sql) => {
    try {
      const rows = await sql<{
        id: string;
        marketplace: string;
        external_id: string;
        title: string;
        image_url: string | null;
        product_url: string;
        category: string | null;
        price_cents: number;
        original_price_cents: number | null;
        rating_star: number | null;
        sales_count: number | null;
        reviewed_at: Date | string | null;
        reason_code: string | null;
        reason_detail: string | null;
        actor_type: string | null;
      }[]>`
        select
          p.id,
          p.marketplace,
          p.external_id,
          p.title,
          p.image_url,
          p.product_url,
          p.category,
          coalesce(latest.price_cents, 0)::int as price_cents,
          latest.original_price_cents,
          latest.rating_star,
          latest.sales_count,
          pc.reviewed_at,
          pc.reason_code,
          pc.reason_detail,
          last_ev.actor_type
        from garimpa.product_curation pc
        join garimpa.product p on p.id = pc.product_id and p.tenant_id = pc.tenant_id
        left join lateral (
          select price_cents, original_price_cents, rating_star, sales_count
          from garimpa.price_observation obs
          where obs.product_id = p.id and obs.tenant_id = p.tenant_id
          order by observed_at desc limit 1
        ) latest on true
        left join lateral (
          select actor_type
          from garimpa.curation_event ev
          where ev.product_id = p.id and ev.tenant_id = pc.tenant_id
          order by ev.id desc limit 1
        ) last_ev on true
        where pc.tenant_id = ${tenantId}
          and pc.status = 'approved'
          and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
        order by pc.reviewed_at desc nulls last, p.last_seen_at desc
        limit ${Math.min(Math.max(limit, 1), 100)}
      `;

      return rows.map((r) => ({
        id: r.id,
        marketplace: r.marketplace,
        externalId: r.external_id,
        slug: productSlug(r.marketplace, r.external_id),
        title: r.title,
        imageUrl: r.image_url,
        productUrl: r.product_url,
        priceCents: r.price_cents,
        originalPriceCents: r.original_price_cents,
        ratingStar: r.rating_star,
        salesCount: r.sales_count,
        category: r.category,
        reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
        reasonCode: r.reason_code,
        reasonDetail: r.reason_detail,
        actorType: r.actor_type,
      }));
    } catch {
      return [];
    }
  }, sqlFactory);
}
