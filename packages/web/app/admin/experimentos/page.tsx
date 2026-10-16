import { verifiedWorkflowsReady } from "../../../lib/workflow-readiness.ts";
import { redirect } from "next/navigation";
import { getPageAuth, isAffiliate } from "../../../lib/auth.ts";
import {
  getUserMemberships,
  resolveAccountContext,
} from "../../../lib/account-context.ts";
import { listPolicyExperiments } from "../../../lib/experiment-db.ts";
import ExperimentWorkspace from "./workspace.tsx";

export const dynamic = "force-dynamic";

export default async function ExperimentosPage({
  searchParams,
}: {
  searchParams: Promise<{ conta?: string }>;
}) {
  const params = await searchParams;
  const user = await getPageAuth();
  if (!user || !(await isAffiliate(user))) {
    redirect("/entrar?next=/admin/experimentos");
  }

  const accounts = await getUserMemberships(user.id);
  const context = await resolveAccountContext({
    authUserId: user.id,
    requestedAccount: params.conta,
  });
  if (!context) {
    return (
      <section className="admin-panel">
        <h1>Experimentos</h1>
        <p>Nenhuma conta autorizada disponível.</p>
      </section>
    );
  }

  if (!(await verifiedWorkflowsReady()))
    return (
      <p>
        Experimentos aguardam a migration de workflows verificados neste
        ambiente.
      </p>
    );
  const experiments = await listPolicyExperiments(context);

  return (
    <ExperimentWorkspace
      accounts={accounts}
      tenantId={context.tenantId}
      isOwner={context.membershipRole === "owner"}
      experiments={experiments}
    />
  );
}
