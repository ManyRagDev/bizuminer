import { verifiedWorkflowsReady } from "../../../lib/workflow-readiness.ts";
import { pageAccount } from "../../../lib/page-account.ts";
import { withAccountDb } from "../../../lib/tenant-db.ts";
import GovernanceWorkspace from "./workspace.tsx";
export const dynamic = "force-dynamic";
export default async function Page() {
  const c = await pageAccount();
  if (!c || c.membershipRole !== "owner")
    return <p>Aprovação restrita ao responsável da conta.</p>;
  if (!(await verifiedWorkflowsReady()))
    return (
      <p>
        Esta capacidade aguarda a migration de workflows verificados no ambiente
        autorizado. A operação atual permanece disponível.
      </p>
    );
  const evidence = await withAccountDb(c, async (tx) => ({
    uploads:
      await tx`select id,kind,status,original_name,sha256,created_at::text from garimpa.private_artifact where tenant_id=${c.tenantId} order by created_at desc limit 100`,
    reviews:
      await tx`select id,product_id,rubric_version,agreement from garimpa.comparison_review where tenant_id=${c.tenantId} order by created_at desc limit 100`,
    observations:
      await tx`select id,product_id,price_cents,observed_at::text,offer_evidence from garimpa.price_observation where tenant_id=${c.tenantId} order by observed_at desc limit 100`,
    calibrations:
      await tx`select id,policy_version,synthetic,reviewed_at::text from garimpa.price_calibration_run where tenant_id=${c.tenantId}`,
    decisions:
      await tx`select id,kind,subject_version,method,approved_at::text from garimpa.governance_decision where tenant_id=${c.tenantId}`,
  }));
  return (
    <GovernanceWorkspace evidence={JSON.parse(JSON.stringify(evidence))} />
  );
}
