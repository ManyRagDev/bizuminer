import type { Sql } from 'postgres';

/** These are operator-run bootstrap/configuration commands, never a runtime worker.
 * Caller must explicitly supply a dedicated administrative connection. No grants,
 * SET ROLE or forged owner/platform context are used to obtain privileges. */
export async function withHouseMaintenance<T>(sql: Sql, work: (tx: Sql) => Promise<T>): Promise<T> {
  return await sql.begin(async raw => {
    const tx = raw as unknown as Sql;
    await tx`set local lock_timeout='5s'`;
    await tx`set local statement_timeout='30s'`;
    const [role] = await tx<{name:string; privileged:boolean}[]>`
      select current_user::text as name,(rolsuper or rolbypassrls) as privileged from pg_roles where rolname=current_user`;
    if (!role?.privileged || role.name === 'garimpa_app' || role.name === 'garimpa_public_runtime')
      throw new Error('dedicated_administrative_connection_required');
    const [house] = await tx`select id from garimpa.affiliate_account where id='aff_local' and tenant_id='local' and status='active' for update`;
    if (!house) throw new Error('house_account_unavailable');
    return work(tx);
  }) as unknown as T;
}

export async function bootstrapHouse(sql: Sql, email: string, apply = false) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length>254) throw new Error('explicit_admin_email_required');
  return withHouseMaintenance(sql, async tx => {
    const users = await tx<{id:string;auth_user_id:string|null}[]>`
      select id,auth_user_id from garimpa.app_user where lower(email)=${normalized} order by id limit 2 for update`;
    if (users.length!==1 || !users[0]?.auth_user_id) throw new Error('unique_authenticated_admin_required');
    const owner = users[0];
    const roles = await tx`select app_user_id from garimpa.app_user_role where app_user_id=${owner.id} and role='afiliado' and revoked_at is null`;
    if (!roles.length) throw new Error('active_affiliate_role_required');
    const [membership] = await tx<{role:string;revoked_at:Date|null}[]>`
      select role,revoked_at from garimpa.affiliate_membership where affiliate_id='aff_local' and app_user_id=${owner.id} for update`;
    if (membership && (membership.role!=='owner' || membership.revoked_at!==null)) throw new Error('existing_membership_requires_explicit_review');
    if (apply && !membership) await tx`
      insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_local',${owner.id},'owner')`;
    return {mode:apply?'apply':'dry-run',accountId:'aff_local',membership:membership?'existing_owner':apply?'created_owner':'would_create_owner'};
  });
}

export async function seedHouseConfig(sql: Sql, trackingId: string, toolId: string, apply = false) {
  if (!trackingId.trim() || !toolId.trim()) throw new Error('marketplace_configuration_required');
  return withHouseMaintenance(sql, async tx => {
    if (!apply) return {mode:'dry-run',accountId:'aff_local',marketplace:'mercadolivre',configuration:'would_set_unvalidated'};
    const [config] = await tx<{status:string;validated_at:Date|null}[]>`
      insert into garimpa.affiliate_marketplace_config(affiliate_id,marketplace,tracking_id,tool_id,status)
      values('aff_local','mercadolivre',${trackingId},${toolId},'active')
      on conflict(affiliate_id,marketplace) do update set tracking_id=excluded.tracking_id,tool_id=excluded.tool_id,
        status='active',validated_at=null,updated_at=now() returning status,validated_at`;
    return {mode:'apply',accountId:'aff_local',marketplace:'mercadolivre',status:config!.status,validatedAt:config!.validated_at};
  });
}
