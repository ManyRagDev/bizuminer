import { verifiedWorkflowsReady } from "../../../lib/workflow-readiness.ts";
import { pageAccount, platformPageContext } from "../../../lib/page-account.ts";
import OnboardingWorkspace from "./workspace.tsx";
export const dynamic = "force-dynamic";
export default async function Page() {
  const c = await pageAccount();
  if (!c)
    return (
      <p>Nenhuma conta ativa disponível.</p>
    );
  // Store configuration belongs to the existing account, independently of SaaS
  // onboarding. Only the separate private-evidence upload uses the workflow gate.
  const [platform, canDocumentLinks] = await Promise.all([
    platformPageContext(),
    verifiedWorkflowsReady().catch(() => false),
  ]);
  return (
    <OnboardingWorkspace
      tenantId={c.tenantId}
      platformAdmin={Boolean(platform)}
      canManage={c.membershipRole==='owner'}
      canDocumentLinks={canDocumentLinks}
    />
  );
}
