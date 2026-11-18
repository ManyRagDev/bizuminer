"use server";
import { pageAccount } from "../../../lib/page-account.ts";
import { accountOperation } from "../../../lib/page-account.ts";
import { scopedTenantId } from "../../../lib/account-scope.ts";

import { revalidatePath } from "next/cache";
import { refreshHomepageAfterChange } from "../../../lib/homepage-db.ts";
import { enableHomepageRenewal } from "../../../lib/homepage-renewal-db.ts";
import {
  getEditorialSelectionDesk,
  replaceEditorialSelection,
  saveEditorialAssessment,
} from "../../../lib/editorial-selection-db.ts";
import type { EditorialAssessmentInput } from "../../../lib/editorial-selection.ts";
import {
  getPageAuth,
  isAffiliate,
  resolveAppUserId,
  resolveAccountContext,
  type AccountContext,
} from "../../../lib/auth.ts";
import { withAccountDb } from "../../../lib/tenant-db.ts";
import {
  actOnGroup,
  clearDeferredReview,
  deferReview,
  groupMembers,
  reviewProduct,
  runPendingAutomatedTriage,
  undoBulkReview,
  undoReview,
  type CurationQueueProduct,
} from "../../../lib/curation-db.ts";
import {
  defaultDeferredUntil,
  validateCurationDecision,
  validateCurationDeferral,
  validateGroupAction,
  type CurationDecisionInput,
  type GroupActionInput,
} from "../../../lib/curation-contract.ts";
import {
  recordHumanRubricReview,
  getComparisonReviewsSample,
  getRubricPromotionMetrics,
  saveAnalysisAssessment,
  calculateRubricInputDigest,
  loadRubricInput,
  getLatestHumanRubricAssessment,
  ratifyRubricPolicy,
  type ComparisonReviewSampleItem,
  type RubricPromotionMetrics,
} from "../../../lib/rubric-db.ts";
import {
  validateRubricAssessment,
  type RubricAssessment,
  type RubricInputItem,
} from "../../../lib/rubric-contract.ts";
import { evaluateRubricShadowItem } from "../../../lib/ai-curation-service.ts";
import { db } from "../../../lib/db.ts";
import { DEFAULT_SELECTION_POLICY_V2, isValidSelectionPolicyV2, type SelectionPolicyV2 } from "../../../lib/curation-selection-v2.ts";
import { validScoreWeights, type ScoreWeights } from "../../../lib/curation-score-v2.ts";

export type CurationActionResult =
  | { ok: true; eventId: string; productId: string }
  | { ok: false; error: string };

export type GroupActionResultResponse =
  | { ok: true; bulkActionId: string; affectedCount: number }
  | { ok: false; error: string };

export type DeferralActionResult =
  | { ok: true; productId: string; deferredUntil?: string }
  | { ok: false; error: string };

export async function releaseUncertainAttributeAction(input:{tenantId:string;jobId:string;reason:string}) {
  return accountOperation(async account=>{
    if(account.membershipRole!=='owner' || !account.actorAppUserId) return {ok:false as const,error:'forbidden'};
    if(!input || typeof input.jobId!=='string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.jobId)
      || typeof input.reason!=='string' || input.reason.trim().length<3 || input.reason.trim().length>1000)
      return {ok:false as const,error:'invalid_input'};
    try {
      const released=await withAccountDb(account,async tx=>{
        const [row]=await tx<{released:boolean}[]>`select garimpa.release_uncertain_attribute_job(${account.tenantId},${input.jobId}::uuid,${input.reason.trim()}) as released`;
        return row?.released===true;
      });
      if(!released) return {ok:false as const,error:'already_resolved'};
      revalidatePath('/admin/curadoria');
      return {ok:true as const};
    } catch {return {ok:false as const,error:'unavailable'};}
  },input?.tenantId);
}

export async function releaseShopeeCredentialAction(input:{tenantId:string;asOf:string;reason:string}) {
  return accountOperation(async account=>{
    if(account.membershipRole!=='owner' || !account.actorAppUserId) return {ok:false as const,error:'forbidden'};
    const cutoff=typeof input?.asOf==='string' ? Date.parse(input.asOf) : NaN;
    if(!Number.isFinite(cutoff) || cutoff>Date.now()+60_000 || typeof input.reason!=='string'
      || input.reason.trim().length<3 || input.reason.trim().length>1000) return {ok:false as const,error:'invalid_input'};
    try {
      const count=await withAccountDb(account,async tx=>{
        const changed=await tx<{id:string}[]>`update garimpa.curation_promotion request set
          result=jsonb_build_object('reason','credential_retry_authorized'),next_attempt_at=now(),updated_at=now()
          from garimpa.product product where request.tenant_id=${account.tenantId} and product.tenant_id=request.tenant_id
            and product.id=request.product_id and product.marketplace='shopee' and request.status='pending' and request.deadline>now()
            and request.result->>'reason'='auth' and coalesce((request.result->>'credentialFailedAt')::timestamptz,request.updated_at)<=${new Date(cutoff)}
          returning request.id::text`;
        if(changed.length) {
          await tx`insert into garimpa.domain_event(tenant_id,aggregate_type,aggregate_id,aggregate_version,event_type,actor_ref,request_id,idempotency_key,payload)
            values(${account.tenantId},'shopee_credential_retry',${account.tenantId},1,'ShopeeCredentialRetryAuthorized',${account.actorAppUserId!},
              ${account.requestId},${account.requestId},${tx.json({reason:input.reason.trim(),asOf:new Date(cutoff).toISOString(),count:changed.length})})`;
          await tx`select pg_notify('garimpa_curation_ready',json_build_object('tenantId',${account.tenantId}::text)::text)`;
        }
        return changed.length;
      });
      revalidatePath('/admin/curadoria');
      return {ok:true as const,count};
    } catch {return {ok:false as const,error:'unavailable'};}
  },input?.tenantId);
}

export async function saveCurationPolicyAction(input:{version:number;enabled:boolean;autoEligibility:boolean;policy:SelectionPolicyV2;weights:ScoreWeights}) {
  return accountOperation(async account=>{
    if(account.membershipRole!=="owner")return {ok:false as const,error:"forbidden"};
    if(!input || !Number.isSafeInteger(input.version) || input.version<0 || typeof input.enabled!=="boolean" || typeof input.autoEligibility!=="boolean"
      || !input.policy || typeof input.policy!=="object" || Array.isArray(input.policy)
      || Object.keys(input.policy).sort().join(',')!==Object.keys(DEFAULT_SELECTION_POLICY_V2).sort().join(',')
      || !isValidSelectionPolicyV2(input.policy) || !validScoreWeights(input.weights)) return {ok:false as const,error:"invalid_policy"};
    try {
      const config={...input.policy,autoEligibility:input.autoEligibility,scoreWeights:input.weights};
      const version=await withAccountDb(account,async tx=>{
        await tx`select pg_advisory_xact_lock(hashtextextended(${`curation-policy:${account.tenantId}`},0))`;
        if(input.version===0) {
          const [created]=await tx<{version:number}[]>`insert into garimpa.curation_policy_v2(tenant_id,enabled,config)
            values(${account.tenantId},${input.enabled},${tx.json(config)}) on conflict(tenant_id) do nothing returning version`;
          return created?.version ?? null;
        }
        const [updated]=await tx<{version:number}[]>`update garimpa.curation_policy_v2
          set enabled=${input.enabled},config=config || ${tx.json(config)}::jsonb,version=version+1,updated_at=now()
          where tenant_id=${account.tenantId} and version=${input.version} returning version`;
        return updated?.version ?? null;
      });
      if(version===null)return {ok:false as const,error:"conflict"};
      revalidatePath("/admin/curadoria");revalidatePath("/pauta");revalidatePath("/");
      return {ok:true as const,version};
    } catch {return {ok:false as const,error:"unavailable"};}
  });
}

export async function saveWeeklyAuditSettings(input:{version:number;limit:number}) {
  return accountOperation(async account => {
    if (account.membershipRole !== "owner") return {ok:false as const,error:"forbidden"};
    if (!Number.isSafeInteger(input.version) || input.version<0 || !Number.isInteger(input.limit) || input.limit<1 || input.limit>50)
      return {ok:false as const,error:"invalid_settings"};
    try {
      const saved = await withAccountDb(account, async tx => {
        await tx`select pg_advisory_xact_lock(hashtextextended(${`curation-policy:${account.tenantId}`},0))`;
        if (input.version===0) {
          const rows=await tx<{version:number}[]>`insert into garimpa.curation_policy_v2(tenant_id,config)
            values(${account.tenantId},${tx.json({weeklyAuditLimit:input.limit})}) on conflict(tenant_id) do nothing returning version`;
          return rows[0]?.version ?? null;
        }
        const rows=await tx<{version:number}[]>`update garimpa.curation_policy_v2
          set config=jsonb_set(config,'{weeklyAuditLimit}',to_jsonb(${input.limit}::integer),true),version=version+1,updated_at=now()
          where tenant_id=${account.tenantId} and version=${input.version} returning version`;
        return rows[0]?.version ?? null;
      });
      if (saved===null) return {ok:false as const,error:"conflict"};
      revalidatePath("/admin/curadoria");
      return {ok:true as const,version:saved};
    } catch { return {ok:false as const,error:"unavailable"}; }
  });
}

/** Only a human owner may recognize two specifically observed configurations. */
export async function createEquivalenceAction(input:{members:{productId:string;observationId:string}[];reason:string;identityConfirmed:boolean}) {
  return accountOperation(async account=>{
    if(account.membershipRole!=="owner" || !account.actorAppUserId) return {ok:false as const,error:"forbidden"};
    if(!input || input.identityConfirmed!==true || !Array.isArray(input.members) || input.members.length!==2 || input.members[0]?.productId===input.members[1]?.productId
      || typeof input.reason!=="string" || input.reason.trim().length<3 || input.reason.trim().length>1000
      || input.members.some(m=>!m || typeof m.productId!=="string" || !m.productId || typeof m.observationId!=="string" || !m.observationId))
      return {ok:false as const,error:"invalid_input"};
    try {
      await withAccountDb(account,async tx=>{
        const ids=input.members.map(m=>m.productId).sort();
        const locked=await tx<{id:string}[]>`select id from garimpa.product where tenant_id=${account.tenantId} and id=any(${ids}) order by id for update`;
        if(locked.length!==2) throw new Error("invalid_input");
        const observations=await tx<{id:string;product_id:string;option_key:string}[]>`select distinct on(product_id) id,product_id,option_key
          from garimpa.price_observation where tenant_id=${account.tenantId} and product_id=any(${ids}) order by product_id,observed_at desc,id desc`;
        if(observations.length!==2 || observations.some(o=>o.option_key==='listing'
          || !input.members.some(m=>m.productId===o.product_id && m.observationId===o.id))) throw new Error("stale_or_unverified_option");
        const [group]=await tx<{id:string}[]>`insert into garimpa.curation_equivalence_group(tenant_id,reason,created_by)
          values(${account.tenantId},${input.reason.trim()},${account.actorAppUserId!}) returning id`;
        if(!group) throw new Error("unavailable");
        for(const o of observations) await tx`insert into garimpa.curation_equivalence_member
          (tenant_id,group_id,product_id,option_key,observation_id,recognized_by,recognition_reason)
          values(${account.tenantId},${group.id}::uuid,${o.product_id},${o.option_key},${o.id},${account.actorAppUserId!},${input.reason.trim()})`;
      });
      revalidatePath("/admin/curadoria");revalidatePath("/pauta");
      return {ok:true as const};
    } catch {return {ok:false as const,error:"conflict_or_stale"};}
  });
}

/** Add one explicitly reviewed configuration to an existing, active group. */
export async function addEquivalenceMemberAction(input:{groupId:string;productId:string;observationId:string;reason:string;identityConfirmed:boolean}) {
  return accountOperation(async account=>{
    if(account.membershipRole!=="owner" || !account.actorAppUserId) return {ok:false as const,error:"forbidden"};
    if(!input || input.identityConfirmed!==true || typeof input.groupId!=="string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.groupId)
      || typeof input.productId!=="string" || !input.productId || typeof input.observationId!=="string" || !input.observationId
      || typeof input.reason!=="string" || input.reason.trim().length<3 || input.reason.trim().length>1000)
      return {ok:false as const,error:"invalid_input"};
    try {
      await withAccountDb(account,async tx=>{
        const [group]=await tx<{id:string}[]>`select id from garimpa.curation_equivalence_group
          where tenant_id=${account.tenantId} and id=${input.groupId}::uuid and revoked_at is null for update`;
        if(!group) throw new Error("group_unavailable");
        const [count]=await tx<{count:number}[]>`select count(*)::int as count from garimpa.curation_equivalence_member
          where tenant_id=${account.tenantId} and group_id=${group.id}::uuid and active`;
        if(!count || count.count>=20) throw new Error("group_full");
        const [product]=await tx<{id:string}[]>`select id from garimpa.product where tenant_id=${account.tenantId}
          and id=${input.productId} for update`;
        if(!product) throw new Error("product_unavailable");
        const [observation]=await tx<{id:string;option_key:string}[]>`select id,option_key from garimpa.price_observation
          where tenant_id=${account.tenantId} and product_id=${input.productId} order by observed_at desc,id desc limit 1`;
        if(!observation || observation.id!==input.observationId || observation.option_key==='listing') throw new Error("stale_or_unverified_option");
        await tx`insert into garimpa.curation_equivalence_member
          (tenant_id,group_id,product_id,option_key,observation_id,recognized_by,recognition_reason)
          values(${account.tenantId},${group.id}::uuid,${input.productId},${observation.option_key},${observation.id},${account.actorAppUserId!},${input.reason.trim()})`;
      });
      revalidatePath("/admin/curadoria");revalidatePath("/pauta");return {ok:true as const};
    } catch {return {ok:false as const,error:"conflict_or_stale"};}
  });
}

export async function revokeEquivalenceAction(groupId:string) {
  return accountOperation(async account=>{
    if(account.membershipRole!=="owner" || !account.actorAppUserId) return {ok:false as const,error:"forbidden"};
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(groupId)) return {ok:false as const,error:"invalid_input"};
    try {
      const changed=await withAccountDb(account,async tx=>{
        const [group]=await tx<{id:string}[]>`update garimpa.curation_equivalence_group set revoked_at=now(),revoked_by=${account.actorAppUserId!}
          where tenant_id=${account.tenantId} and id=${groupId}::uuid and revoked_at is null returning id`;
        if(!group)return false;
        await tx`update garimpa.curation_equivalence_member set active=false where tenant_id=${account.tenantId} and group_id=${groupId}::uuid and active`;
        return true;
      });
      if(!changed)return {ok:false as const,error:"conflict"};
      revalidatePath("/admin/curadoria");revalidatePath("/pauta");return {ok:true as const};
    } catch {return {ok:false as const,error:"unavailable"};}
  });
}

async function reviewerId(): Promise<string | null> {
  const user = await getPageAuth();
  if (!user || !(await isAffiliate(user))) return null;
  return resolveAppUserId(user.id);
}

export async function startHomepageRenewalAction() {
  return accountOperation(async account => {
    if (account.membershipRole !== "owner") return { ok: false as const, error: "forbidden" };
    const enabled = await enableHomepageRenewal();
    if (!enabled.ok) return enabled;
    // Keep an explicit opt-in even when the pool needs evidence. Later reviews
    // and scheduled workers will initialize as soon as there is a qualified item.
    const result = await refreshHomepageAfterChange(account.tenantId);
    revalidatePath("/admin/curadoria"); revalidatePath("/pauta"); revalidatePath("/");
    return { ok: true as const, result };
  });
}

export async function refreshHomepageRenewalAction() {
  return accountOperation(async account => {
    if (account.membershipRole !== "owner") return { ok: false as const, error: "forbidden" };
    try {
      const result = await refreshHomepageAfterChange(account.tenantId);
      revalidatePath("/admin/curadoria"); revalidatePath("/pauta"); revalidatePath("/");
      return { ok: true as const, result };
    } catch { return { ok: false as const, error: "refresh_failed" }; }
  });
}

export async function reopenHumanReviewAction(productId: string) {
  return accountOperation(async (c) => ({
    assessment: await withAccountDb(c, (tx) =>
      getLatestHumanRubricAssessment(tx, c.tenantId, productId),
    ),
  }));
}

async function getAuthorizedContext(
  requestedAccount?: string,
): Promise<{ context: AccountContext; appUserId: string } | null> {
  const user = await getPageAuth();
  if (!user || !(await isAffiliate(user))) return null;
  const context = await pageAccount(requestedAccount);
  if (!context || !context.actorAppUserId) return null;
  return { context, appUserId: context.actorAppUserId };
}

export async function submitCurationDecision(
  input: CurationDecisionInput,
): Promise<CurationActionResult> {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false, error: "forbidden" };

    const parsed = validateCurationDecision(input);
    if (!parsed.ok) return parsed;

    const result = await reviewProduct(parsed.value, reviewer);
    if (!result) return { ok: false, error: "not_found" };
    await refreshHomepageAfterChange();
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/curadoria");
    return { ok: true, eventId: result.eventId, productId: result.productId };
  });
}

export async function undoCurationDecision(
  productId: string,
  eventId: string,
): Promise<CurationActionResult> {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false, error: "forbidden" };
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(productId) || !/^\d+$/.test(eventId)) {
      return { ok: false, error: "invalid_payload" };
    }

    const undone = await undoReview(productId, eventId, reviewer);
    if (!undone) return { ok: false, error: "undo_conflict" };
    await refreshHomepageAfterChange();
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/curadoria");
    return { ok: true, eventId, productId };
  });
}

/** Adia a revisão de um produto ("Depois" — Rever em 7 dias) (M4-E). */
export async function deferCurationProduct(
  productId: string,
  days = 7,
): Promise<DeferralActionResult> {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false, error: "forbidden" };

    const deferredUntil =
      days === 7
        ? defaultDeferredUntil()
        : new Date(
            Date.now() + Math.min(Math.max(days, 1), 30) * 86_400_000,
          ).toISOString();

    const parsed = validateCurationDeferral({ productId, deferredUntil });
    if (!parsed.ok) return parsed;

    const ok = await deferReview(parsed.value, reviewer);
    if (!ok) return { ok: false, error: "defer_failed" };

    await refreshHomepageAfterChange();
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/curadoria");
    return { ok: true, productId, deferredUntil };
  });
}

/** Antecipa a volta de um produto adiado (M4-E). */
export async function clearDeferredCurationProduct(
  productId: string,
): Promise<DeferralActionResult> {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false, error: "forbidden" };
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(productId)) {
      return { ok: false, error: "invalid_payload" };
    }

    const ok = await clearDeferredReview(productId, reviewer);
    if (!ok) return { ok: false, error: "clear_failed" };

    await refreshHomepageAfterChange();
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/curadoria");
    return { ok: true, productId };
  });
}

/** Ação em lote sobre grupo editorial (M4-E). */
export async function submitGroupAction(
  input: GroupActionInput,
): Promise<GroupActionResultResponse> {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false, error: "forbidden" };

    const parsed = validateGroupAction(input);
    if (!parsed.ok) return parsed;

    try {
      const result = await actOnGroup(parsed.value, reviewer);
      await refreshHomepageAfterChange();
      revalidatePath("/");
      revalidatePath("/admin");
      revalidatePath("/admin/curadoria");
      return {
        ok: true,
        bulkActionId: result.bulkActionId,
        affectedCount: result.affectedCount,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "group_action_error";
      return { ok: false, error: message };
    }
  });
}

/** Desfaz integralmente a última ação em lote (M4-E). */
export async function undoGroupAction(
  bulkActionId: string,
): Promise<{ ok: true; bulkActionId: string } | { ok: false; error: string }> {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false, error: "forbidden" };
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(bulkActionId)) {
      return { ok: false, error: "invalid_payload" };
    }

    const undone = await undoBulkReview(bulkActionId, reviewer);
    if (!undone) return { ok: false, error: "undo_conflict" };

    await refreshHomepageAfterChange();
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/admin/curadoria");
    return { ok: true, bulkActionId };
  });
}

/** Busca sob demanda todos os membros de um grupo (M4-E). */
export async function fetchGroupMembers(
  groupId: string,
): Promise<
  { ok: true; members: CurationQueueProduct[] } | { ok: false; error: string }
> {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false, error: "forbidden" };
    if (!/^grp_[0-9a-f]{16}$/.test(groupId)) {
      return { ok: false, error: "invalid_group_id" };
    }

    try {
      const members = await groupMembers(groupId);
      return { ok: true, members };
    } catch {
      return { ok: false, error: "fetch_members_failed" };
    }
  });
}

export type AutomatedTriageActionResult =
  | {
      ok: true;
      processed: number;
      approved: number;
      rejected: number;
      held: number;
      annotatedPending: number;
    }
  | { ok: false; error: string };

/** Executa o funil de corte determinístico e triagem com Gemini 2.5 Flash sobre pendentes. */
export async function runAutomatedTriageAction(
  limit = 50,
): Promise<AutomatedTriageActionResult> {
  return accountOperation(async account => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false, error: "forbidden" };

    try {
      const automatic=await withAccountDb(account,async tx=>{
        const [policy]=await tx<{enabled:boolean}[]>`select enabled from garimpa.curation_policy_v2 where tenant_id=${account.tenantId}`;
        if(!policy?.enabled) return false;
        await tx`select pg_notify('garimpa_curation_ready',json_build_object('tenantId',${account.tenantId}::text)::text)`;
        return true;
      });
      if(automatic) return {ok:false,error:'automatic_curation_active'};
      const summary = await runPendingAutomatedTriage(scopedTenantId(), limit);
      await refreshHomepageAfterChange();
      revalidatePath("/");
      revalidatePath("/pauta");
      revalidatePath("/api/pauta");
      revalidatePath("/admin");
      revalidatePath("/admin/curadoria");
      return { ok: true, ...summary };
    } catch (err) {
      const message = err instanceof Error ? err.message : "triage_failed";
      return { ok: false, error: message };
    }
  });
}

/** Avaliar e destacar são decisões distintas da aprovação do catálogo. */
export async function saveEditorialAssessmentAction(
  input: EditorialAssessmentInput,
) {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false as const, error: "forbidden" };
    try {
      const result = await saveEditorialAssessment(
        input,
        reviewer,
        scopedTenantId(),
      );
      if (!result.ok) return result;
      const desk = await getEditorialSelectionDesk(scopedTenantId(),undefined,input.productId);
      revalidatePath("/bizu/[slug]", "page");
      revalidatePath("/api/deals");
      revalidatePath("/api/pauta");
      revalidatePath("/admin/curadoria");
      await refreshHomepageAfterChange();
      revalidatePath("/");
      revalidatePath("/pauta");
      return {
        ...result,
        candidate:
          desk.candidates.find(
            (candidate) => candidate.id === input.productId,
          ) ?? null,
      };
    } catch {
      return {
        ok: false as const,
        error: "Não foi possível salvar a avaliação. Tente novamente.",
      };
    }
  },input.expectedTenantId);
}

export async function replaceEditorialSelectionAction(
  input: Parameters<typeof replaceEditorialSelection>[0],
) {
  return accountOperation(async () => {
    const reviewer = await reviewerId();
    if (!reviewer) return { ok: false as const, error: "forbidden" };
    try {
      const result = await replaceEditorialSelection(
        input,
        reviewer,
        scopedTenantId(),
      );
      if (result.ok) {
        await refreshHomepageAfterChange(scopedTenantId(), true);
        revalidatePath("/");
        revalidatePath("/pauta");
        revalidatePath("/api/deals");
        revalidatePath("/api/pauta");
        revalidatePath("/admin/curadoria");
      }
      return result;
    } catch {
      return {
        ok: false as const,
        error: "Não foi possível ativar a seleção. Tente novamente.",
      };
    }
  });
}

export async function submitHumanRubricReviewAction(input: {
  productId: string;
  assessment: RubricAssessment;
  notes?: string;
  requestId?: string;
  tenantId?: string;
  expectedObservationId?: string;
  expectedTitle?: string;
  expectedCategory?: string | null;
  expectedProductUrl?: string;
  reviewDurationMs?: number;
}): Promise<
  | {
      ok: true;
      comparisonReviewId: string | null;
      agreement: boolean;
      hasShadow: boolean;
      disagreementCount: number;
    }
  | { ok: false; error: string }
> {
  return accountOperation(async () => {
    const auth = await getAuthorizedContext(input.tenantId);
    if (!auth) return { ok: false, error: "forbidden" };
    if(input.reviewDurationMs!==undefined && (!Number.isSafeInteger(input.reviewDurationMs) || input.reviewDurationMs<0 || input.reviewDurationMs>14_400_000))
      return {ok:false,error:"invalid_review_duration"};

    try {
      const res = await withAccountDb(auth.context, async (tx) => {
        if (input.expectedObservationId !== undefined) {
          const [product] = await tx<{title:string;category:string|null;product_url:string}[]>`select title,category,product_url from garimpa.product
            where tenant_id=${auth.context.tenantId} and id=${input.productId} for update`;
          const [observation] = await tx<{id:string}[]>`select id from garimpa.price_observation
            where tenant_id=${auth.context.tenantId} and product_id=${input.productId}
              and (not exists(select 1 from garimpa.editorial_offer_choice choice where choice.tenant_id=${auth.context.tenantId} and choice.product_id=${input.productId})
                or option_key=(select choice.option_key from garimpa.editorial_offer_choice choice where choice.tenant_id=${auth.context.tenantId} and choice.product_id=${input.productId}))
            order by observed_at desc,id desc limit 1`;
          if (!product || product.title!==input.expectedTitle || observation?.id!==input.expectedObservationId
            || input.expectedCategory!==undefined && product.category!==input.expectedCategory
            || input.expectedProductUrl!==undefined && product.product_url!==input.expectedProductUrl)
            throw new Error("audit_evidence_changed");
        }
        const facts = await loadRubricInput(
          tx,
          auth.context.tenantId,
          input.productId,
          input.expectedObservationId,
        );
        const validated = validateRubricAssessment({
          ...input.assessment,
          policyVersion: "rubric-v2",
          evidenceDigest: calculateRubricInputDigest(facts),
          createdAt: new Date().toISOString(),
        });
        return recordHumanRubricReview(tx, {
          tenantId: auth.context.tenantId,
          productId: input.productId,
          humanAssessment: validated,
          reviewedByAppUserId: auth.appUserId,
          notes: input.notes,
          requestId: input.requestId,
          evidenceSnapshot: facts,
          evidenceObservationId: input.expectedObservationId,
          reviewDurationMs: input.reviewDurationMs,
        });
      });
      revalidatePath("/admin/curadoria");
      return {
        ok: true,
        comparisonReviewId: res.comparisonReviewId,
        agreement: res.agreement,
        hasShadow: res.hasShadow,
        disagreementCount: res.disagreements.length,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "rubric_review_error",
      };
    }
  });
}

export async function fetchComparisonSampleAction(options?: {
  limit?: number;
  onlyDisagreements?: boolean;
  tenantId?: string;
}): Promise<
  | { ok: true; sample: ComparisonReviewSampleItem[] }
  | { ok: false; error: string }
> {
  return accountOperation(async () => {
    const auth = await getAuthorizedContext(options?.tenantId);
    if (!auth) return { ok: false, error: "forbidden" };

    try {
      const sample = await withAccountDb(auth.context, async (tx) => {
        return getComparisonReviewsSample(tx, auth.context.tenantId, options);
      });
      return { ok: true, sample };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "fetch_sample_failed",
      };
    }
  });
}

export async function fetchRubricPromotionMetricsAction(
  tenantId = scopedTenantId(),
): Promise<
  { ok: true; metrics: RubricPromotionMetrics } | { ok: false; error: string }
> {
  return accountOperation(async () => {
    const auth = await getAuthorizedContext(tenantId);
    if (!auth) return { ok: false, error: "forbidden" };

    try {
      const metrics = await withAccountDb(auth.context, async (tx) => {
        return getRubricPromotionMetrics(tx, auth.context.tenantId);
      });
      return { ok: true, metrics };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "fetch_metrics_failed",
      };
    }
  });
}

export async function runShadowEvaluationAction(input: {
  productId: string;
  item?: RubricInputItem;
  tenantId?: string;
}): Promise<{ ok: true; assessmentId: string } | { ok: false; error: string }> {
  return accountOperation(async () => {
    const auth = await getAuthorizedContext(input.tenantId);
    if (!auth) return { ok: false, error: "forbidden" };

    try {
      if (!process.env.GEMINI_API_KEY) {
        return { ok: false, error: "gemini_api_key_missing" };
      }
      const item = await withAccountDb(auth.context, (tx) =>
        loadRubricInput(tx, auth.context.tenantId, input.productId),
      );
      const rawResult = await evaluateRubricShadowItem(item);
      const digest = calculateRubricInputDigest(item);
      const aiResult={...rawResult,policyVersion:"rubric-v2",evidenceDigest:digest};
      const assessmentId = await withAccountDb(auth.context, async (tx) => {
        if(calculateRubricInputDigest(await loadRubricInput(tx,auth.context.tenantId,input.productId))!==digest)throw new Error("shadow_facts_changed");
        const id = await saveAnalysisAssessment(tx, {
          tenantId: auth.context.tenantId,
          productId: input.productId,
          rubricVersion: "rubric-v2",
          inputDigest: digest,
          result: aiResult,
          modelVersion: aiResult.modelVersion ?? "gemini-2.5-flash",
          promptVersion: aiResult.promptVersion ?? "rubric-v2-shadow",
          mode: "shadow",
        });
        const [human]=await tx<{id:string;assessment:RubricAssessment;actor_app_user_id:string}[]>`select id,assessment,actor_app_user_id from garimpa.editorial_assessment where tenant_id=${auth.context.tenantId} and product_id=${input.productId} and assessment->>'schemaVersion'='2' order by created_at desc,id desc limit 1`;
        if(human?.assessment.evidenceDigest===digest && human.assessment.policyVersion==='rubric-v2')await recordHumanRubricReview(tx,{tenantId:auth.context.tenantId,productId:input.productId,humanAssessment:human.assessment,reviewedByAppUserId:human.actor_app_user_id,editorialAssessmentId:human.id,requestId:'shadow-compare:'+id});
        return id;
      });
      return { ok: true, assessmentId };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "shadow_eval_failed",
      };
    }
  });
}

export async function ratifyRubricPolicyAction(input: {
  rubricVersion?: string;
  reviewIds: string[];
  rationale: string;
  cohort?: string;
  minUnits?: number;
  minAgreementRate?: number;
  tenantId?: string;
}): Promise<
  | { ok: true; decisionId: string; status: "ratified"; agreementRate: number }
  | { ok: false; error: string }
> {
  return accountOperation(async () => {
    const auth = await getAuthorizedContext(input.tenantId);
    if (!auth) return { ok: false, error: "forbidden" };
    if (auth.context.membershipRole !== "owner") {
      return { ok: false, error: "owner_required" };
    }

    try {
      const res = await withAccountDb(auth.context, async (tx) => {
        return ratifyRubricPolicy(tx, {
          tenantId: auth.context.tenantId,
          rubricVersion: input.rubricVersion ?? "rubric-v2",
          reviewIds: input.reviewIds,
          approvedByAppUserId: auth.appUserId,
          rationale: input.rationale,
          cohort: input.cohort,
          minUnits: input.minUnits,
          minAgreementRate: input.minAgreementRate,
        });
      });
      revalidatePath("/admin/curadoria");
      return {
        ok: true,
        decisionId: res.decisionId,
        status: res.status,
        agreementRate: res.agreementRate,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "ratification_failed",
      };
    }
  });
}
