import { ratifyRubricPolicy } from "./rubric-db.ts";
import { calculatePriceEvidence } from "./price-evidence.ts";
import { calculateContentDigest } from "./commerce-contract.ts";
import { db } from "./db.ts";
import { withCommercialDb as withAccountDb, type AccountContext } from "./commercial-rollout.ts";

export interface RubricMethod {
  cohort: string;
  minUnits: number;
  minAgreementRate: number;
  rationale: string;
}
export async function ratifyRubric(
  context: AccountContext,
  input: { version: string; reviewIds: string[]; method: RubricMethod },
  factory: typeof db = db,
) {
  if (context.membershipRole !== "owner" || !context.actorAppUserId)
    throw new Error("owner_required");
  const m = input.method;
  if (
    !m.cohort?.trim() ||
    !m.rationale?.trim() ||
    !Number.isInteger(m.minUnits) ||
    m.minUnits < 30 ||
    m.minUnits > 50 ||
    !Number.isFinite(m.minAgreementRate) ||
    m.minAgreementRate < 0 ||
    m.minAgreementRate > 1
  )
    throw new Error("approved_method_required");
  return withAccountDb(context, async tx => {
    const result=await ratifyRubricPolicy(tx,{tenantId:context.tenantId,rubricVersion:input.version,reviewIds:input.reviewIds,
      approvedByAppUserId:context.actorAppUserId!,rationale:m.rationale,cohort:m.cohort,minUnits:m.minUnits,minAgreementRate:m.minAgreementRate});
    return {id:result.decisionId};
  },factory);
}

export async function recordPriceCalibration(
  context: AccountContext,
  input: {
    version: string;
    observationIds: string[];
    results: Record<string, unknown>;
    sourceRef: string;
    synthetic: boolean;
  },
  factory: typeof db = db,
) {
  if (
    context.membershipRole !== "owner" ||
    !input.sourceRef.trim() ||
    !input.observationIds.length
  )
    throw new Error("calibration_evidence_required");
  return withAccountDb(
    context,
    async (tx) => {
      const [source] =
        await tx`select id from garimpa.private_artifact where id::text=${input.sourceRef} and tenant_id=${context.tenantId} and kind='account_evidence' and status='ready'`;
      const [policy] = await tx<
        any[]
      >`select config from garimpa.price_evidence_policy_version where tenant_id=${context.tenantId} and version=${input.version} and status='draft'`;
      const cases = input.results.cases as {
        observationId: string;
        expectedState: string;
      }[];
      if (
        !source ||
        !policy ||
        input.results.experiment !== "EXP-02" ||
        input.results.reviewed !== true ||
        !Array.isArray(cases) ||
        cases.length < 10 ||
        new Set(cases.map((c) => c.observationId)).size !== cases.length ||
        cases.some((c) => !input.observationIds.includes(c.observationId))
      )
        throw new Error("calibration_evidence_invalid");
      const calculated = [];
      for (const test of cases) {
        const [current] = await tx<
          any[]
        >`select * from garimpa.price_observation where id::text=${test.observationId} and tenant_id=${context.tenantId}`;
        if (!current) throw new Error("calibration_observation_not_found");
        const history = await tx<
          any[]
        >`select id,price_cents,original_price_cents,observed_at::text,offer_evidence from garimpa.price_observation where tenant_id=${context.tenantId} and product_id=${current.product_id} and observed_at<=${current.observed_at}`;
        const actual = calculatePriceEvidence({
          tenantId: context.tenantId,
          productId: current.product_id,
          currentObservationId: current.id,
          observations: history.map((o) => ({
            id: o.id,
            priceCents: o.price_cents,
            originalPriceCents: o.original_price_cents,
            observedAt: o.observed_at,
            offerEvidence: o.offer_evidence,
            currency: o.offer_evidence?.currency,
          })),
          policy: policy.config,
          policyStatus: "approved",
          now: new Date(current.observed_at),
        });
        calculated.push({
          ...test,
          actualState: actual.state,
          matches: actual.state === test.expectedState,
        });
      }
      if (calculated.some((c) => !c.matches))
        throw new Error("calibration_cases_failed");
      const coverage = [...new Set(calculated.map((c) => c.actualState))];
      const results = {
        experiment: "EXP-02",
        reviewed: true,
        pass: ["E0", "E1", "E2", "E3"].every((s) =>
          coverage.includes(s as never),
        ),
        coverage,
        cases: calculated,
      };
      const [r] = await tx<
        { id: string }[]
      >`insert into garimpa.price_calibration_run(tenant_id,policy_version,observation_ids,results,source_ref,synthetic,reviewed_by,policy_snapshot,policy_digest) values(${context.tenantId},${input.version},${tx.json(input.observationIds)},${tx.json(results)},${input.sourceRef},${input.synthetic},${context.actorAppUserId!},${tx.json(policy.config)},${calculateContentDigest(policy.config)}) returning id`;
      return r!;
    },
    factory,
  );
}
