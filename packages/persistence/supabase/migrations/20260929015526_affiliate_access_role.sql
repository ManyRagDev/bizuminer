-- Separa a conta pessoal (todo usuário autenticado) do ambiente operacional.
-- Somente app_users com a role `afiliado` ativa podem acessar painel, rodagens
-- e mecanismos de captura. A aplicação consulta esta tabela no servidor; a
-- role não vem de user_metadata nem de parâmetro enviado pelo cliente.

create type garimpa.app_role as enum ('afiliado');

create table garimpa.app_user_role (
  app_user_id              text not null
                           references garimpa.app_user (id) on delete cascade,
  role                     garimpa.app_role not null,
  granted_at               timestamptz not null default now(),
  granted_by_auth_user_id  text,
  revoked_at               timestamptz,
  primary key (app_user_id, role),
  check (revoked_at is null or revoked_at >= granted_at)
);

comment on table garimpa.app_user_role is
  'Roles privilegiadas da aplicação. Ausência de linha ativa significa apenas acesso à área pessoal.';
comment on column garimpa.app_user_role.granted_by_auth_user_id is
  'UUID do auth.users que concedeu a role; texto para evitar acoplamento/FK ao schema auth.';

-- Transição segura: quem já era membro de uma conta de afiliado recebe a
-- role. Novos cadastros livres não ganham role automaticamente.
insert into garimpa.app_user_role (app_user_id, role)
select distinct membership.app_user_id, 'afiliado'::garimpa.app_role
from garimpa.affiliate_membership membership
on conflict (app_user_id, role) do nothing;

-- O schema garimpa não é exposto ao Data API. Ainda assim, aplica RLS como
-- defesa em profundidade e deixa o runtime somente com leitura desta tabela:
-- concessão/revogação de role é uma operação administrativa de banco.
alter table garimpa.app_user_role enable row level security;
alter table garimpa.app_user_role force row level security;

revoke all on garimpa.app_user_role from public, anon, authenticated, garimpa_app;
grant select on garimpa.app_user_role to garimpa_app;

create policy app_user_role_runtime_read
  on garimpa.app_user_role
  for select
  to garimpa_app
  using (true);

-- Evita que grants padrão futuros ampliem esta tabela sensível por acidente.
revoke insert, update, delete, truncate, references, trigger
  on garimpa.app_user_role
  from garimpa_app;
