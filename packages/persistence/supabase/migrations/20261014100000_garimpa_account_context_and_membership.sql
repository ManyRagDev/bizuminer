-- M-10A1: Evolução estrutural de contexto de conta, membership e autoria transversal (EP-10A)
-- Planejamento BizuMiner V2: C-01 e C-09.

-- 1. affiliate_membership: adicionar revoked_at para permitir revogação sem apagar histórico
alter table garimpa.affiliate_membership
  add column if not exists revoked_at timestamptz default null;

-- Índice para consultas rápidas de memberships ativas por app_user
create index if not exists affiliate_membership_active_idx
  on garimpa.affiliate_membership (app_user_id, affiliate_id)
  where revoked_at is null;

-- 2. affiliate_secret: credenciais e segredos isolados por conta e marketplace (C-01)
create table if not exists garimpa.affiliate_secret (
  id           text primary key default gen_random_uuid()::text,
  tenant_id    text not null references garimpa.affiliate_account (tenant_id) on delete restrict,
  marketplace  text not null,
  secret_id    text not null,
  key_version  text not null,
  ciphertext   text not null,
  nonce        text not null,
  tag          text not null,
  status       text not null default 'active' check (status in ('active', 'revoked', 'rotated')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, marketplace, secret_id)
);

create index if not exists affiliate_secret_lookup_idx
  on garimpa.affiliate_secret (tenant_id, marketplace, status);

grant select, insert, update, delete
  on garimpa.affiliate_secret
  to garimpa_app;

-- 3. curation_event: registrar autoria transversal de membership sem exigir tenant_id do app_user = tenant_id do evento
alter table garimpa.curation_event
  add column if not exists actor_membership_app_user_id text references garimpa.app_user (id),
  add column if not exists actor_membership_affiliate_id text references garimpa.affiliate_account (id);

-- 4. Função segura resolve_actor_accounts (C-01)
-- SECURITY DEFINER para evitar recursão de RLS e garantir busca confiável de contas autorizadas.
create or replace function garimpa.resolve_actor_accounts(p_auth_user_id text)
returns table (
  affiliate_id text,
  tenant_id text,
  public_slug text,
  display_name text,
  account_status text,
  membership_role text,
  app_user_id text,
  app_role text
)
language sql
security definer
set search_path = garimpa, pg_temp
as $$
  select
    a.id as affiliate_id,
    a.tenant_id,
    a.public_slug,
    a.display_name,
    a.status as account_status,
    m.role as membership_role,
    u.id as app_user_id,
    coalesce(r.role::text, 'comprador') as app_role
  from garimpa.app_user u
  join garimpa.affiliate_membership m on m.app_user_id = u.id and m.revoked_at is null
  join garimpa.affiliate_account a on a.id = m.affiliate_id and a.status = 'active'
  left join garimpa.app_user_role r on r.app_user_id = u.id and r.revoked_at is null and r.role = 'afiliado'
  where u.auth_user_id = p_auth_user_id
  order by (a.id = 'aff_local') desc, a.created_at asc;
$$;

revoke all on function garimpa.resolve_actor_accounts(text) from public, anon, authenticated;
grant execute on function garimpa.resolve_actor_accounts(text) to garimpa_app;

comment on table garimpa.affiliate_secret is
  'Credenciais de API e tokens cifrados por conta e marketplace (AES-256-GCM).';
comment on function garimpa.resolve_actor_accounts(text) is
  'Resolve contas ativas e memberships de uma pessoa autenticada pelo auth_user_id.';

-- Identity bootstrap remains separate from the selected commercial account.
create or replace function garimpa.resolve_actor_identity(p_auth_user_id text)
returns table(id text,tenant_id text,roles text[])
language sql stable security definer set search_path=pg_catalog,garimpa
as $$
  select u.id,u.tenant_id,coalesce(array_agg(r.role::text) filter(where r.revoked_at is null and r.role is not null),array[]::text[])
  from garimpa.app_user u left join garimpa.app_user_role r on r.app_user_id=u.id
  where u.auth_user_id=p_auth_user_id group by u.id,u.tenant_id;
$$;
revoke all on function garimpa.resolve_actor_identity(text) from public,anon,authenticated;
grant execute on function garimpa.resolve_actor_identity(text) to garimpa_app;

-- A person can operate another account without changing their personal home.
alter table garimpa.curation_event drop constraint if exists curation_event_actor_tenant_fkey;
alter table garimpa.curation_event add constraint curation_event_actor_user_fkey
  foreign key(actor_app_user_id) references garimpa.app_user(id) on delete restrict;
alter table garimpa.curation_event add constraint curation_event_actor_membership_fkey
  foreign key(actor_membership_affiliate_id,actor_membership_app_user_id)
  references garimpa.affiliate_membership(affiliate_id,app_user_id) on delete restrict;
alter table garimpa.editorial_assessment drop constraint if exists editorial_assessment_actor_app_user_id_tenant_id_fkey;
alter table garimpa.editorial_assessment add constraint editorial_assessment_actor_user_fkey
  foreign key(actor_app_user_id) references garimpa.app_user(id) on delete restrict;

-- Extension device bootstrap without broad policy (EP-10A / E4)
create or replace function garimpa.authenticate_extension_device(p_token_hash text)
returns table (
  device_id text,
  app_user_id text,
  affiliate_id text,
  tenant_id text,
  public_slug text,
  display_name text,
  revoked_at text,
  account_status text,
  role_active boolean
)
language sql stable security definer set search_path=pg_catalog,garimpa
as $$
  select d.id as device_id, d.created_by_app_user_id as app_user_id, a.id as affiliate_id, a.tenant_id, a.public_slug, a.display_name,
         d.revoked_at::text, a.status as account_status,
         exists (
           select 1
           from garimpa.app_user_role aur
           join garimpa.affiliate_membership am
             on am.app_user_id = aur.app_user_id
            and am.affiliate_id = d.affiliate_id
           where aur.app_user_id = d.created_by_app_user_id
             and aur.role = 'afiliado'::garimpa.app_role
             and aur.revoked_at is null
             and am.revoked_at is null
         ) as role_active
  from garimpa.extension_device d
  join garimpa.affiliate_account a on a.id = d.affiliate_id
  where d.token_hash = p_token_hash
  limit 1;
$$;
revoke all on function garimpa.authenticate_extension_device(text) from public,anon,authenticated;
grant execute on function garimpa.authenticate_extension_device(text) to garimpa_app;

