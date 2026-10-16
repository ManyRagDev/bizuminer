import { cookies } from "next/headers";
import { getPageAuth, isAffiliate, resolveAccountContext } from "./auth.ts";
import { inAccountScope } from "./account-scope.ts";
import type { AccountContext } from "./account-context.ts";
import { roleAccess, resolveAppUserId } from "./auth.ts";

export async function pageAccount(
  requested?: string,
): Promise<AccountContext | null> {
  const user = await getPageAuth();
  if (!user || !(await isAffiliate(user))) return null;
  const selected = requested ?? (await cookies()).get("bm_account")?.value;
  return resolveAccountContext({
    authUserId: user.id,
    requestedAccount: selected,
  });
}

export async function accountOperation<T>(
  work: (context: AccountContext) => Promise<T>,
): Promise<T> {
  const account = await pageAccount();
  if (!account) throw new Error("forbidden");
  return inAccountScope(account, () => work(account));
}

export async function platformPageContext(): Promise<AccountContext | null> {
  const user = await getPageAuth();
  if (!user || !(await roleAccess(user.id, "platform_admin"))) return null;
  const id = await resolveAppUserId(user.id);
  if (!id) return null;
  // Platform commands revalidate auth identity and role, independent of an active customer membership.
  return {
    tenantId: "platform",
    affiliateId: "platform",
    actor: "human",
    actorAppUserId: id,
    authenticatedAuthUserId: user.id,
    membershipRole: null,
    requestId: crypto.randomUUID(),
  };
}
