import type { Sql } from "./commerce-db.ts";
import type { AccountContext } from "./tenant-db.ts";
import {
  type AccountEntitlement,
  validateEntitlementQuota,
} from "./saas-onboarding-contract.ts";

/**
 * DAL e Serviço de Entitlements e Consumo Atômico de Quotas (D04 / EP-12 / C-08).
 *
 * Garante que:
 * 1. Nenhuma operação comercial aconteça sem plano/configuração ativa e inequívoca.
 * 2. O consumo de quotas seja serializado com lock pessimista na transação.
 * 3. Replay idempotente não consuma quota duplicada.
 * 4. Falha na transação reverta atomicamente a reserva e o evento de uso.
 * 5. Clientes não possam adulterar contagens ou limites no banco via RLS.
 */

export async function resolveActiveEntitlement(
  tx: Sql,
  tenantId: string,
  now: Date = new Date()
): Promise<AccountEntitlement> {
  await tx`select pg_advisory_xact_lock(hashtextextended(${`${tenantId}:quota`}, 0))`;
  const rows = await tx<{
    id: string;
    tenant_id: string;
    affiliate_id: string;
    plan_version: string;
    status: "pilot" | "active" | "suspended" | "ended";
    starts_at: string;
    ends_at: string | null;
    limits: AccountEntitlement["limits"];
    terms_ref: string;
  }[]>`
    select id, tenant_id, affiliate_id, plan_version, status, starts_at::text, ends_at::text, limits, terms_ref
    from garimpa.account_entitlement
    where tenant_id = ${tenantId}
    order by created_at desc
  `;

  if (!rows || rows.length === 0) {
    throw new Error("entitlement_required:no_active_entitlement");
  }

  const applicable = rows.filter((r) => {
    if (r.status !== "pilot" && r.status !== "active") return false;
    const startsMs = new Date(r.starts_at).getTime();
    if (Number.isFinite(startsMs) && now.getTime() < startsMs) return false;
    if (r.ends_at) {
      const endsMs = new Date(r.ends_at).getTime();
      if (Number.isFinite(endsMs) && now.getTime() >= endsMs) return false;
    }
    return true;
  });

  if (applicable.length > 1) {
    throw new Error("ambiguous_entitlement:multiple_active_plans");
  }

  if (applicable.length === 1) {
    const row = applicable[0]!;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      affiliateId: row.affiliate_id,
      planVersion: row.plan_version,
      status: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      limits: row.limits ?? {},
      termsRef: row.terms_ref,
    };
  }

  // Se nenhum plano ativo/piloto for aplicável neste instante, derive o motivo exato
  const latest = rows[0]!;
  if (latest.status === "suspended") {
    throw new Error("account_suspended");
  }
  if (latest.status === "ended") {
    throw new Error("plan_expired");
  }
  if (latest.ends_at && new Date(latest.ends_at).getTime() <= now.getTime()) {
    throw new Error("plan_expired");
  }
  if (latest.starts_at && new Date(latest.starts_at).getTime() > now.getTime()) {
    throw new Error("plan_not_started");
  }

  throw new Error("entitlement_required:no_active_entitlement");
}

export async function reserveOperationQuota(
  tx: Sql,
  context: AccountContext,
  operation: "create_campaign" | "create_kit" | "use_marketplace",
  idempotencyKey: string,
  options?: {
    marketplace?: string;
    now?: Date;
  }
): Promise<{ entitlement: AccountEntitlement }> {
  const now = options?.now ?? new Date();
  const entitlement = await resolveActiveEntitlement(tx, context.tenantId, now);

  let currentActiveCampaigns = 0;
  let todayKitsCount = 0;

  if (operation === "create_campaign") {
    const [campRow] = await tx<{ count: number }[]>`
      select count(*)::int as count
      from garimpa.campaign
      where tenant_id = ${context.tenantId} and status <> 'archived'
    `;
    currentActiveCampaigns = campRow?.count ?? 0;
  } else if (operation === "create_kit") {
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    ).toISOString();
    const [kitRow] = await tx<{ count: number }[]>`
      select count(*)::int as count
      from garimpa.commercial_kit
      where tenant_id = ${context.tenantId} and created_at >= ${startOfDay}::timestamptz
    `;
    todayKitsCount = kitRow?.count ?? 0;
  }

  const check = validateEntitlementQuota({
    entitlement,
    operation,
    currentActiveCampaigns,
    todayKitsCount,
    marketplace: options?.marketplace,
    now,
  });

  if (!check.allowed) {
    throw new Error(`quota_exceeded:${check.reason}`);
  }

  // Registro atômico do evento de uso na mesma transação
  await tx`
    insert into garimpa.usage_event (tenant_id, operation, idempotency_key, quantity, occurred_at)
    values (${context.tenantId}, ${operation}, ${idempotencyKey}, 1, ${now.toISOString()})
    on conflict (tenant_id, operation, idempotency_key) do nothing
  `;

  return { entitlement };
}

export async function releaseOperationQuota(
  tx: Sql,
  context: AccountContext,
  operation: string,
  idempotencyKey: string
): Promise<void> {
  await tx`
    insert into garimpa.usage_event (tenant_id, operation, idempotency_key, quantity, occurred_at)
    values (${context.tenantId}, ${operation}, ${idempotencyKey}, -1, clock_timestamp())
    on conflict (tenant_id, operation, idempotency_key) do nothing
  `;
}
