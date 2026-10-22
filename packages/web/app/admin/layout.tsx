import { pageAccount } from "../../lib/page-account.ts";
import { getUserMemberships } from "../../lib/account-context.ts";
import AccountSwitcher from "./account-switcher.tsx";
import { redirect } from "next/navigation";
import { getPageAuth, isAffiliate, resolveAccountContext } from "../../lib/auth";
import { curationSummary } from "../../lib/curation-db";
import AdminShell from "../_components/admin-shell";
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

  const summary = await curationSummary(account.tenantId, undefined, account);

  return (
    <AdminShell
      curationCount={summary.awaiting + summary.held + summary.deferred}
      accountHeader={
        <AccountSwitcher accounts={await getUserMemberships(user.id)} selected={account.tenantId} />
      }
    >
      {children}
    </AdminShell>
  );
}
