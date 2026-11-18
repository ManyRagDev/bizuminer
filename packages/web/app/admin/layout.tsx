import { pageAccount } from "../../lib/page-account.ts";
import './workspace.css';
import './workspace-cards.css';
import { redirect } from "next/navigation";
import { getPageAuth, isAffiliate } from "../../lib/auth";
import AccountAdminShell from "../_components/account-admin-shell.tsx";
import DenyAccess from "../_components/deny-access";

export const dynamic = "force-dynamic";

/**
 * Layout do painel (09/09/2026). Centraliza a barreira da role `afiliado` e envolve
 * toda rota `/admin/*` no AdminShell persistente (sidebar + drawer mobile).
 *
 * Resolve o AccountContext autenticado (C-01) para carregar os contadores
 * da conta autorizada, sem vazar a casa nem assumir tenant arbitrário.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getPageAuth();
  if (!user) redirect("/entrar?next=/admin");
  if (!(await isAffiliate(user))) return <DenyAccess />;

  const account = await pageAccount();
  if (!account) return <DenyAccess />;

  return (
    <AccountAdminShell account={account} userId={user.id}>
      {children}
    </AccountAdminShell>
  );
}
