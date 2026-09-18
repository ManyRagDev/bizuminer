import { redirect } from "next/navigation";
import { getPageAuth, isAdmin } from "../../lib/auth";
import { curationDecisionLoad } from "../../lib/curation-db";
import AdminShell from "../_components/admin-shell";
import DenyAccess from "../_components/deny-access";

export const dynamic = "force-dynamic";

/**
 * Layout do painel (09/09/2026). Centraliza a barreira de dono e envolve
 * toda rota `/admin/*` no AdminShell persistente (sidebar + drawer mobile).
 *
 * Antes cada página fazia o próprio gate e renderizava o próprio header —
 * agora o gate é único e a navegação é a mesma em todas as abas do painel.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getPageAuth();
  if (!user) redirect("/entrar?next=/admin");
  if (!isAdmin(user)) return <DenyAccess />;

  const decisionLoad = await curationDecisionLoad("local");

  return (
    <AdminShell curationCount={decisionLoad.singularsCount + decisionLoad.openGroupsCount}>
      {children}
    </AdminShell>
  );
}