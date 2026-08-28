-- Fundação de afiliados (E1, 26/08/2026).
-- Cria a identidade de conta por afiliado SEM alterar o link público (isso é E3).
-- `app_user` continua sendo a pessoa (comprador/usuário); o afiliado nasce em
-- tabelas próprias. `tenant_id` passa a ter entidade-pai (affiliate_account),
-- mantendo as tabelas de negócio isoladas por tenant como sempre foram.
-- Aplicação remota: pendente de autorização do dono (não aplicada nesta sessão).

-- Guarda de bootstrap: antes de criar contas, garantir que todo tenant_id já
-- usado nas tabelas de negócio é "local" (a casa). Se houver tenant sem conta
-- correspondente, abortar em vez de criar uma fundação inconsistente (R1/R4).
do $$
declare
  stray text;
begin
  select tenant_id into stray
  from garimpa.product
  where tenant_id <> 'local'
  limit 1;

  if stray is not null then
    raise exception
      'tenant_id "%" existe sem affiliate_account correspondente; criar a conta antes desta migration', stray;
  end if;
end $$;

-- Conta de afiliado ------------------------------------------------------
create table garimpa.affiliate_account (
  id            text primary key,                 -- 'aff_local' para a casa; gen_random_uuid() para terceiros
  tenant_id     text not null unique,             -- chave de isolamento usada pelas tabelas de negócio
  public_slug   text not null unique,             -- 4-32 [a-z0-9-]; não contém credencial ML
  display_name  text not null,
  status        text not null default 'active' check (status in ('active', 'suspended')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (public_slug ~ '^[a-z0-9-]{4,32}$')
);

-- Bootstrap da casa ------------------------------------------------------
insert into garimpa.affiliate_account (id, tenant_id, public_slug, display_name, status)
values ('aff_local', 'local', 'bizuminer', 'BizuMiner (casa)', 'active')
on conflict (id) do nothing;

-- Quem administra a conta -------------------------------------------------
-- MVP só cria `owner`. `operator` fica previsto para depois, sem uso ainda.
create table garimpa.affiliate_membership (
  affiliate_id text not null references garimpa.affiliate_account (id) on delete restrict,
  app_user_id  text not null references garimpa.app_user (id) on delete restrict,
  role         text not null default 'owner' check (role in ('owner', 'operator')),
  created_at   timestamptz not null default now(),
  primary key (affiliate_id, app_user_id)
);
create index affiliate_membership_user_idx
  on garimpa.affiliate_membership (app_user_id, affiliate_id);

-- Credencial de marketplace por afiliado -----------------------------------
-- tracking_id/tool_id aparecem em URLs (não são senha como DATABASE_URL), mas
-- são configuração autoritativa do servidor: nunca aceitos do client e nunca
-- devolvidos em payload. A API expõe apenas `configured`/`status`/`validatedAt`.
create table garimpa.affiliate_marketplace_config (
  id            text primary key default gen_random_uuid()::text,
  affiliate_id  text not null references garimpa.affiliate_account (id) on delete restrict,
  marketplace   text not null,
  tracking_id   text not null,
  tool_id       text not null,
  status        text not null default 'active' check (status in ('active', 'invalid', 'suspended')),
  validated_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (affiliate_id, marketplace)
);

-- Privilégio do app (role garimpa_app) sobre as novas tabelas -------------
grant select, insert, update, delete
  on garimpa.affiliate_account, garimpa.affiliate_membership, garimpa.affiliate_marketplace_config
  to garimpa_app;

comment on table garimpa.affiliate_account is
  'Conta de afiliado; cada uma possui um tenant_id que isola seu catálogo.';
comment on table garimpa.affiliate_membership is
  'Vínculo de um app_user (pessoa) à conta de afiliado com papel (owner/operator).';
comment on table garimpa.affiliate_marketplace_config is
  'Credencial de atribuição (tracking_id/tool_id) por afiliado e marketplace. Nunca devolvida em payload.';
comment on column garimpa.affiliate_account.public_slug is
  'Slug público curto, sem credencial; entra no slug de publicação a partir de E3.';
