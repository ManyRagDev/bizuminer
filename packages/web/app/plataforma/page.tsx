import { redirect } from "next/navigation";
import { getPageAuth } from "../../lib/auth.ts";
import { platformPageContext } from "../../lib/page-account.ts";
import { verifiedWorkflowsReady } from "../../lib/workflow-readiness.ts";
import PlatformWorkspace from "../admin/onboarding/platform-workspace.tsx";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!(await getPageAuth())) redirect("/entrar?next=/plataforma");
  if (!(await platformPageContext()))
    return <p>Acesso restrito à administração da plataforma.</p>;
  if (!(await verifiedWorkflowsReady()))
    return (
      <p>
        Provisionamento aguarda a atualização do banco no ambiente autorizado.
      </p>
    );
  return <PlatformWorkspace />;
}
