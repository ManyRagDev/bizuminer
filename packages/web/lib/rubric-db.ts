import { assertCommercialRolloutReady } from "./commercial-rollout.ts";
import { calculateContentDigest } from "./commerce-contract.ts";
/**
 * Acesso a banco para avaliações de IA em modo sombra e calibração humana (EP-02 / C-03).
 */

import { createHash } from "node:crypto";
import type postgres from "postgres";
import type {
  ComparisonDisagreement,
  RubricAssessment,
  RubricInputItem,
} from "./rubric-contract.ts";

export type Sql = postgres.Sql | postgres.TransactionSql;

export interface AnalysisAssessmentRecord {
  id: string;
  tenantId: string;
  productId: string;
  rubricVersion: string;
  inputDigest: string;
  result: RubricAssessment;
  modelVersion: string;
  promptVersion: string;
  mode: "shadow" | "assisted";
  createdAt: string;
}

export interface ComparisonReviewRecord {
  id: string;
  tenantId: string;
  productId: string;
  analysisAssessmentId: string;
  editorialAssessmentId: string | null;
  rubricVersion: string;
  agreement: boolean;
  disagreements: ComparisonDisagreement[];
  reviewedByAppUserId: string;
  reviewedAt: string;
  notes: string | null;
  createdAt: string;
}

export function calculateRubricInputDigest(item: RubricInputItem): string {
  const content = JSON.stringify({
    productId: item.productId,
    title: item.title.trim(),
    category: item.category,
    priceCents: item.priceCents,
    marketplace: item.marketplace,
    originalPriceCents: item.originalPriceCents ?? null,
    ratingStar: item.ratingStar ?? null,
    salesCount: item.salesCount ?? null,
    priceEvidenceDigest: item.priceEvidenceDigest ?? null,
  });
  return createHash("sha256").update(content).digest("hex");
}

export async function saveAnalysisAssessment(
  sql: Sql,
  input: {
    tenantId: string;
    productId: string;
    rubricVersion: string;
    inputDigest: string;
    result: RubricAssessment;
    modelVersion: string;
    promptVersion: string;
    mode: "shadow" | "assisted";
  },
): Promise<string> {
  await assertCommercialRolloutReady(sql);
  const rows = await sql<{ id: string }[]>`
    insert into garimpa.analysis_assessment
      (tenant_id, product_id, rubric_version, input_digest, result, model_version, prompt_version, mode)
    values
      (${input.tenantId}, ${input.productId}, ${input.rubricVersion}, ${input.inputDigest},
       ${sql.json(input.result as any)}, ${input.modelVersion}, ${input.promptVersion}, ${input.mode})
    returning id
  `;
  return rows[0]!.id;
}

export async function getLatestAnalysisAssessment(
  sql: Sql,
  tenantId: string,
  productId: string,
): Promise<AnalysisAssessmentRecord | null> {
  const rows = await sql<{
    id: string;
    tenant_id: string;
    product_id: string;
    rubric_version: string;
    input_digest: string;
    result: unknown;
    model_version: string;
    prompt_version: string;
    mode: string;
    created_at: string;
  }[]>`
    select id, tenant_id, product_id, rubric_version, input_digest, result,
           model_version, prompt_version, mode, created_at::text
    from garimpa.analysis_assessment
    where tenant_id = ${tenantId} and product_id = ${productId}
    order by created_at desc
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    productId: row.product_id,
    rubricVersion: row.rubric_version,
    inputDigest: row.input_digest,
    result: row.result as RubricAssessment,
    modelVersion: row.model_version,
    promptVersion: row.prompt_version,
    mode: row.mode as "shadow" | "assisted",
    createdAt: row.created_at,
  };
}

export async function saveComparisonReview(
  sql: Sql,
  input: {
    tenantId: string;
    productId: string;
    analysisAssessmentId: string;
    editorialAssessmentId?: string | null;
    rubricVersion: string;
    agreement: boolean;
    disagreements: readonly ComparisonDisagreement[];
    reviewedByAppUserId: string;
    notes?: string | null;
  },
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    insert into garimpa.comparison_review
      (tenant_id, product_id, analysis_assessment_id, editorial_assessment_id, rubric_version,
       agreement, disagreements, reviewed_by_app_user_id, notes)
    values
      (${input.tenantId}, ${input.productId}, ${input.analysisAssessmentId}, ${input.editorialAssessmentId ?? null},
       ${input.rubricVersion}, ${input.agreement}, ${sql.json(input.disagreements as any)},
       ${input.reviewedByAppUserId}, ${input.notes ?? null})
    on conflict do nothing
    returning id
  `;
  if(rows[0])return rows[0].id;
  const [prior]=await sql<{id:string}[]>`select id from garimpa.comparison_review where tenant_id=${input.tenantId} and editorial_assessment_id=${input.editorialAssessmentId??null} and analysis_assessment_id=${input.analysisAssessmentId}`;
  if(!prior)throw new Error('comparison_insert_failed');
  return prior.id;
}

export interface ComparisonReviewSampleItem {
  id: string;
  productId: string;
  productTitle: string;
  marketplace: string;
  analysisAssessmentId: string;
  editorialAssessmentId: string | null;
  rubricVersion: string;
  agreement: boolean;
  disagreements: readonly ComparisonDisagreement[];
  reviewedByAppUserId: string;
  reviewedAt: string;
  notes: string | null;
  createdAt: string;
  aiLevels: {
    quality: string;
    value: string;
    audience: string;
    evidenceConfidence: string;
  };
  aiUnknowns: readonly string[];
  aiSafetyFlags: readonly string[];
}

export async function getComparisonReviewsSample(
  sql: Sql,
  tenantId: string,
  options?: { limit?: number; offset?: number; onlyDisagreements?: boolean },
): Promise<ComparisonReviewSampleItem[]> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const offset = Math.max(options?.offset ?? 0, 0);

  const rows = options?.onlyDisagreements
    ? await sql<{
        id: string;
        product_id: string;
        product_title: string;
        marketplace: string;
        analysis_assessment_id: string;
        editorial_assessment_id: string | null;
        rubric_version: string;
        agreement: boolean;
        disagreements: unknown;
        reviewed_by_app_user_id: string;
        reviewed_at: string;
        notes: string | null;
        created_at: string;
        ai_quality: string;
        ai_value: string;
        ai_audience: string;
        ai_confidence: string;
        ai_unknowns: unknown;
        ai_safety_flags: unknown;
      }[]>`
        select
          cr.id, cr.product_id, p.title as product_title, p.marketplace,
          cr.analysis_assessment_id, cr.editorial_assessment_id,
          cr.rubric_version, cr.agreement, cr.disagreements,
          cr.reviewed_by_app_user_id, cr.reviewed_at::text, cr.notes, cr.created_at::text,
          coalesce(aa.result->'quality'->>'level', 'unknown') as ai_quality,
          coalesce(aa.result->'value'->>'level', 'unknown') as ai_value,
          coalesce(aa.result->'audience'->>'level', 'unknown') as ai_audience,
          coalesce(aa.result->'evidenceConfidence'->>'level', 'unknown') as ai_confidence,
          coalesce(aa.result->'unknowns', '[]'::jsonb) as ai_unknowns,
          coalesce(aa.result->'safetyFlags', '[]'::jsonb) as ai_safety_flags
        from garimpa.comparison_review cr
        join garimpa.product p on p.id = cr.product_id and p.tenant_id = cr.tenant_id
        join garimpa.analysis_assessment aa on aa.id = cr.analysis_assessment_id and aa.tenant_id = cr.tenant_id
        where cr.tenant_id = ${tenantId} and cr.agreement = false
        order by cr.reviewed_at desc, cr.id desc
        limit ${limit}
        offset ${offset}
      `
    : await sql<{
        id: string;
        product_id: string;
        product_title: string;
        marketplace: string;
        analysis_assessment_id: string;
        editorial_assessment_id: string | null;
        rubric_version: string;
        agreement: boolean;
        disagreements: unknown;
        reviewed_by_app_user_id: string;
        reviewed_at: string;
        notes: string | null;
        created_at: string;
        ai_quality: string;
        ai_value: string;
        ai_audience: string;
        ai_confidence: string;
        ai_unknowns: unknown;
        ai_safety_flags: unknown;
      }[]>`
        select
          cr.id, cr.product_id, p.title as product_title, p.marketplace,
          cr.analysis_assessment_id, cr.editorial_assessment_id,
          cr.rubric_version, cr.agreement, cr.disagreements,
          cr.reviewed_by_app_user_id, cr.reviewed_at::text, cr.notes, cr.created_at::text,
          coalesce(aa.result->'quality'->>'level', 'unknown') as ai_quality,
          coalesce(aa.result->'value'->>'level', 'unknown') as ai_value,
          coalesce(aa.result->'audience'->>'level', 'unknown') as ai_audience,
          coalesce(aa.result->'evidenceConfidence'->>'level', 'unknown') as ai_confidence,
          coalesce(aa.result->'unknowns', '[]'::jsonb) as ai_unknowns,
          coalesce(aa.result->'safetyFlags', '[]'::jsonb) as ai_safety_flags
        from garimpa.comparison_review cr
        join garimpa.product p on p.id = cr.product_id and p.tenant_id = cr.tenant_id
        join garimpa.analysis_assessment aa on aa.id = cr.analysis_assessment_id and aa.tenant_id = cr.tenant_id
        where cr.tenant_id = ${tenantId}
        order by cr.reviewed_at desc, cr.id desc
        limit ${limit}
        offset ${offset}
      `;

  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    productTitle: r.product_title,
    marketplace: r.marketplace,
    analysisAssessmentId: r.analysis_assessment_id,
    editorialAssessmentId: r.editorial_assessment_id,
    rubricVersion: r.rubric_version,
    agreement: r.agreement,
    disagreements: (Array.isArray(r.disagreements) ? r.disagreements : []) as readonly ComparisonDisagreement[],
    reviewedByAppUserId: r.reviewed_by_app_user_id,
    reviewedAt: r.reviewed_at,
    notes: r.notes,
    createdAt: r.created_at,
    aiLevels: {
      quality: r.ai_quality,
      value: r.ai_value,
      audience: r.ai_audience,
      evidenceConfidence: r.ai_confidence,
    },
    aiUnknowns: Array.isArray(r.ai_unknowns) ? (r.ai_unknowns as string[]) : [],
    aiSafetyFlags: Array.isArray(r.ai_safety_flags) ? (r.ai_safety_flags as string[]) : [],
  }));
}

export interface RubricPromotionMetrics {
  totalReviewed: number;
  agreedCount: number;
  disagreedCount: number;
  agreementRate: number;
  disagreementByDimension: {
    quality: number;
    value: number;
    audience: number;
    confidence: number;
    safety: number;
  };
  sampleSizeTarget: number | null;
  minAgreementRateTarget: number | null;
  gatePassed: boolean;
  status: "shadow" | "ratified";
  gateName: "G-RUBRIC";
}

export async function getRubricPromotionMetrics(
  sql: Sql,
  tenantId: string,
  rubricVersion = "rubric-v2",
): Promise<RubricPromotionMetrics> {
  const rows = await sql<{
    total: number;
    agreed: number;
    disagreed: number;
    disagreements_list: unknown;
  }[]>`
    select
      count(distinct product_id)::int as total,
      count(distinct product_id) filter (where agreement = true)::int as agreed,
      count(distinct product_id) filter (where agreement = false)::int as disagreed,
      coalesce(json_agg(disagreements) filter (where agreement = false), '[]'::json) as disagreements_list
    from (select distinct on(product_id) * from garimpa.comparison_review where tenant_id=${tenantId} and rubric_version=${rubricVersion} order by product_id,created_at desc,id desc) latest
  `;

  const total = rows[0]?.total ?? 0;
  const agreed = rows[0]?.agreed ?? 0;
  const disagreed = rows[0]?.disagreed ?? 0;
  const agreementRate = total > 0 ? Number((agreed / total).toFixed(4)) : 0;

  const dimCounts: { quality: number; value: number; audience: number; confidence: number; safety: number } = {
    quality: 0,
    value: 0,
    audience: 0,
    confidence: 0,
    safety: 0,
  };

  const rawList = rows[0]?.disagreements_list;
  if (Array.isArray(rawList)) {
    for (const sub of rawList) {
      if (Array.isArray(sub)) {
        for (const item of sub) {
          const dim = item?.dimension as keyof typeof dimCounts;
          if (dim && dim in dimCounts) {
            dimCounts[dim]++;
          }
        }
      }
    }
  }

  const decisions = await sql<{ method:any }[]>`select method from garimpa.governance_decision where tenant_id=${tenantId} and kind='rubric' and subject_version=${rubricVersion} order by approved_at desc limit 1`;
  const approved=decisions[0];
  const sampleSizeTarget = approved?.method?.minUnits ?? null;
  const minAgreementRateTarget = approved?.method?.minAgreementRate ?? null;
  const gatePassed = Boolean(approved);

  return {
    totalReviewed: total,
    agreedCount: agreed,
    disagreedCount: disagreed,
    agreementRate,
    disagreementByDimension: dimCounts,
    sampleSizeTarget,
    minAgreementRateTarget,
    gatePassed,
    status: gatePassed ? "ratified" : "shadow",
    gateName: "G-RUBRIC",
  };
}

export async function recordHumanRubricReview(
  sql: Sql,
  input: {
    tenantId: string;
    productId: string;
    humanAssessment: RubricAssessment;
    reviewedByAppUserId: string;
    editorialAssessmentId?: string | null;
    notes?: string | null;
    shadowResult?: RubricAssessment | null;
    requestId?: string;
  },
): Promise<{
  saved: boolean;
  editorialAssessmentId: string | null;
  comparisonReviewId: string | null;
  agreement: boolean;
  disagreements: readonly ComparisonDisagreement[];
  hasShadow: boolean;
}> {
  await assertCommercialRolloutReady(sql);
  const [membership]=await sql`select m.app_user_id from garimpa.affiliate_membership m join garimpa.affiliate_account a on a.id=m.affiliate_id where a.tenant_id=${input.tenantId} and a.status='active' and m.app_user_id=${input.reviewedByAppUserId} and m.revoked_at is null`;
  if(!membership)throw new Error("reviewer_membership_required");
  const digest=calculateContentDigest({productId:input.productId,reviewer:input.reviewedByAppUserId,assessment:{...input.humanAssessment,createdAt:undefined},notes:input.notes??null});
  const key=input.requestId??digest;
  await sql`select pg_advisory_xact_lock(hashtextextended(${input.tenantId+":review:"+key},0))`;
  const [prior]=await sql<{id:string;review_digest:string}[]>`select id,review_digest from garimpa.editorial_assessment where tenant_id=${input.tenantId} and review_key=${key}`;
  if(prior){
   if(prior.review_digest!==digest)throw new Error("idempotency_conflict");
   const [comparison]=await sql<{id:string;agreement:boolean;disagreements:ComparisonDisagreement[]}[]>`select id,agreement,disagreements from garimpa.comparison_review where tenant_id=${input.tenantId} and editorial_assessment_id=${prior.id} limit 1`;
   return {saved:true,editorialAssessmentId:prior.id,comparisonReviewId:comparison?.id??null,agreement:comparison?.agreement??true,disagreements:comparison?.disagreements??[],hasShadow:Boolean(comparison)};
  }
  let rubricVersion = input.humanAssessment.policyVersion ?? "1.0.0";
  let editorialAssessmentId = input.editorialAssessmentId ?? null;

  if(editorialAssessmentId){
    const [original]=await sql<{assessment:RubricAssessment;actor_app_user_id:string}[]>`select assessment,actor_app_user_id from garimpa.editorial_assessment where id=${editorialAssessmentId} and tenant_id=${input.tenantId} and product_id=${input.productId}`;
    if(!original||original.actor_app_user_id!==input.reviewedByAppUserId||calculateContentDigest(original.assessment)!==calculateContentDigest(input.humanAssessment))throw new Error('human_assessment_reference_mismatch');
  }
  // CF-04: Persistir avaliação humana diretamente em garimpa.editorial_assessment
  // como payload v2 (schemaVersion, digest, policyVersion, reviewer)
  if (!editorialAssessmentId) {
    const insertedAssessment = await sql<{ id: string }[]>`
      insert into garimpa.editorial_assessment (
        tenant_id,
        product_id,
        actor_app_user_id,
        policy_version,
        evidence_fingerprint,
        assessment,
        snapshot, review_key, review_digest
      ) values (
        ${input.tenantId},
        ${input.productId},
        ${input.reviewedByAppUserId},
        ${rubricVersion},
        ${input.humanAssessment.evidenceDigest || "human-direct"},
        ${sql.json(input.humanAssessment as any)},
        coalesce((select to_jsonb(p) from garimpa.product p where id = ${input.productId} and tenant_id = ${input.tenantId}), '{}'::jsonb), ${key}, ${digest}
      )
      returning id
    `;
    if (insertedAssessment.length > 0) {
      editorialAssessmentId = insertedAssessment[0]!.id;
    }
  }

  await sql`insert into garimpa.domain_event(tenant_id,aggregate_type,aggregate_id,aggregate_version,event_type,actor_ref,request_id,idempotency_key,payload) values(${input.tenantId},'editorial_assessment',${editorialAssessmentId!},1,'HumanRubricReviewRecorded',${input.reviewedByAppUserId},${key},${key},${sql.json({productId:input.productId,rubricVersion,evidenceDigest:input.humanAssessment.evidenceDigest})}) on conflict(tenant_id,aggregate_type,aggregate_id,idempotency_key) do nothing`;

  // 1. Resolve shadow assessment
  let shadow = input.shadowResult;
  let shadowId: string | null = null;

  if (!shadow) {
    const latest = await getLatestAnalysisAssessment(sql, input.tenantId, input.productId);
    if (latest && latest.inputDigest === input.humanAssessment.evidenceDigest && latest.rubricVersion === input.humanAssessment.policyVersion) {
      shadow = latest.result;
      shadowId = latest.id;
      rubricVersion = latest.rubricVersion;
    }
  }

  // 2. If no shadow assessment is available, human review succeeds and is saved without blocking
  if (!shadow) {
    return {
      saved: true,
      editorialAssessmentId,
      comparisonReviewId: null,
      agreement: true,
      disagreements: [],
      hasShadow: false,
    };
  }

  // 3. Compare human vs shadow AI assessment
  const { compareAssessments } = await import("./rubric-contract.ts");
  const comparison = compareAssessments(input.humanAssessment, shadow);

  // 4. Save comparison review into garimpa.comparison_review
  if (!shadowId) {
    // If shadow assessment was supplied in memory without prior insert, persist it now
    shadowId = await saveAnalysisAssessment(sql, {
      tenantId: input.tenantId,
      productId: input.productId,
      rubricVersion,
      inputDigest: input.humanAssessment.evidenceDigest || "in-memory-shadow",
      result: shadow,
      modelVersion: shadow.modelVersion ?? "gemini-2.5-flash",
      promptVersion: shadow.promptVersion ?? "rubric-v2-shadow",
      mode: "shadow",
    });
  }

  const comparisonReviewId = await saveComparisonReview(sql, {
    tenantId: input.tenantId,
    productId: input.productId,
    analysisAssessmentId: shadowId,
    editorialAssessmentId,
    rubricVersion,
    agreement: comparison.agreement,
    disagreements: comparison.disagreements,
    reviewedByAppUserId: input.reviewedByAppUserId,
    notes: input.notes ?? null,
  });

  return {
    saved: true,
    editorialAssessmentId,
    comparisonReviewId,
    agreement: comparison.agreement,
    disagreements: comparison.disagreements,
    hasShadow: true,
  };
}

export function exportComparisonReviewSampleAsCsv(
  sample: readonly ComparisonReviewSampleItem[],
): string {
  const headers = [
    "id",
    "productId",
    "productTitle",
    "marketplace",
    "agreement",
    "disagreementCount",
    "disagreements",
    "aiQuality",
    "aiValue",
    "aiAudience",
    "aiConfidence",
    "reviewedByAppUserId",
    "reviewedAt",
    "notes",
  ];

  const escapeCsv = (val: unknown) => {
    if (val === null || val === undefined) return "";
    const str = typeof val === "object" ? JSON.stringify(val) : String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replaceAll('"', '""')}"`;
    }
    return str;
  };

  const rows = sample.map((item) =>
    [
      item.id,
      item.productId,
      item.productTitle,
      item.marketplace,
      item.agreement ? "true" : "false",
      item.disagreements.length,
      item.disagreements.map((d) => `${d.dimension}: H=${d.humanLevel ?? "?"} AI=${d.aiLevel ?? "?"}`).join("; "),
      item.aiLevels.quality,
      item.aiLevels.value,
      item.aiLevels.audience,
      item.aiLevels.evidenceConfidence,
      item.reviewedByAppUserId,
      item.reviewedAt,
      item.notes ?? "",
    ].map(escapeCsv).join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

export async function loadRubricInput(sql:Sql,tenantId:string,productId:string):Promise<RubricInputItem> {
  await assertCommercialRolloutReady(sql);
 const [r]=await sql<any[]>`select p.*,o.price_cents,o.original_price_cents,o.offer_evidence,o.id as observation_id from garimpa.product p join lateral(select * from garimpa.price_observation o where o.product_id=p.id and o.tenant_id=p.tenant_id order by o.observed_at desc,o.id desc limit 1)o on true where p.id=${productId} and p.tenant_id=${tenantId}`;
 if(!r)throw new Error("product_evidence_required");
 return {productId:r.id,title:r.title,category:r.category??"",priceCents:r.price_cents,originalPriceCents:r.original_price_cents??undefined,marketplace:r.marketplace,productUrl:r.product_url,priceEvidenceDigest:createHash("sha256").update(JSON.stringify([r.observation_id,r.offer_evidence])).digest("hex")};
}
export async function getLatestHumanRubricAssessment(sql:Sql,tenantId:string,productId:string):Promise<RubricAssessment|null> {
 const [r]=await sql<{assessment:RubricAssessment}[]>`select assessment from garimpa.editorial_assessment where tenant_id=${tenantId} and product_id=${productId} and assessment->>'schemaVersion'='2' order by created_at desc,id desc limit 1`;
 return r?.assessment??null;
}

export interface RatifyRubricPolicyInput {
  tenantId: string;
  rubricVersion: string;
  reviewIds: readonly string[];
  approvedByAppUserId: string;
  rationale: string;
  cohort?: string;
  minUnits?: number;
  minAgreementRate?: number;
}

export interface RatifyRubricPolicyResult {
  decisionId: string;
  status: "ratified";
  rubricVersion: string;
  sampleCount: number;
  agreementRate: number;
  ratifiedAt: string;
}

export async function ratifyRubricPolicy(
  sql: Sql,
  input: RatifyRubricPolicyInput,
): Promise<RatifyRubricPolicyResult> {
  await assertCommercialRolloutReady(sql);

  if (!input.approvedByAppUserId) {
    throw new Error("approver_app_user_id_required");
  }

  const [membership] = await sql<{ app_user_id: string; role: string }[]>`
    select m.app_user_id, m.role
    from garimpa.affiliate_membership m
    join garimpa.affiliate_account a on a.id = m.affiliate_id
    where a.tenant_id = ${input.tenantId}
      and a.status = 'active'
      and m.app_user_id = ${input.approvedByAppUserId}
      and m.role = 'owner'
      and m.app_user_id = nullif(current_setting('garimpa.actor_app_user_id',true),'')
      and current_setting('garimpa.membership_role',true)='owner'
      and m.revoked_at is null
  `;
  if (!membership) throw new Error("owner_membership_required");

  if (!input.rubricVersion?.trim()) throw new Error("rubric_version_required");
  if (!input.rationale?.trim()) throw new Error("rationale_required");
  if (!Array.isArray(input.reviewIds) || input.reviewIds.length === 0) {
    throw new Error("review_sample_ids_required");
  }

  const minUnits = input.minUnits ?? 30;
  const minAgreementRate = input.minAgreementRate ?? 0.7;
  const cohort = input.cohort?.trim() || "curation-calibration";
  if (!Number.isInteger(minUnits) || minUnits < 30 || minUnits > 50 ||
      !Number.isFinite(minAgreementRate) || minAgreementRate < 0 || minAgreementRate > 1)
    throw new Error("approved_method_required");
  if (input.reviewIds.length !== new Set(input.reviewIds).size) throw new Error("eligible_distinct_sample_required");

  const rows = await sql<{
    id: string;
    product_id: string;
    agreement: boolean;
    disagreements: unknown;
  }[]>`
    select id, product_id, agreement, disagreements
    from garimpa.comparison_review
    where tenant_id = ${input.tenantId}
      and rubric_version = ${input.rubricVersion}
      and id::text = any(${input.reviewIds as string[]})
  `;

  const distinctProductIds = new Set(rows.map((r) => r.product_id));
  if (
    rows.length !== new Set(input.reviewIds).size ||
    distinctProductIds.size !== rows.length ||
    rows.length < minUnits || rows.length > 50
  ) {
    throw new Error("eligible_distinct_sample_required");
  }

  const agreedCount = rows.filter((r) => r.agreement).length;
  const agreementRate = Number((agreedCount / rows.length).toFixed(4));
  if (agreementRate < minAgreementRate) {
    throw new Error("sample_agreement_rate_below_threshold");
  }

  const criteria = {schemaVersion:2, rubricVersion:input.rubricVersion,
    dimensions:{quality:"utility_construction_function",value:"comparable_alternatives_or_explicit_human_judgment",audience:"policy_audience_fit",evidenceConfidence:"facts_inferences_unknowns_separated",temporal:"canonical_price_evidence_C02"},
    levels:["unknown","weak","adequate","strong"],
    method:{cohort,minUnits,minAgreementRate,rationale:input.rationale.trim()}};
  const method = {
    cohort,
    criteria,
    criteriaDigest: calculateContentDigest(criteria),
    minUnits,
    minAgreementRate,
    rationale: input.rationale,
    sampleCount: rows.length,
    agreedCount,
    agreementRate,
    sampleDigest: calculateContentDigest(
      [...rows].sort((a,b)=>a.id.localeCompare(b.id)).map((r) => ({
        id: r.id,
        productId: r.product_id,
        agreement: r.agreement,
      })),
    ),
    ratifiedAt: new Date().toISOString(),
  };

  const [decision] = await sql<{ id: string }[]>`
    insert into garimpa.governance_decision (
      tenant_id,
      kind,
      subject_version,
      method,
      evidence_ids,
      approved_by,
      rationale
    ) values (
      ${input.tenantId},
      'rubric',
      ${input.rubricVersion},
      ${sql.json(method as any)},
      ${sql.json([...input.reviewIds].sort() as any)},
      ${input.approvedByAppUserId},
      ${input.rationale}
    )
    returning id
  `;

  await sql`
    insert into garimpa.domain_event (
      tenant_id,
      aggregate_type,
      aggregate_id,
      aggregate_version,
      event_type,
      actor_ref,
      request_id,
      idempotency_key,
      payload
    ) values (
      ${input.tenantId},
      'governance_decision',
      ${decision!.id},
      1,
      'RubricPolicyRatified',
      ${input.approvedByAppUserId},
      ${'ratify-rubric:' + decision!.id},
      ${'ratify-rubric:' + input.rubricVersion + ':' + decision!.id},
      ${sql.json({
        decisionId: decision!.id,
        rubricVersion: input.rubricVersion,
        sampleCount: rows.length,
        agreementRate,
        method,
      })}
    )
    on conflict do nothing
  `;

  return {
    decisionId: decision!.id,
    status: "ratified",
    rubricVersion: input.rubricVersion,
    sampleCount: rows.length,
    agreementRate,
    ratifiedAt: method.ratifiedAt,
  };
}

