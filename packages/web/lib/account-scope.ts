import { AsyncLocalStorage } from "node:async_hooks";
import type { AccountContext } from "./account-context.ts";

// Scope belongs to this async request, never to a shared connection or a module variable.
const accounts = new AsyncLocalStorage<AccountContext>();
export const currentAccount = () => accounts.getStore();
export const scopedTenantId = () => currentAccount()?.tenantId ?? "local";
export function inAccountScope<T>(context: AccountContext, work: () => T): T {
  if (!context?.tenantId || !context.affiliateId)
    throw new Error("account_context_required");
  return accounts.run(context, work);
}

// Only the transaction object owns this proof. Neither the connection nor the
// request may reuse it for a later transaction (membership can be revoked).
const authorizedTransactions = new WeakMap<object, { identity: string; ready: Promise<void> }>();

export function releaseAccountTransaction(tx: object) {
  authorizedTransactions.delete(tx);
}

export async function authorizeAccountTransaction(
  tx: any,
  context: AccountContext,
) {
  const identity = JSON.stringify([context.tenantId, context.affiliateId, context.actor,
    context.authenticatedAuthUserId, context.actorAppUserId, context.membershipRole, context.requestId]);
  const previous = authorizedTransactions.get(tx);
  if (previous) {
    if (previous.identity !== identity) throw new Error("forbidden_account_scope");
    return previous.ready;
  }
  const ready = initializeAccountTransaction(tx, context);
  authorizedTransactions.set(tx, { identity, ready });
  // A failed proof also fixes the attempted identity until rollback/end. A
  // caller catching the rejection must not switch actors in this transaction.
  await ready;
}

async function initializeAccountTransaction(tx: any, context: AccountContext) {
  await tx`select
    set_config('garimpa.tenant_id', ${context.tenantId}, true),
    set_config('garimpa.actor_type', ${context.actor}, true),
    set_config('garimpa.actor_app_user_id', ${context.actorAppUserId ?? ""}, true),
    set_config('garimpa.membership_role', ${context.membershipRole ?? ""}, true),
    set_config('garimpa.platform_role', '', true),
    set_config('garimpa.request_id', ${context.requestId}, true)`;
  if (context.actor === "human") {
    if (!context.authenticatedAuthUserId || !context.actorAppUserId)
      throw new Error("forbidden");
    const [ready] =
      await tx`select to_regprocedure('garimpa.resolve_actor_accounts(text)') is not null as ready`;
    let rows;
    if (ready?.ready)
      rows =
        await tx`select affiliate_id from garimpa.resolve_actor_accounts(${context.authenticatedAuthUserId})
      where affiliate_id=${context.affiliateId} and tenant_id=${context.tenantId}
        and app_user_id=${context.actorAppUserId} and membership_role=${context.membershipRole} and app_role='afiliado'`;
    else {
      const [columns] =
        await tx`select exists(select 1 from information_schema.columns where table_schema='garimpa' and table_name='affiliate_membership' and column_name='revoked_at') as revocation`;
      rows =
        await tx`select a.id from garimpa.affiliate_account a join garimpa.affiliate_membership m on m.affiliate_id=a.id join garimpa.app_user u on u.id=m.app_user_id join garimpa.app_user_role r on r.app_user_id=u.id and r.role='afiliado' and r.revoked_at is null where a.id=${context.affiliateId} and a.tenant_id=${context.tenantId} and a.status='active' and u.id=${context.actorAppUserId} and u.auth_user_id=${context.authenticatedAuthUserId} and m.role=${context.membershipRole} and ${tx.unsafe(columns?.revocation ? "m.revoked_at is null" : "true")}`;
    }
    if (!rows.length) throw new Error("forbidden");
  }
}
