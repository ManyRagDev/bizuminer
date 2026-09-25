-- Escolha de acompanhamento por conta e loja. O cron do GitHub continua global.
-- A aplicação e o worker usam a role garimpa_app; o schema garimpa não é
-- exposto à Data API. Novas contas começam desligadas (ausência de linha).
create table garimpa.affiliate_monitoring_policy (
  affiliate_id text not null references garimpa.affiliate_account (id) on delete restrict,
  marketplace text not null check (marketplace in ('shopee', 'aliexpress', 'mercadolivre')),
  enabled boolean not null default false,
  updated_by_auth_user_id text,
  updated_at timestamptz not null default now(),
  primary key (affiliate_id, marketplace)
);

create table garimpa.affiliate_monitoring_policy_event (
  id bigint generated always as identity primary key,
  affiliate_id text not null references garimpa.affiliate_account (id) on delete restrict,
  marketplace text not null check (marketplace in ('shopee', 'aliexpress', 'mercadolivre')),
  previous_enabled boolean not null,
  enabled boolean not null,
  changed_by_auth_user_id text not null,
  changed_at timestamptz not null default now()
);
create index affiliate_monitoring_policy_event_lookup_idx
  on garimpa.affiliate_monitoring_policy_event (affiliate_id, changed_at desc);

create table garimpa.affiliate_monitoring_skip (
  id bigint generated always as identity primary key,
  affiliate_id text not null references garimpa.affiliate_account (id) on delete restrict,
  marketplace text not null check (marketplace in ('shopee', 'aliexpress', 'mercadolivre')),
  github_run_id text not null,
  reason text not null check (reason in ('policy_disabled', 'account_suspended')),
  skipped_at timestamptz not null default now(),
  unique (affiliate_id, marketplace, github_run_id)
);
create index affiliate_monitoring_skip_run_idx
  on garimpa.affiliate_monitoring_skip (github_run_id);

-- Mantém a rotina da casa ativa na transição. O ML segue sem executor de cron.
insert into garimpa.affiliate_monitoring_policy (affiliate_id, marketplace, enabled)
values ('aff_local', 'shopee', true), ('aff_local', 'aliexpress', true),
       ('aff_local', 'mercadolivre', false);

grant select, insert, update on garimpa.affiliate_monitoring_policy to garimpa_app;
grant select, insert on garimpa.affiliate_monitoring_policy_event to garimpa_app;
grant usage, select on sequence garimpa.affiliate_monitoring_policy_event_id_seq to garimpa_app;
grant select, insert on garimpa.affiliate_monitoring_skip to garimpa_app;
grant usage, select on sequence garimpa.affiliate_monitoring_skip_id_seq to garimpa_app;
revoke all on garimpa.affiliate_monitoring_policy,
  garimpa.affiliate_monitoring_policy_event,
  garimpa.affiliate_monitoring_skip from anon, authenticated;

alter table garimpa.affiliate_monitoring_policy enable row level security;
alter table garimpa.affiliate_monitoring_policy_event enable row level security;
alter table garimpa.affiliate_monitoring_skip enable row level security;
create policy affiliate_monitoring_policy_app_access
  on garimpa.affiliate_monitoring_policy for all to garimpa_app
  using (true) with check (true);
create policy affiliate_monitoring_policy_event_app_access
  on garimpa.affiliate_monitoring_policy_event for all to garimpa_app
  using (true) with check (true);
create policy affiliate_monitoring_skip_app_access
  on garimpa.affiliate_monitoring_skip for all to garimpa_app
  using (true) with check (true);

comment on table garimpa.affiliate_monitoring_policy is
  'Escolha de cron por afiliado e marketplace; ausência de linha equivale a desligado.';
comment on table garimpa.affiliate_monitoring_policy_event is
  'Trilha imutável de alterações da escolha de cron.';
comment on table garimpa.affiliate_monitoring_skip is
  'Job agendado ignorado por escolha da conta; distinto de fila sem produtos elegíveis.';
