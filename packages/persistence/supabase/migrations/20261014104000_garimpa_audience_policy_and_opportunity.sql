-- M-03: Políticas de audiência, oportunidades comerciais e eventos de domínio (EP-03 / C-03).
--
-- Objetivos:
-- 1. Cria garimpa.audience_policy e garimpa.audience_policy_version para governança por público e canal.
-- 2. Adiciona policy_version_id opcional em garimpa.analysis_assessment com FK composta.
-- 3. Cria garimpa.domain_event append-only para auditoria e rastreabilidade transversal.
-- 4. Cria garimpa.opportunity com classificação de negócio (recommendable, good_buy, special, gold)
--    e máquina de estados (candidate, monitored, prioritized, held, archived).
-- 5. Aplica isolamento estrito de tenant via RLS.

-- 1. Políticas de audiência e versões ---------------------------------------
create table if not exists garimpa.audience_policy (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  name text not null,
  current_version text,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  created_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create table if not exists garimpa.audience_policy_version (
  id text primary key default gen_random_uuid()::text,
  policy_id text not null,
  tenant_id text not null,
  version text not null,
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (policy_id, version),
  foreign key (policy_id, tenant_id) references garimpa.audience_policy(id, tenant_id)
);

create index if not exists idx_audience_policy_tenant
  on garimpa.audience_policy (tenant_id, status);

create index if not exists idx_audience_policy_version_policy
  on garimpa.audience_policy_version (tenant_id, policy_id, version);

-- Atualiza analysis_assessment de M-02 com referência de política
alter table garimpa.analysis_assessment
  add column if not exists policy_version_id text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fk_analysis_assessment_policy') then
    alter table garimpa.analysis_assessment
      add constraint fk_analysis_assessment_policy
      foreign key (policy_version_id, tenant_id) references garimpa.audience_policy_version(id, tenant_id);
  end if;
end $$;

-- 2. Eventos de domínio (append-only) --------------------------------------
create table if not exists garimpa.domain_event (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  aggregate_type text not null,
  aggregate_id text not null,
  aggregate_version int not null check (aggregate_version > 0),
  event_type text not null,
  actor_ref text not null,
  request_id text not null,
  idempotency_key text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, aggregate_type, aggregate_id, idempotency_key)
);

create index if not exists idx_domain_event_lookup
  on garimpa.domain_event (tenant_id, aggregate_type, aggregate_id, created_at desc);

comment on table garimpa.domain_event is
  'Ledger imutável de eventos comerciais e operacionais (C-05 / C-03).';

-- 3. Oportunidade contextual e radar ---------------------------------------
create table if not exists garimpa.opportunity (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  product_id text not null,
  policy_version_id text not null,
  audience_key text not null,
  channel text not null,
  revision int not null default 1 check (revision > 0),
  state text not null check (state in ('candidate', 'monitored', 'prioritized', 'held', 'archived')),
  class text not null check (class in ('recommendable', 'good_buy', 'special', 'gold', 'unclassified')),
  assessment_ref text,
  price_evidence_snapshot jsonb not null check (jsonb_typeof(price_evidence_snapshot) = 'object'),
  reasons text[] not null default array[]::text[],
  unknowns text[] not null default array[]::text[],
  next_action text,
  valid_until timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  predecessor_id text,
  unique (id, tenant_id),
  foreign key (product_id, tenant_id) references garimpa.product(id, tenant_id),
  foreign key (policy_version_id, tenant_id) references garimpa.audience_policy_version(id, tenant_id)
);

create unique index if not exists idx_opportunity_active_scope
  on garimpa.opportunity (tenant_id, product_id, policy_version_id, audience_key, channel)
  where state <> 'archived';

create index if not exists idx_opportunity_tenant_state
  on garimpa.opportunity (tenant_id, state, class, updated_at desc);

comment on table garimpa.opportunity is
  'Oportunidade contextual segmentada por público e canal (EP-03 / C-03). Distinta do catálogo.';

-- 4. Permissões e RLS ------------------------------------------------------
revoke all on garimpa.audience_policy, garimpa.audience_policy_version, garimpa.domain_event, garimpa.opportunity from public, anon, authenticated;
grant select, insert, update on garimpa.audience_policy, garimpa.opportunity to garimpa_app;
grant select, insert on garimpa.audience_policy_version, garimpa.domain_event to garimpa_app;

alter table garimpa.audience_policy enable row level security;
alter table garimpa.audience_policy_version enable row level security;
alter table garimpa.domain_event enable row level security;
alter table garimpa.opportunity enable row level security;

create policy audience_policy_isolation on garimpa.audience_policy
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy audience_policy_version_isolation on garimpa.audience_policy_version
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy domain_event_isolation on garimpa.domain_event
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy opportunity_isolation on garimpa.opportunity
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));
