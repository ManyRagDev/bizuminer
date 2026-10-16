import { verifiedWorkflowsReady } from "../../../lib/workflow-readiness.ts";
import { pageAccount, platformPageContext } from "../../../lib/page-account.ts";
import { getOnboardingProgress } from "../../../lib/saas-onboarding-db.ts";
import { withAccountDb } from "../../../lib/tenant-db.ts";
import OnboardingWorkspace from "./workspace.tsx";
export const dynamic = "force-dynamic";
export default async function Page() {
  const c = await pageAccount();
  if (!c)
    return (
      <p>
        Nenhuma conta ativa disponível. <a href="/convite">Aceitar convite</a>
      </p>
    );
  if (!(await verifiedWorkflowsReady()))
    return (
      <p>
        Esta capacidade aguarda a migration de workflows verificados no ambiente
        autorizado. A operação atual permanece disponível.
      </p>
    );
  const [progress, configs, platform] = await Promise.all([
    getOnboardingProgress(c),
    withAccountDb(
      c,
      (tx) =>
        tx`select id,marketplace,status from garimpa.affiliate_marketplace_config where affiliate_id=${c.affiliateId}`,
    ),
    platformPageContext(),
  ]);
  return (
    <OnboardingWorkspace
      tenantId={c.tenantId}
      progress={JSON.parse(JSON.stringify(progress))}
      configs={JSON.parse(JSON.stringify(configs))}
      platformAdmin={Boolean(platform)}
    />
  );
}
