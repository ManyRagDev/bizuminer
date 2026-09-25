import type { Sql } from "postgres";
import type { MonitorMarketplace } from "./monitoring-policy.ts";

export interface ScheduleDecision {
  allowed: boolean;
  affiliateId: string | null;
  reason: "policy_disabled" | "account_suspended" | null;
}

/** Manual é uma decisão explícita separada; política controla apenas schedule. */
export function scheduleAllowed(event: string | undefined, enabled: boolean): boolean {
  return event !== "schedule" || enabled;
}

export async function monitoringScheduleDecision(
  sql: Sql, tenantId: string, marketplace: MonitorMarketplace,
  event: string | undefined,
): Promise<ScheduleDecision> {
  let rows: Array<{ affiliate_id: string; account_status: string; enabled: boolean | null }>;
  try {
    rows = await sql<{ affiliate_id: string; account_status: string; enabled: boolean | null }[]>`
      select account.id as affiliate_id, account.status as account_status, policy.enabled
      from garimpa.affiliate_account account
      left join garimpa.affiliate_monitoring_policy policy
        on policy.affiliate_id = account.id and policy.marketplace = ${marketplace}
      where account.tenant_id = ${tenantId}
      limit 1
    `;
  } catch (error) {
    // Compatibilidade durante a implantação: o cron da casa mantém a rotina
    // existente até a migration entrar. Outras contas nunca herdam esse padrão.
    if (tenantId === "local" && (error as { code?: string }).code === "42P01") {
      return { allowed: true, affiliateId: "aff_local", reason: null };
    }
    throw error;
  }
  const account = rows[0];
  if (!account) return { allowed: false, affiliateId: null, reason: "policy_disabled" };
  if (account.account_status !== "active") {
    return { allowed: false, affiliateId: account.affiliate_id, reason: "account_suspended" };
  }
  return {
    allowed: scheduleAllowed(event, account.enabled === true),
    affiliateId: account.affiliate_id,
    reason: scheduleAllowed(event, account.enabled === true) ? null : "policy_disabled",
  };
}

export async function recordMonitoringSkip(
  sql: Sql, affiliateId: string, marketplace: MonitorMarketplace,
  githubRunId: string, reason: "policy_disabled" | "account_suspended",
): Promise<void> {
  await sql`
    insert into garimpa.affiliate_monitoring_skip
      (affiliate_id, marketplace, github_run_id, reason)
    values (${affiliateId}, ${marketplace}, ${githubRunId}, ${reason})
    on conflict (affiliate_id, marketplace, github_run_id) do nothing
  `;
}
