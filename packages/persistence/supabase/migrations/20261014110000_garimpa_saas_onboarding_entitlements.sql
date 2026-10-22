-- M-12: Onboarding SaaS, Entitlements e Limites de Uso (EP-12 / C-08).
-- Autorizado apenas para revisão e testes locais em ambiente isolado. Proibida aplicação remota desautorizada.

alter type garimpa.app_role add value if not exists 'platform_admin';

-- Account ID and tenant must identify the same account, including for privileged writers.
alter table garimpa.affiliate_account
  add constraint affiliate_account_id_tenant_key unique (id, tenant_id);

create table if not exists garimpa.account_entitlement (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  affiliate_id text not null,
  plan_version text not null,
  status text not null check (status in ('pilot', 'active', 'suspended', 'ended')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  limits jsonb not null default '{}'::jsonb,
  terms_ref text not null,
  created_at timestamptz not null default now(),
  constraint account_entitlement_account_tenant_fkey foreign key (affiliate_id, tenant_id)
    references garimpa.affiliate_account(id, tenant_id) on delete cascade
);

create table if not exists garimpa.account_invitation (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  affiliate_id text not null,
  token_hash text not null unique,
  invited_email text not null,
  role text not null check (role in ('owner', 'operator')),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_app_user_id text,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint account_invitation_account_tenant_fkey foreign key (affiliate_id, tenant_id)
    references garimpa.affiliate_account(id, tenant_id) on delete cascade
);

create table if not exists garimpa.onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  affiliate_id text not null,
  step text not null,
  status text not null check (status in ('pending', 'in_progress', 'completed', 'skipped')),
  evidence_ref text,
  updated_at timestamptz not null default now(),
  constraint onboarding_progress_unique_step unique (affiliate_id, step),
  constraint onboarding_progress_account_tenant_fkey foreign key (affiliate_id, tenant_id)
    references garimpa.affiliate_account(id, tenant_id) on delete cascade
);

create table if not exists garimpa.usage_event (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  operation text not null,
  idempotency_key text not null,
  quantity integer not null default 1,
  occurred_at timestamptz not null default now(),
  constraint usage_event_unique_idempotency unique (tenant_id, operation, idempotency_key)
);

create table if not exists garimpa.account_lifecycle_event (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  affiliate_id text not null,
  event_type text not null,
  actor_app_user_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint account_lifecycle_event_account_tenant_fkey foreign key (affiliate_id, tenant_id)
    references garimpa.affiliate_account(id, tenant_id) on delete cascade
);

-- Grants
revoke all on
  garimpa.account_entitlement,
  garimpa.account_invitation,
  garimpa.onboarding_progress,
  garimpa.usage_event,
  garimpa.account_lifecycle_event
from public, anon, authenticated;

grant select, insert, update on
  garimpa.account_entitlement,
  garimpa.account_invitation,
  garimpa.onboarding_progress
to garimpa_app;

grant select, insert on
  garimpa.usage_event,
  garimpa.account_lifecycle_event
to garimpa_app;

-- Ativar RLS
alter table garimpa.account_entitlement enable row level security;
alter table garimpa.account_invitation enable row level security;
alter table garimpa.onboarding_progress enable row level security;
alter table garimpa.usage_event enable row level security;
alter table garimpa.account_lifecycle_event enable row level security;

-- Policies de isolamento multi-tenant
drop policy if exists account_invitation_tenant_isolation on garimpa.account_invitation;
drop policy if exists account_invitation_tenant_manage on garimpa.account_invitation;
drop policy if exists account_invitation_token_lookup on garimpa.account_invitation;
drop policy if exists account_invitation_token_claim on garimpa.account_invitation;
drop policy if exists account_invitation_platform_manage on garimpa.account_invitation;

-- CF-01: Sem tenant ativo ou platform_admin, convites não podem ser lidos ou alterados
create policy account_invitation_tenant_manage on garimpa.account_invitation
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy account_invitation_platform_manage on garimpa.account_invitation
  for all to garimpa_app
  using (nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role'))
  with check (nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role'));

-- Policies de isolamento multi-tenant para planos / entitlements
drop policy if exists account_entitlement_tenant_isolation on garimpa.account_entitlement;
drop policy if exists account_entitlement_tenant_read on garimpa.account_entitlement;
create policy account_entitlement_tenant_read on garimpa.account_entitlement
  for select to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

-- CF-01: Sem platform_admin, planos não podem ser criados ou alterados (removido bypass de membership_role null)
drop policy if exists account_entitlement_platform_manage on garimpa.account_entitlement;
create policy account_entitlement_platform_manage on garimpa.account_entitlement
  for all to garimpa_app
  using (nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role'))
  with check (nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role'));

drop policy if exists onboarding_progress_tenant_isolation on garimpa.onboarding_progress;
create policy onboarding_progress_tenant_isolation on garimpa.onboarding_progress
  for all to garimpa_app
  using (
    tenant_id = nullif(current_setting('garimpa.tenant_id', true), '')
    or nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role')
  )
  with check (
    tenant_id = nullif(current_setting('garimpa.tenant_id', true), '')
    or nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role')
  );

drop policy if exists usage_event_tenant_isolation on garimpa.usage_event;
drop policy if exists usage_event_tenant_read on garimpa.usage_event;
create policy usage_event_tenant_read on garimpa.usage_event
  for select to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

drop policy if exists usage_event_tenant_insert on garimpa.usage_event;
create policy usage_event_tenant_insert on garimpa.usage_event
  for insert to garimpa_app
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

drop policy if exists account_lifecycle_event_tenant_read on garimpa.account_lifecycle_event;
create policy account_lifecycle_event_tenant_read on garimpa.account_lifecycle_event
  for select to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

drop policy if exists account_lifecycle_event_platform_insert on garimpa.account_lifecycle_event;
create policy account_lifecycle_event_platform_insert on garimpa.account_lifecycle_event
  for insert to garimpa_app
  with check (
    tenant_id = nullif(current_setting('garimpa.tenant_id', true), '')
    or nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role')
  );

-- Permitir concessão de membership via convite verificado (com token de uso único) ou platform_admin
drop policy if exists affiliate_membership_claim_or_manage on garimpa.affiliate_membership;
create policy affiliate_membership_claim_or_manage on garimpa.affiliate_membership
  for all to garimpa_app
  using (
    nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role')
    or current_setting('garimpa.invitation_claim', true) = 'active'
  )
  with check (
    nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role')
    or current_setting('garimpa.invitation_claim', true) = 'active'
  );

-- Permitir concessão estrita de papel base 'afiliado' durante aceite de convite ou por platform_admin
drop policy if exists app_user_role_claim_or_platform on garimpa.app_user_role;
create policy app_user_role_claim_or_platform on garimpa.app_user_role
  for insert to garimpa_app
  with check (
    (current_setting('garimpa.invitation_claim', true) = 'active' and role = 'afiliado')
    or nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role')
  );

-- CF-13 / CF-14: Rotina segura (SECURITY DEFINER) para aceite atômico de convite de conta.
-- Valida identidade autenticada, email e token único; concede membership e role base 'afiliado'
-- sob isolamento estrito sem exigir permissões DML amplas para garimpa_app em app_user_role.
create or replace function garimpa.accept_account_invitation(
  p_token_hash text,
  p_actor_app_user_id text,
  p_auth_user_id text,
  p_verified_email text
)
returns table (
  accepted boolean,
  tenant_id text,
  affiliate_id text,
  role text
)
language plpgsql
security definer
set search_path = garimpa, pg_catalog, pg_temp
as $$
#variable_conflict use_column
declare
  v_invitation record;
  v_user_auth_id text;
begin
  if p_actor_app_user_id is null or p_auth_user_id is null or p_verified_email is null then
    raise exception 'unauthenticated_identity_required';
  end if;

  select auth_user_id into v_user_auth_id
  from garimpa.app_user
  where id = p_actor_app_user_id;

  if v_user_auth_id is null or v_user_auth_id <> p_auth_user_id then
    raise exception 'identity_mismatch_forbidden';
  end if;

  select * into v_invitation
  from garimpa.account_invitation
  where token_hash = p_token_hash
  for update;

  if v_invitation.id is null then
    raise exception 'invitation_not_found';
  end if;

  if v_invitation.used_at is not null then
    raise exception 'invitation_already_used_or_disputed';
  end if;

  if v_invitation.expires_at <= now() then
    raise exception 'invitation_invalid:INVITATION_EXPIRED';
  end if;

  -- Definer code must independently reject a mismatched or suspended account.
  perform 1 from garimpa.affiliate_account a
  where a.id = v_invitation.affiliate_id and a.tenant_id = v_invitation.tenant_id
    and a.status = 'active'
  for share;
  if not found then
    raise exception 'invitation_account_unavailable';
  end if;

  if lower(trim(v_invitation.invited_email)) <> lower(trim(p_verified_email)) then
    raise exception 'invitation_email_mismatch';
  end if;

  update garimpa.account_invitation
  set used_at = now(),
      used_by_app_user_id = p_actor_app_user_id
  where id = v_invitation.id;

  insert into garimpa.affiliate_membership (affiliate_id, app_user_id, role)
  values (v_invitation.affiliate_id, p_actor_app_user_id, v_invitation.role::text)
  on conflict (affiliate_id, app_user_id) do update
  set role = excluded.role, revoked_at = null;

  insert into garimpa.app_user_role (app_user_id, role)
  values (p_actor_app_user_id, 'afiliado'::garimpa.app_role)
  on conflict (app_user_id, role) do update
  set revoked_at = null;

  insert into garimpa.account_lifecycle_event (tenant_id, affiliate_id, event_type, actor_app_user_id, payload)
  values (
    v_invitation.tenant_id,
    v_invitation.affiliate_id,
    'invitation_accepted',
    p_actor_app_user_id,
    jsonb_build_object('role', v_invitation.role, 'invitation_id', v_invitation.id)
  );

  return query select true, v_invitation.tenant_id, v_invitation.affiliate_id, v_invitation.role;
end;
$$;

revoke all on function garimpa.accept_account_invitation(text, text, text, text) from public, anon, authenticated;
grant execute on function garimpa.accept_account_invitation(text, text, text, text) to garimpa_app;


-- Final relational/immutability audit of the installed commercial surface.
-- It changes no historical data. Every tenant remains owned by an account.
do $$ declare r record; begin
 for r in select c.table_name from information_schema.columns c join information_schema.tables t
  on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE'
  where c.table_schema='garimpa' and c.column_name='tenant_id' and c.table_name<>'affiliate_account' loop
  if not exists(select 1 from pg_constraint k where k.conrelid=format('garimpa.%I',r.table_name)::regclass and k.contype='f'
    and k.confrelid='garimpa.affiliate_account'::regclass
    and k.conkey=array[(select attnum from pg_attribute where attrelid=k.conrelid and attname='tenant_id')]::smallint[]) then
   execute format('alter table garimpa.%I add constraint %I foreign key(tenant_id) references garimpa.affiliate_account(tenant_id) on delete restrict',r.table_name,r.table_name||'_account_tenant_fk');
  end if;
  execute format('drop trigger if exists trg_prevent_tenant_mutation on garimpa.%I',r.table_name);
  execute format('create trigger trg_prevent_tenant_mutation before update on garimpa.%I for each row execute function garimpa.prevent_tenant_mutation()',r.table_name);
 end loop;
end $$;

-- Permitir que platform_admin gerencie e provisione affiliate_account
drop policy if exists affiliate_account_platform_manage on garimpa.affiliate_account;
create policy affiliate_account_platform_manage on garimpa.affiliate_account
  for all to garimpa_app
  using (nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role'))
  with check (nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role'));

-- A later migration must not re-enable access to a suspended account.
do $$ declare r record; begin
 for r in select t.table_name from information_schema.tables t
  where t.table_schema='garimpa' and t.table_type='BASE TABLE' and t.table_name not in ('affiliate_account', 'account_lifecycle_event')
   and exists(select 1 from information_schema.columns c where c.table_schema=t.table_schema and c.table_name=t.table_name and c.column_name='tenant_id')
 loop
  execute format('create policy %I on garimpa.%I as restrictive for all to garimpa_app using(garimpa.active_tenant(tenant_id) or nullif(current_setting(''garimpa.platform_role'', true), '''') in (''platform_admin'', ''service_role'')) with check(garimpa.active_tenant(tenant_id) or nullif(current_setting(''garimpa.platform_role'', true), '''') in (''platform_admin'', ''service_role''))',r.table_name||'_active_account',r.table_name);
 end loop;
end $$;
