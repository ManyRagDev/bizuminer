-- M-08: Ledger Financeiro Comercial, Conversões, Comissões e Receita SaaS (EP-08 / C-07).
-- Autorizado apenas para revisão e testes locais em ambiente isolado. Proibida aplicação remota desautorizada.

create table if not exists garimpa.conversion (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  marketplace text not null,
  external_order_id text,
  external_item_id text,
  occurred_at timestamptz not null,
  order_value_cents bigint,
  currency text not null default 'BRL',
  source text not null check (source in ('manual', 'report', 'api')),
  evidence_ref text,
  verification text not null check (verification in ('declared', 'documented', 'provider_confirmed')),
  status text not null check (status in ('reported', 'pending', 'confirmed', 'cancelled', 'refunded')),
  version integer not null default 1,
  request_id text,
  created_at timestamptz not null default now(),
  constraint conversion_tenant_request_unique unique (tenant_id, request_id)
);

create table if not exists garimpa.conversion_attribution (
  conversion_id uuid not null references garimpa.conversion(id) on delete cascade,
  tenant_id text not null,
  campaign_publication_id text,
  method text not null check (method in ('unknown', 'manual_evidence', 'provider_subid')),
  confidence text not null check (confidence in ('unknown', 'supported', 'confirmed')),
  evidence_ref text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  primary key (conversion_id, tenant_id),
  foreign key (campaign_publication_id, tenant_id) references garimpa.campaign_publication(id, tenant_id) on delete set null
);

create table if not exists garimpa.commission_entry (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  conversion_id uuid references garimpa.conversion(id) on delete set null,
  source_key text not null,
  amount_cents bigint not null,
  currency text not null default 'BRL',
  state text not null check (state in ('estimated', 'pending', 'confirmed', 'reversed', 'received')),
  occurred_at timestamptz not null,
  source_ref text not null,
  predecessor_id uuid references garimpa.commission_entry(id),
  created_at timestamptz not null default now(),
  constraint commission_tenant_source_key_unique unique (tenant_id, source_key)
);

create table if not exists garimpa.operational_cost (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  kind text not null check (kind in ('infrastructure', 'ai', 'messaging', 'creative', 'human_time')),
  amount_cents bigint,
  currency text default 'BRL',
  duration_seconds integer,
  source text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  verification text not null,
  created_at timestamptz not null default now()
);

create table if not exists garimpa.saas_revenue_entry (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  obligation_key text not null,
  event_key text not null,
  contract_ref text not null,
  amount_cents bigint not null,
  currency text not null default 'BRL',
  state text not null check (state in ('billed', 'received', 'reversed')),
  occurred_at timestamptz not null,
  source_ref text not null,
  predecessor_id uuid references garimpa.saas_revenue_entry(id),
  created_at timestamptz not null default now(),
  constraint saas_revenue_tenant_event_key_unique unique (tenant_id, event_key)
);

create table if not exists garimpa.import_batch (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  marketplace text not null,
  file_digest text not null,
  parser_version text not null,
  status text not null check (status in ('preview', 'committed', 'failed')),
  counts jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint import_batch_unique_digest unique (tenant_id, marketplace, file_digest, parser_version)
);

create table if not exists garimpa.import_row (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references garimpa.import_batch(id) on delete cascade,
  tenant_id text not null,
  row_number integer not null,
  provider_key text,
  row_digest text not null,
  normalized jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  decision text not null check (decision in ('imported', 'review_required', 'rejected', 'duplicate')),
  created_at timestamptz not null default now()
);

-- Grants
revoke all on
  garimpa.conversion,
  garimpa.conversion_attribution,
  garimpa.commission_entry,
  garimpa.operational_cost,
  garimpa.saas_revenue_entry,
  garimpa.import_batch,
  garimpa.import_row
from public, anon, authenticated;

grant select, insert, update on
  garimpa.conversion,
  garimpa.conversion_attribution,
  garimpa.commission_entry,
  garimpa.operational_cost,
  garimpa.saas_revenue_entry,
  garimpa.import_batch,
  garimpa.import_row
to garimpa_app;

-- Ativar RLS em todas as tabelas
alter table garimpa.conversion enable row level security;
alter table garimpa.conversion_attribution enable row level security;
alter table garimpa.commission_entry enable row level security;
alter table garimpa.operational_cost enable row level security;
alter table garimpa.saas_revenue_entry enable row level security;
alter table garimpa.import_batch enable row level security;
alter table garimpa.import_row enable row level security;

-- Policies de isolamento multi-tenant
drop policy if exists conversion_tenant_isolation on garimpa.conversion;
create policy conversion_tenant_isolation on garimpa.conversion
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

drop policy if exists conversion_attribution_tenant_isolation on garimpa.conversion_attribution;
create policy conversion_attribution_tenant_isolation on garimpa.conversion_attribution
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

drop policy if exists commission_entry_tenant_isolation on garimpa.commission_entry;
create policy commission_entry_tenant_isolation on garimpa.commission_entry
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

drop policy if exists operational_cost_tenant_isolation on garimpa.operational_cost;
create policy operational_cost_tenant_isolation on garimpa.operational_cost
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

drop policy if exists saas_revenue_entry_tenant_isolation on garimpa.saas_revenue_entry;
create policy saas_revenue_entry_tenant_isolation on garimpa.saas_revenue_entry
  for all to garimpa_app
  using (
    tenant_id = nullif(current_setting('garimpa.tenant_id', true), '')
    and (nullif(current_setting('app.is_platform_operator', true), '') = 'true' or nullif(current_setting('garimpa.tenant_id', true), '') in ('local', 'house'))
  )
  with check (
    tenant_id = nullif(current_setting('garimpa.tenant_id', true), '')
    and (nullif(current_setting('app.is_platform_operator', true), '') = 'true' or nullif(current_setting('garimpa.tenant_id', true), '') in ('local', 'house'))
  );

drop policy if exists import_batch_tenant_isolation on garimpa.import_batch;
create policy import_batch_tenant_isolation on garimpa.import_batch
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

drop policy if exists import_row_tenant_isolation on garimpa.import_row;
create policy import_row_tenant_isolation on garimpa.import_row
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

-- Idempotency includes the payload, not merely the key.
alter table garimpa.conversion add column if not exists input_digest text;
alter table garimpa.commission_entry add column if not exists input_digest text;
alter table garimpa.saas_revenue_entry add column if not exists input_digest text;
-- Historical facts cannot be rewritten or deleted by the runtime role.
revoke update,delete on garimpa.commission_entry,garimpa.saas_revenue_entry from garimpa_app;
alter table garimpa.commission_entry add unique(id,tenant_id);
alter table garimpa.saas_revenue_entry add unique(id,tenant_id);
alter table garimpa.commission_entry drop constraint if exists commission_entry_predecessor_id_fkey;
alter table garimpa.commission_entry add foreign key(predecessor_id,tenant_id) references garimpa.commission_entry(id,tenant_id) on delete restrict;
alter table garimpa.saas_revenue_entry drop constraint if exists saas_revenue_entry_predecessor_id_fkey;
alter table garimpa.saas_revenue_entry add foreign key(predecessor_id,tenant_id) references garimpa.saas_revenue_entry(id,tenant_id) on delete restrict;

alter table garimpa.operational_cost add column if not exists request_id text;
alter table garimpa.operational_cost add column if not exists input_digest text;
alter table garimpa.operational_cost add constraint operational_cost_tenant_request_unique unique(tenant_id,request_id);
revoke update,delete on garimpa.operational_cost from garimpa_app;
alter table garimpa.operational_cost add constraint operational_cost_measurement check (
 (amount_cents is null or (amount_cents>=0 and currency ~ '^[A-Z]{3}$'))
 and (duration_seconds is null or duration_seconds>=0) and period_end>=period_start);

-- A child must reference a conversion/import belonging to its own account.
alter table garimpa.conversion add unique(id,tenant_id);
alter table garimpa.import_batch add unique(id,tenant_id);
alter table garimpa.conversion_attribution drop constraint if exists conversion_attribution_conversion_id_fkey;
alter table garimpa.conversion_attribution add foreign key(conversion_id,tenant_id) references garimpa.conversion(id,tenant_id) on delete restrict;
alter table garimpa.commission_entry drop constraint if exists commission_entry_conversion_id_fkey;
alter table garimpa.commission_entry add foreign key(conversion_id,tenant_id) references garimpa.conversion(id,tenant_id) on delete restrict;
alter table garimpa.import_row drop constraint if exists import_row_batch_id_fkey;
alter table garimpa.import_row add foreign key(batch_id,tenant_id) references garimpa.import_batch(id,tenant_id) on delete restrict;
alter table garimpa.conversion add check(order_value_cents is null or order_value_cents>=0);
alter table garimpa.commission_entry add check(amount_cents>=0);
alter table garimpa.saas_revenue_entry add check(amount_cents>=0);
