import type { ReactNode } from "react";
import type { AccountContext } from "../../lib/account-context.ts";
import { getUserMemberships } from "../../lib/account-context.ts";
import { affiliateWorkspaceEnabled } from "../../lib/affiliate-workspace-db.ts";
import { curationSummary } from "../../lib/curation-db.ts";
import { readCurationAutomation } from "../../lib/curation-automation.ts";
import { AdminDraftProvider } from "../admin/draft-provider.tsx";
import AccountSwitcher from "../admin/account-switcher.tsx";
import AdminShell from "./admin-shell.tsx";

/** Both admin routes and /pauta use the same authorized account and navigation mode. */
export default async function AccountAdminShell({ account, userId, children }: {
  account: AccountContext;
  userId: string;
  children: ReactNode;
}) {
  const [workspace, accounts] = await Promise.all([
    affiliateWorkspaceEnabled(account),
    getUserMemberships(userId),
  ]);
  const summary = workspace ? { awaiting: 0, held: 0, deferred: 0 }
    : await curationSummary(account.tenantId, undefined, account).catch(()=>null);
  const automationRead = workspace ? {available:true,value:null} : await readCurationAutomation(account)
    .then(value=>({available:true,value})).catch(()=>({available:false,value:null}));
  const automation=automationRead.value;
  const counterAvailable=workspace||automationRead.available&&(!!automation||!!summary);
  return (
    <AdminDraftProvider key={userId} user={userId} account={account.tenantId} actor={account.actorAppUserId ?? ""}>
      <AdminShell workspace={workspace} tenantId={account.tenantId} curationStatusAvailable={counterAvailable}
        curationCount={automation?.exceptions ?? (summary ? summary.awaiting + summary.held + summary.deferred:0)}
        curationExecutionCount={automation?.uncertain ?? 0}
        accountHeader={<AccountSwitcher accounts={accounts} selected={account.tenantId} />}>
        {children}
      </AdminShell>
    </AdminDraftProvider>
  );
}
