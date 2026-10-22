"use server";
import { pageAccount } from "../../../lib/page-account.ts";
import { getLatestHumanRubricAssessment } from "../../../lib/rubric-db.ts";
import { currentFacts,priceEvidence as currentPriceEvidence } from "../../../lib/commercial-workflow.ts";
import { calculateRubricInputDigest,loadRubricInput } from "../../../lib/rubric-db.ts";

import { revalidatePath } from "next/cache";
import { getPageAuth, isAffiliate, resolveAccountContext, type AccountContext } from "../../../lib/auth.ts";
import { withAccountDb } from "../../../lib/tenant-db.ts";
import {
  createAudiencePolicy,
  createAudiencePolicyVersion,
  createOrUpdateOpportunity,
  archiveOpportunity,
  reactivateOpportunity,
  getRadarOpportunities,
  type OpportunityWithProduct,
} from "../../../lib/opportunity-db.ts";
import type {
  AudiencePolicyConfig,
  OpportunityState,
} from "../../../lib/opportunity-contract.ts";
import type { RubricAssessment } from "../../../lib/rubric-contract.ts";
import type { PriceEvidence } from "../../../lib/price-evidence.ts";

async function getAuthorizedContext(requestedAccount?: string): Promise<{ context: AccountContext; appUserId: string } | null> {
  const user = await getPageAuth();
  if (!user || !(await isAffiliate(user))) return null;
  const context = await pageAccount(requestedAccount);
  if (!context || !context.actorAppUserId) return null;
  return { context, appUserId: context.actorAppUserId };
}

export async function createAudiencePolicyAction(input: {
  name: string;
  status?: "draft" | "active";
  tenantId?: string;
}): Promise<{ ok: true; policyId: string } | { ok: false; error: string }> {
  const auth = await getAuthorizedContext(input.tenantId);
  if (!auth) return { ok: false, error: "forbidden" };

  try {
    const res = await withAccountDb(auth.context, async (tx) => {
      return createAudiencePolicy(tx, auth.context.tenantId, input);
    });
    revalidatePath("/admin/direcionamento");
    return { ok: true, policyId: res.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "create_policy_failed" };
  }
}

export async function createAudiencePolicyVersionAction(input: {
  policyId: string;
  version: string;
  config: AudiencePolicyConfig;
  approved?: boolean;
  tenantId?: string;
}): Promise<{ ok: true; versionId: string } | { ok: false; error: string }> {
  const auth = await getAuthorizedContext(input.tenantId);
  if (!auth) return { ok: false, error: "forbidden" };

  try {
    const res = await withAccountDb(auth.context, async (tx) => {
      return createAudiencePolicyVersion(tx, auth.context.tenantId, {
        policyId: input.policyId,
        version: input.version,
        config: input.config,
        approvedBy: input.approved ? auth.appUserId : undefined,
      });
    });
    revalidatePath("/admin/direcionamento");
    return { ok: true, versionId: res.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "create_policy_version_failed" };
  }
}

export async function fetchRadarOpportunitiesAction(options?: {
  audienceKey?: string;
  channel?: string;
  state?: OpportunityState;
  limit?: number;
  tenantId?: string;
}): Promise<{ ok: true; opportunities: OpportunityWithProduct[] } | { ok: false; error: string }> {
  const auth = await getAuthorizedContext(options?.tenantId);
  if (!auth) return { ok: false, error: "forbidden" };

  try {
    const opportunities = await withAccountDb(auth.context, async (tx) => {
      return getRadarOpportunities(tx, auth.context.tenantId, options);
    });
    return { ok: true, opportunities };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "fetch_radar_failed" };
  }
}

export async function createOrUpdateOpportunityAction(input: {
  productId: string;
  policyVersionId: string;
  audienceKey: string;
  channel: string;
  assessment?: RubricAssessment;
  priceEvidence?: PriceEvidence;
  humanPriority?: { state?: OpportunityState; reason?: string };
  tenantId?: string;
}): Promise<
  | { ok: true; opportunityId: string; state: OpportunityState; class: string; revision: number }
  | { ok: false; error: string }
> {
  const auth = await getAuthorizedContext(input.tenantId);
  if (!auth) return { ok: false, error: "forbidden" };

  try {
    const res = await withAccountDb(auth.context, async (tx) => {
      const assessment=await getLatestHumanRubricAssessment(tx,auth.context.tenantId,input.productId);
      const facts=await currentFacts(tx,auth.context.tenantId,input.productId);
      const priceEvidence=await currentPriceEvidence(tx,auth.context.tenantId,facts);
      const [policy]=await tx<any[]>`select config from garimpa.audience_policy_version where id=${input.policyVersionId} and tenant_id=${auth.context.tenantId}`;
      if(!policy||policy.config.audienceKey!==input.audienceKey||!policy.config.allowedChannels?.includes(input.channel))throw new Error("audience_policy_mismatch");
      if(!assessment)throw new Error("human_assessment_required");
      if(assessment.evidenceDigest!==calculateRubricInputDigest(await loadRubricInput(tx,auth.context.tenantId,input.productId)))throw new Error("human_review_facts_changed");

      return createOrUpdateOpportunity(tx, auth.context.tenantId, {
        productId: input.productId,
        policyVersionId: input.policyVersionId,
        audienceKey: input.audienceKey,
        channel: input.channel,
        assessment,
        priceEvidence,
        humanPriority: input.humanPriority,
        actorRef: auth.appUserId,
      });
    });
    revalidatePath("/admin/direcionamento");
    return {
      ok: true,
      opportunityId: res.id,
      state: res.state,
      class: res.opportunityClass,
      revision: res.revision,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "save_opportunity_failed" };
  }
}

export async function createAudiencePolicyBundleAction(input:{tenantId:string;name:string;audienceKey:string;channel:string;cooldownHours:number;version:string}){
 const auth=await getAuthorizedContext(input.tenantId);if(!auth||auth.context.membershipRole!=='owner')return {ok:false,error:'owner_required'};
 if(!input.name.trim()||!input.audienceKey.trim()||!input.version.trim()||!Number.isFinite(input.cooldownHours)||input.cooldownHours<0)return {ok:false,error:'explicit_audience_policy_required'};
 try{const result=await withAccountDb(auth.context,async tx=>{const p=await createAudiencePolicy(tx,auth.context.tenantId,{name:input.name});const version=await createAudiencePolicyVersion(tx,auth.context.tenantId,{policyId:p.id,version:input.version,config:{audienceKey:input.audienceKey,name:input.name,targetCategories:[],allowedChannels:[input.channel],cooldownHours:input.cooldownHours},approvedBy:auth.appUserId});return {policyId:p.id,versionId:version.id};});revalidatePath('/admin/curadoria');return {ok:true,result};}catch(e){return {ok:false,error:String(e)};}
}

export async function archiveOpportunityAction(input: {
  opportunityId: string;
  reason?: string;
  tenantId?: string;
}): Promise<{ ok: true; revision: number } | { ok: false; error: string }> {
  const auth = await getAuthorizedContext(input.tenantId);
  if (!auth) return { ok: false, error: "forbidden" };

  try {
    const res = await withAccountDb(auth.context, async (tx) => {
      return archiveOpportunity(tx, auth.context.tenantId, input.opportunityId, {
        reason: input.reason,
        actorRef: auth.appUserId,
      });
    });
    if (!res.ok) return { ok: false, error: "archive_failed" };
    revalidatePath("/admin/direcionamento");
    return { ok: true, revision: res.revision };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "archive_failed" };
  }
}

export async function reactivateOpportunityAction(input: {
  opportunityId: string;
  reason?: string;
  tenantId?: string;
}): Promise<{ ok: true; revision: number } | { ok: false; error: string }> {
  const auth = await getAuthorizedContext(input.tenantId);
  if (!auth) return { ok: false, error: "forbidden" };

  try {
    const res = await withAccountDb(auth.context, async (tx) => {
      return reactivateOpportunity(tx, auth.context.tenantId, input.opportunityId, {
        reason: input.reason,
        actorRef: auth.appUserId,
      });
    });
    if (!res.ok) return { ok: false, error: res.error ?? "reactivate_failed" };
    revalidatePath("/admin/direcionamento");
    return { ok: true, revision: res.revision };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "reactivate_failed" };
  }
}
