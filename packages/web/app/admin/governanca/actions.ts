"use server";
import { pageAccount } from "../../../lib/page-account.ts";
import {
  ratifyRubric,
  recordPriceCalibration,
  type RubricMethod,
} from "../../../lib/governance-db.ts";
import { withAccountDb } from "../../../lib/tenant-db.ts";
import {
  savePriceEvidencePolicyDraft,
  approvePriceEvidencePolicy,
  type PriceEvidencePolicyConfig,
} from "../../../lib/price-evidence.ts";
import { revalidatePath } from "next/cache";
export async function governanceAction(i: {
  kind: "rubric" | "calibration" | "price_draft" | "price_approve";
  version: string;
  payload: string;
}) {
  const c = await pageAccount();
  if (!c || c.membershipRole !== "owner")
    return { ok: false, error: "owner_required" };
  try {
    const p = JSON.parse(i.payload);
    let result: unknown;
    if (i.kind === "rubric")
      result = await ratifyRubric(c, {
        version: i.version,
        reviewIds: p.reviewIds,
        method: p.method as RubricMethod,
      });
    else if (i.kind === "calibration")
      result = await recordPriceCalibration(c, {
        version: i.version,
        observationIds: p.observationIds,
        results: p.results,
        sourceRef: p.sourceRef,
        synthetic: p.synthetic !== false,
      });
    else if (i.kind === "price_draft")
      result = await withAccountDb(c, (tx) =>
        savePriceEvidencePolicyDraft(tx, c.tenantId, {
          version: i.version,
          config: p as PriceEvidencePolicyConfig,
        }),
      );
    else
      result = await withAccountDb(c, (tx) =>
        approvePriceEvidencePolicy(tx, c.tenantId, {
          version: i.version,
          approvedBy: c.actorAppUserId!,
          calibrationReportRef: p.calibrationRunId,
        }),
      );
    revalidatePath("/admin/governanca");
    revalidatePath("/admin/curadoria");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function recoverArtifactAction(id: string) {
  const c = await pageAccount();
  if (!c || c.membershipRole !== "owner")
    return { ok: false, error: "owner_required" };
  try {
    const { reconcilePrivateArtifact } =
      await import("../../../lib/private-artifact-db.ts");
    await reconcilePrivateArtifact(c, id);
    revalidatePath("/admin/governanca");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
