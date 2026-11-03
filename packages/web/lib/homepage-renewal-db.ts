import { db } from "./db.ts";
import { currentAccount, scopedTenantId } from "./account-scope.ts";
import { withAccountDb } from "./tenant-db.ts";
import type { HomepageRenewalState, HomepageRenewalOutcome } from "./homepage-renewal.ts";

export async function homepageRenewalSchemaReady(sql: Pick<ReturnType<typeof db>, "unsafe">) {
  const [row] = await sql.unsafe<{ ready: boolean }[]>("select to_regclass('garimpa.homepage_renewal') is not null as ready");
  return row?.ready === true;
}

export async function getHomepageRenewalState(tenantId = scopedTenantId(), sqlFactory: typeof db = db): Promise<HomepageRenewalState> {
  if (currentAccount() && currentAccount()!.tenantId !== tenantId) throw new Error("forbidden_account_scope");
  const empty: HomepageRenewalState = { schemaReady: false, enabled: false, lastAttemptAt: null, outcome: "not_started", renewedAt: null, renewAfter: null };
  if (!process.env.DATABASE_URL) return empty;
  const sql = sqlFactory();
  try {
    if (!await homepageRenewalSchemaReady(sql)) return empty;
    return await sql.begin(async tx => {
      await tx`select set_config('garimpa.tenant_id',${tenantId},true)`;
      const [row] = await tx<{ enabled: boolean; last_attempt_at: Date | null; outcome: HomepageRenewalOutcome; renewed_at: Date | null; renew_after: Date | null }[]>`
        select coalesce(r.enabled,h.tenant_id is not null) as enabled,coalesce(r.last_attempt_at,h.refreshed_at) as last_attempt_at,
          coalesce(r.outcome,case when h.source_selection_id is not null then 'manual_edition' when h.tenant_id is not null then 'unchanged' else 'not_started' end) as outcome,h.renewed_at,h.renew_after
        from (select ${tenantId}::text as tenant_id) t
        left join garimpa.homepage_renewal r using(tenant_id) left join garimpa.homepage_edition h using(tenant_id)`;
      const iso = (value: Date | null) => value ? new Date(value).toISOString() : null;
      return { schemaReady: true, enabled: row.enabled, lastAttemptAt: iso(row.last_attempt_at), outcome: row.outcome,
        renewedAt: iso(row.renewed_at), renewAfter: iso(row.renew_after) };
    });
  } finally { await sql.end(); }
}

/** Explicit account opt-in survives an empty pool; the next qualified capture or
 * review can initialize without an operator having to discover a CLI flag. */
export async function enableHomepageRenewal() {
  const account = currentAccount();
  if (!account || account.actor !== "human" || account.membershipRole !== "owner") return { ok: false as const, error: "forbidden" };
  return withAccountDb(account, async tx => {
    if (!await homepageRenewalSchemaReady(tx)) return { ok: false as const, error: "migration_required" };
    await tx`insert into garimpa.homepage_renewal(tenant_id,enabled) values(${account.tenantId},true)
      on conflict(tenant_id) do update set enabled=true`;
    return { ok: true as const };
  });
}

export async function recordHomepageRenewalFailure(tenantId: string, sqlFactory: typeof db = db) {
  if (currentAccount() && currentAccount()!.tenantId !== tenantId) throw new Error("forbidden_account_scope");
  const sql = sqlFactory();
  try {
    if (!await homepageRenewalSchemaReady(sql)) return;
    await sql.begin(async tx => {
      await tx`select set_config('garimpa.tenant_id',${tenantId},true)`;
      if (!currentAccount()) await tx`select set_config('garimpa.actor_type','worker',true)`;
      await tx`update garimpa.homepage_renewal set last_attempt_at=now(),outcome='failed' where tenant_id=${tenantId} and enabled`;
    });
  } finally { await sql.end(); }
}
