/** Paired policy experiments: approved protocol precedes immutable measurement. */
import { db } from "./db.ts";
import { withCommercialDb as withAccountDb, type AccountContext } from "./commercial-rollout.ts";
import {
  buildMetricResult,
  type PolicyExperiment,
} from "./experiment-contract.ts";
import { calculateContentDigest } from "./commerce-contract.ts";
import { loadRubricInput, calculateRubricInputDigest } from "./rubric-db.ts";
import { formatCsvRow } from "./commission-import-contract.ts";
export interface CreatePolicyExperimentInput {
  tenantId?: string;
  audiencePolicyId?: string | null;
  baselineVersion: string;
  candidateVersion: string;
  hypothesis: string;
  cohortSpec?: Record<string, unknown>;
  primaryMetric: string;
  minSample?: number;
}
export interface ExperimentMethod {
  design: "paired";
  cohort: string;
  windowStart: string;
  windowEnd: string;
  minPairs: number;
  minimumDelta: number;
  rationale: string;
}
const owner = (c: AccountContext) => {
  if (c.membershipRole !== "owner" || !c.actorAppUserId)
    throw new Error("owner_required");
};
const columns =
  'id,tenant_id as "tenantId",audience_policy_id as "audiencePolicyId",baseline_version as "baselineVersion",candidate_version as "candidateVersion",hypothesis,cohort_spec as "cohortSpec",primary_metric as "primaryMetric",min_sample as "minSample",started_at::text as "startedAt",ended_at::text as "endedAt",status,promotion_rationale as "promotionRationale",promoted_by as "promotedBy",created_at::text as "createdAt",methodology,method_approved_by,method_approved_at,reviewed_by,review_notes';
async function experiment(tx: any, tenant: string, id: string, lock = false) {
  const rows = await tx.unsafe(
    `select ${columns} from garimpa.policy_experiment where tenant_id=$1 and id::text=$2 ${lock ? "for update" : ""}`,
    [tenant, id],
  );
  if (!rows[0]) throw new Error("experiment_not_found");
  return rows[0];
}
async function versions(
  tx: any,
  tenant: string,
  policy: string,
  base: string,
  candidate: string,
) {
  const rows =
    await tx`select version from garimpa.audience_policy_version where tenant_id=${tenant} and policy_id=${policy} and version in (${base},${candidate})`;
  if (new Set(rows.map((r: any) => r.version)).size !== 2)
    throw new Error("candidate_or_baseline_version_not_found");
}
export async function createPolicyExperiment(
  c: AccountContext,
  i: CreatePolicyExperimentInput,
  f: typeof db = db,
) {
  owner(c);
  if (i.tenantId && i.tenantId !== c.tenantId)
    throw new Error("tenant_mismatch");
  if (["ctr", "conversion_rate"].includes(i.primaryMetric))
    throw new Error("observed_denominators_required_for_rate_experiments");
  if (
    !i.audiencePolicyId ||
    !i.hypothesis.trim() ||
    !i.primaryMetric.trim() ||
    i.baselineVersion === i.candidateVersion
  )
    throw new Error("policy_and_distinct_versions_required");
  return withAccountDb(
    c,
    async (tx) => {
      await versions(
        tx,
        c.tenantId,
        i.audiencePolicyId!,
        i.baselineVersion,
        i.candidateVersion,
      );
      const [r] = await tx<
        { id: string }[]
      >`insert into garimpa.policy_experiment(tenant_id,audience_policy_id,baseline_version,candidate_version,hypothesis,cohort_spec,primary_metric,min_sample,status) values(${c.tenantId},${i.audiencePolicyId!},${i.baselineVersion},${i.candidateVersion},${i.hypothesis},${tx.json((i.cohortSpec as never) ?? {})},${i.primaryMetric},${i.minSample ?? 0},'draft') returning id`;
      return { experimentId: r!.id };
    },
    f,
  );
}
export async function approveExperimentMethod(
  c: AccountContext,
  i: { experimentId: string; method: ExperimentMethod },
  f: typeof db = db,
) {
  owner(c);
  const m = i.method,
    lo = Date.parse(m.windowStart),
    hi = Date.parse(m.windowEnd);
  if (
    m.design !== "paired" ||
    !m.cohort?.trim() ||
    !m.rationale?.trim() ||
    !Number.isInteger(m.minPairs) ||
    m.minPairs < 1 ||
    !Number.isFinite(m.minimumDelta) ||
    !Number.isFinite(lo) ||
    !Number.isFinite(hi) ||
    hi <= lo
  )
    throw new Error("approved_method_required");
  return withAccountDb(
    c,
    async (tx) => {
      const e = await experiment(tx, c.tenantId, i.experimentId, true);
      if (e.status !== "draft") throw new Error("method_frozen");
      const existing =
        await tx`select id from garimpa.experiment_assignment where tenant_id=${c.tenantId} and experiment_id=${e.id} limit 1`;
      if (existing.length) throw new Error("method_must_precede_measurement");
      await tx`update garimpa.policy_experiment set methodology=${tx.json(m as never)},min_sample=${m.minPairs},method_approved_by=${c.actorAppUserId!},method_approved_at=clock_timestamp(),status='shadow' where id=${e.id} and tenant_id=${c.tenantId}`;
      return { approved: true };
    },
    f,
  );
}
export async function assignExperimentUnit(
  c: AccountContext,
  i: { experimentId: string; unitId: string; salt?: string },
  f: typeof db = db,
) {
  return withAccountDb(
    c,
    async (tx) => {
      const e = await experiment(tx, c.tenantId, i.experimentId, true);
      if (e.status !== "shadow" || !e.method_approved_at)
        throw new Error("approved_method_required");
      const facts = await loadRubricInput(tx, c.tenantId, i.unitId),
        digest = calculateRubricInputDigest(facts);
      const [r] = await tx<
        any[]
      >`insert into garimpa.experiment_assignment(tenant_id,experiment_id,unit_id,variant,input_digest,input_snapshot) values(${c.tenantId},${e.id},${i.unitId},'paired',${digest},${tx.json(facts as never)}) on conflict(tenant_id,experiment_id,unit_id) do nothing returning id,unit_id as "unitId",variant,input_digest as "inputDigest",input_snapshot as "inputSnapshot"`;
      const prior =
        r ??
        (
          await tx<
            any[]
          >`select id,unit_id as "unitId",variant,input_digest as "inputDigest",input_snapshot as "inputSnapshot" from garimpa.experiment_assignment where tenant_id=${c.tenantId} and experiment_id=${e.id} and unit_id=${i.unitId}`
        )[0];
      if (prior.inputDigest !== digest)
        throw new Error("assignment_facts_changed");
      return { assignment: prior, alreadyExisted: !r };
    },
    f,
  );
}
export async function recordExperimentEvaluation(
  c: AccountContext,
  i: {
    experimentId: string;
    unitId: string;
    variant: "baseline" | "candidate";
    output: Record<string, unknown>;
    inputDigest?: string;
  },
  f: typeof db = db,
) {
  return withAccountDb(
    c,
    async (tx) => {
      const e = await experiment(tx, c.tenantId, i.experimentId, true);
      if (e.status !== "shadow" || !e.method_approved_at)
        throw new Error("approved_method_required");
      const [a] = await tx<
        any[]
      >`select * from garimpa.experiment_assignment where tenant_id=${c.tenantId} and experiment_id=${e.id} and unit_id=${i.unitId}`;
      if (!a || a.variant !== "paired")
        throw new Error("paired_assignment_required");
      if (i.inputDigest !== a.input_digest)
        throw new Error("measurement_digest_mismatch");
      const score = i.output[e.primaryMetric];
      if (typeof score !== "number" || !Number.isFinite(score))
        throw new Error("observed_metric_required");
      const now = Date.now();
      if (
        now < Date.parse(e.methodology.windowStart) ||
        now > Date.parse(e.methodology.windowEnd)
      )
        throw new Error("outside_approved_window");
      const output = { ...i.output, inputDigest: a.input_digest };
      const [r] = await tx<
        { id: string }[]
      >`insert into garimpa.experiment_evaluation(tenant_id,experiment_id,unit_id,variant,output) values(${c.tenantId},${e.id},${i.unitId},${i.variant},${tx.json(output as never)}) on conflict(tenant_id,experiment_id,unit_id,variant) do nothing returning id`;
      if (r) return { evaluationId: r.id, alreadyExisted: false };
      const [prior] = await tx<
        any[]
      >`select id,output from garimpa.experiment_evaluation where tenant_id=${c.tenantId} and experiment_id=${e.id} and unit_id=${i.unitId} and variant=${i.variant}`;
      if (
        calculateContentDigest(prior.output) !== calculateContentDigest(output)
      )
        throw new Error("evaluation_immutable_conflict");
      return { evaluationId: prior.id, alreadyExisted: true };
    },
    f,
  );
}
async function report(tx: any, c: AccountContext, id: string) {
  const e = await experiment(tx, c.tenantId, id);
  const rows =
    await tx`select a.unit_id,a.input_digest,b.output as baseline,n.output as candidate from garimpa.experiment_assignment a join garimpa.experiment_evaluation b on b.tenant_id=a.tenant_id and b.experiment_id=a.experiment_id and b.unit_id=a.unit_id and b.variant='baseline' join garimpa.experiment_evaluation n on n.tenant_id=a.tenant_id and n.experiment_id=a.experiment_id and n.unit_id=a.unit_id and n.variant='candidate' where a.tenant_id=${c.tenantId} and a.experiment_id=${e.id} and a.variant='paired'`;
  const pairs = rows.filter(
    (r: any) =>
      r.baseline.inputDigest === r.input_digest &&
      r.candidate.inputDigest === r.input_digest &&
      typeof r.baseline[e.primaryMetric] === "number" &&
      Number.isFinite(r.baseline[e.primaryMetric]) &&
      typeof r.candidate[e.primaryMetric] === "number" &&
      Number.isFinite(r.candidate[e.primaryMetric]),
  );
  const metric = (variant: string) =>
    buildMetricResult({
      key: e.primaryMetric + "_" + variant,
      numerator: pairs.length
        ? pairs.reduce(
            (s: number, r: any) => s + r[variant][e.primaryMetric],
            0,
          )
        : null,
      denominator: pairs.length || null,
      unit: "ratio",
      source: "experiment_evaluation",
      windowStart: e.methodology?.windowStart ?? e.startedAt,
      windowEnd: e.methodology?.windowEnd ?? new Date().toISOString(),
      cohortDefinition: e.methodology?.cohort ?? "method_not_approved",
      sampleSize: pairs.length,
      attributionMethod: "paired_same_frozen_facts",
      policyVersions: [
        variant === "baseline" ? e.baselineVersion : e.candidateVersion,
      ],
    });
  return {
    experiment: e as PolicyExperiment,
    baselineMetric: metric("baseline"),
    candidateMetric: metric("candidate"),
    totalSampleSize: pairs.length,
  };
}
export async function getExperimentReport(
  c: AccountContext,
  id: string,
  f: typeof db = db,
) {
  return withAccountDb(c, (tx) => report(tx, c, id), f);
}
export async function reviewPolicyExperiment(
  c: AccountContext,
  i: {
    experimentId: string;
    reviewNotes?: string;
    decision?: "reviewed" | "rejected";
  },
  f: typeof db = db,
) {
  if (!c.actorAppUserId || !c.membershipRole || !i.reviewNotes?.trim())
    throw new Error("authorized_review_required");
  return withAccountDb(
    c,
    async (tx) => {
      const e = await experiment(tx, c.tenantId, i.experimentId, true);
      if (e.status !== "shadow" || !e.method_approved_at)
        throw new Error("approved_method_required");
      const r = await report(tx, c, e.id);
      if (i.decision !== "rejected" && r.totalSampleSize < e.minSample)
        throw new Error("insufficient_eligible_pairs");
      await tx`update garimpa.policy_experiment set status=${i.decision ?? "reviewed"},reviewed_by=${c.actorAppUserId!},review_notes=${i.reviewNotes!},reviewed_at=clock_timestamp() where id=${e.id} and tenant_id=${c.tenantId}`;
      return { reviewed: i.decision !== "rejected" };
    },
    f,
  );
}
export async function promotePolicyExperiment(
  c: AccountContext,
  i: {
    experimentId: string;
    policyId?: string | null;
    promotionRationale: string;
    promotedBy?: string;
  },
  f: typeof db = db,
) {
  owner(c);
  if (!i.promotionRationale.trim()) throw new Error("rationale_required");
  return withAccountDb(
    c,
    async (tx) => {
      const e = await experiment(tx, c.tenantId, i.experimentId, true),
        r = await report(tx, c, e.id);
      if (
        e.status !== "reviewed" ||
        !e.reviewed_by ||
        !e.method_approved_at ||
        r.totalSampleSize < e.minSample ||
        r.baselineMetric.value === null ||
        r.candidateMetric.value === null ||
        r.candidateMetric.value - r.baselineMetric.value <
          e.methodology.minimumDelta
      )
        throw new Error("promotion_denied");
      if (i.policyId && i.policyId !== e.audiencePolicyId)
        throw new Error("policy_mismatch");
      await versions(
        tx,
        c.tenantId,
        e.audiencePolicyId,
        e.baselineVersion,
        e.candidateVersion,
      );
      const [candidate] = await tx<
        any[]
      >`select approved_by,approved_at from garimpa.audience_policy_version where tenant_id=${c.tenantId} and policy_id=${e.audiencePolicyId} and version=${e.candidateVersion}`;
      if (!candidate?.approved_by || !candidate.approved_at)
        throw new Error("candidate_approval_required");
      const [policy] = await tx<
        any[]
      >`select current_version from garimpa.audience_policy where id=${e.audiencePolicyId} and tenant_id=${c.tenantId} for update`;
      if (policy.current_version !== e.baselineVersion)
        throw new Error("policy_version_conflict");
      await tx`update garimpa.audience_policy set current_version=${e.candidateVersion} where id=${e.audiencePolicyId} and tenant_id=${c.tenantId}`;
      await tx`update garimpa.policy_experiment set status='promoted',promotion_rationale=${i.promotionRationale},promoted_by=${c.actorAppUserId!},ended_at=clock_timestamp() where id=${e.id} and tenant_id=${c.tenantId}`;
      await experimentEvent(tx, c, e.id, "PolicyExperimentPromoted", {
        baseline: e.baselineVersion,
        candidate: e.candidateVersion,
        method: e.methodology,
        sample: r.totalSampleSize,
        rationale: i.promotionRationale,
      });
      return {
        promoted: true,
        candidateVersion: e.candidateVersion,
        baselineVersion: e.baselineVersion,
      };
    },
    f,
  );
}
export async function rollbackPolicyExperiment(
  c: AccountContext,
  i: {
    experimentId: string;
    policyId?: string | null;
    rollbackRationale: string;
    actor?: string;
  },
  f: typeof db = db,
) {
  owner(c);
  if (!i.rollbackRationale.trim()) throw new Error("rationale_required");
  return withAccountDb(
    c,
    async (tx) => {
      const e = await experiment(tx, c.tenantId, i.experimentId, true);
      if (
        e.status !== "promoted" ||
        (i.policyId && i.policyId !== e.audiencePolicyId)
      )
        throw new Error("promoted_experiment_required");
      await versions(
        tx,
        c.tenantId,
        e.audiencePolicyId,
        e.baselineVersion,
        e.candidateVersion,
      );
      const [p] = await tx<
        any[]
      >`select current_version from garimpa.audience_policy where id=${e.audiencePolicyId} and tenant_id=${c.tenantId} for update`;
      if (p.current_version !== e.candidateVersion)
        throw new Error("policy_version_conflict");
      await tx`update garimpa.audience_policy set current_version=${e.baselineVersion} where id=${e.audiencePolicyId} and tenant_id=${c.tenantId}`;
      await tx`update garimpa.policy_experiment set status='rejected' where id=${e.id} and tenant_id=${c.tenantId}`;
      await experimentEvent(tx, c, e.id, "PolicyExperimentRolledBack", {
        rationale: i.rollbackRationale,
      });
      return { rolledBack: true, restoredVersion: e.baselineVersion };
    },
    f,
  );
}
async function experimentEvent(
  tx: any,
  c: AccountContext,
  id: string,
  kind: string,
  payload: unknown,
) {
  await tx`insert into garimpa.domain_event(tenant_id,aggregate_type,aggregate_id,aggregate_version,event_type,actor_ref,request_id,idempotency_key,payload) values(${c.tenantId},'policy_experiment',${id},${kind === "PolicyExperimentPromoted" ? 1 : 2},${kind},${c.actorAppUserId!},${c.requestId},${kind},${tx.json(payload)})`;
}
export async function listPolicyExperiments(
  c: AccountContext,
  f: typeof db = db,
): Promise<PolicyExperiment[]> {
  return withAccountDb(
    c,
    (tx) =>
      tx.unsafe(
        `select ${columns} from garimpa.policy_experiment where tenant_id=$1 order by created_at desc`,
        [c.tenantId],
      ),
    f,
  ) as Promise<PolicyExperiment[]>;
}
export function exportExperimentMethodologyCsv(
  r: Awaited<ReturnType<typeof getExperimentReport>>,
) {
  return [
    "field,value",
    ...Object.entries({
      experiment: r.experiment.id,
      status: r.experiment.status,
      method: JSON.stringify((r.experiment as any).methodology),
      sample: r.totalSampleSize,
      baseline: r.baselineMetric.value ?? "null",
      candidate: r.candidateMetric.value ?? "null",
    }).map(([k, v]) => formatCsvRow([k, String(v)])),
  ].join("\n");
}

export async function approveExperimentCandidate(
  c: AccountContext,
  i: { experimentId: string; rationale: string },
  f: typeof db = db,
) {
  owner(c);
  if (!i.rationale.trim()) throw new Error("rationale_required");
  return withAccountDb(
    c,
    async (tx) => {
      const e = await experiment(tx, c.tenantId, i.experimentId, true);
      if (!["draft", "shadow", "reviewed"].includes(e.status))
        throw new Error("candidate_approval_state_invalid");
      const [v] = await tx<
        any[]
      >`select id,config,approved_by from garimpa.audience_policy_version where tenant_id=${c.tenantId} and policy_id=${e.audiencePolicyId} and version=${e.candidateVersion} for update`;
      if (!v) throw new Error("candidate_not_found");
      if (v.approved_by) return { approved: true, alreadyExisted: true };
      await tx`update garimpa.audience_policy_version set approved_by=${c.actorAppUserId!},approved_at=clock_timestamp() where id=${v.id} and tenant_id=${c.tenantId}`;
      await experimentEvent(tx, c, e.id, "PolicyExperimentCandidateApproved", {
        version: e.candidateVersion,
        configDigest: calculateContentDigest(v.config),
        rationale: i.rationale,
      });
      return { approved: true, alreadyExisted: false };
    },
    f,
  );
}
