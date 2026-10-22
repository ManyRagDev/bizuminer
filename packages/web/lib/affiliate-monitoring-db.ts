import { currentAccount, scopedTenantId } from "./account-scope.ts";
import "server-only";
import { db } from "./db";
import { withTenantDb } from "./tenant-db.ts";

export type MonitoringMarketplace = "shopee" | "aliexpress" | "mercadolivre";
export interface MonitoringPolicyView {
  marketplace: MonitoringMarketplace;
  enabled: boolean;
  updatedAt: string | null;
}

export interface MonitoringPolicyEventView {
  id: number;
  marketplace: MonitoringMarketplace;
  enabled: boolean;
  changedAt: string;
}

export async function houseMonitoringPolicies(
  tenantId = scopedTenantId(),
  sqlFactory: typeof db = db,
): Promise<MonitoringPolicyView[]> {
  return await withTenantDb(tenantId, async (sql) => {
    const rows = await sql<{ marketplace: MonitoringMarketplace; enabled: boolean; updated_at: Date | null }[]>`
      select stores.marketplace, coalesce(policy.enabled, false) as enabled, policy.updated_at
      from (values ('shopee'), ('aliexpress'), ('mercadolivre')) as stores(marketplace)
      left join garimpa.affiliate_monitoring_policy policy
        on policy.affiliate_id = ${currentAccount()?.affiliateId ?? "aff_local"} and policy.marketplace = stores.marketplace
      order by stores.marketplace
    `;
    return rows.map((row) => ({ marketplace: row.marketplace, enabled: row.enabled,
      updatedAt: row.updated_at ? row.updated_at.toISOString() : null }));
  }, sqlFactory);
}

export async function houseMonitoringPolicyEvents(
  tenantId = scopedTenantId(),
  sqlFactory: typeof db = db,
): Promise<MonitoringPolicyEventView[]> {
  return await withTenantDb(tenantId, async (sql) => {
    const rows = await sql<{ id: number; marketplace: MonitoringMarketplace; enabled: boolean; changed_at: Date }[]>`
      select id, marketplace, enabled, changed_at
      from garimpa.affiliate_monitoring_policy_event
      where affiliate_id = ${currentAccount()?.affiliateId ?? "aff_local"}
      order by changed_at desc, id desc
      limit 10
    `;
    return rows.map((row) => ({ id: Number(row.id), marketplace: row.marketplace,
      enabled: row.enabled, changedAt: row.changed_at.toISOString() }));
  }, sqlFactory);
}

export async function setHouseMonitoringPolicy(
  marketplace: "shopee" | "aliexpress",
  enabled: boolean,
  authUserId: string,
  tenantId = scopedTenantId(),
  sqlFactory: typeof db = db,
): Promise<MonitoringPolicyView> {
  return await withTenantDb(tenantId, async (tx) => {
    const [current] = await tx<{ enabled: boolean }[]>`
      select policy.enabled
      from garimpa.affiliate_monitoring_policy policy
      join garimpa.affiliate_account account on account.id = policy.affiliate_id
      where policy.affiliate_id = ${currentAccount()?.affiliateId ?? "aff_local"} and policy.marketplace = ${marketplace}
        and account.status = 'active' and account.tenant_id = ${tenantId}
      for update of policy
    `;
    if (!current) throw new Error("monitoring_policy_missing");
    if (current.enabled !== enabled) {
      await tx`
        update garimpa.affiliate_monitoring_policy
        set enabled = ${enabled}, updated_at = now(), updated_by_auth_user_id = ${authUserId}
        where affiliate_id = ${currentAccount()?.affiliateId ?? "aff_local"} and marketplace = ${marketplace}
      `;
      await tx`
        insert into garimpa.affiliate_monitoring_policy_event
          (affiliate_id, marketplace, previous_enabled, enabled, changed_by_auth_user_id)
        values (${currentAccount()?.affiliateId ?? "aff_local"}, ${marketplace}, ${current.enabled}, ${enabled}, ${authUserId})
      `;
    }
    const [row] = await tx<{ marketplace: MonitoringMarketplace; enabled: boolean; updated_at: Date }[]>`
      select marketplace, enabled, updated_at
      from garimpa.affiliate_monitoring_policy
      where affiliate_id = ${currentAccount()?.affiliateId ?? "aff_local"} and marketplace = ${marketplace}
    `;
    return { marketplace: row!.marketplace, enabled: row!.enabled,
      updatedAt: row!.updated_at.toISOString() };
  }, sqlFactory);
}
