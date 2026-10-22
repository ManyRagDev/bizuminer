-- M-11: Fila Transacional de Disparo e Agendamento Assistido (EP-11 / C-08).
-- Autorizado apenas para revisão e testes locais em ambiente isolado. Proibida aplicação remota desautorizada.

create table if not exists garimpa.dispatch_job (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  campaign_publication_id text not null,
  kit_revision_id text not null,
  destination_id text not null,
  scheduled_at timestamptz not null,
  status text not null check (status in ('queued', 'leased', 'succeeded', 'failed', 'unknown', 'cancelled')),
  lease_until timestamptz,
  lease_token text,
  attempt integer not null default 0,
  next_attempt_at timestamptz,
  io_started_at timestamptz,
  provider_message_id text,
  failure_code text,
  reconciliation_note text,
  reconciled_by text,
  reconciled_at timestamptz,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint dispatch_job_unique_target unique (tenant_id, campaign_publication_id, kit_revision_id, destination_id),
  constraint dispatch_job_id_tenant_key unique (id, tenant_id),
  foreign key (campaign_publication_id, tenant_id) references garimpa.campaign_publication(id, tenant_id) on delete cascade,
  foreign key (kit_revision_id, tenant_id) references garimpa.commercial_kit_revision(id, tenant_id) on delete cascade,
  foreign key (destination_id, tenant_id) references garimpa.destination(id, tenant_id) on delete cascade
);

-- Tabela de auditoria por tentativa de despacho com marcador estrito de I/O
create table if not exists garimpa.dispatch_attempt (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  job_id uuid not null,
  attempt_number integer not null,
  worker_token text not null,
  io_started_at timestamptz,
  io_completed_at timestamptz,
  status text not null check (status in ('in_flight', 'sent', 'rejected', 'unknown', 'aborted')),
  provider_message_id text,
  error_code text,
  note text,
  created_at timestamptz not null default now(),
  constraint dispatch_attempt_job_tenant_fkey foreign key (job_id, tenant_id)
    references garimpa.dispatch_job(id, tenant_id) on delete cascade
);

-- Índices de consulta e claim
create index if not exists dispatch_job_claim_idx
  on garimpa.dispatch_job (tenant_id, status, scheduled_at)
  where status in ('queued', 'leased');

create index if not exists dispatch_attempt_job_idx
  on garimpa.dispatch_attempt (tenant_id, job_id, attempt_number);

-- Grants
revoke all on garimpa.dispatch_job from public, anon, authenticated;
grant select, insert, update on garimpa.dispatch_job to garimpa_app;

revoke all on garimpa.dispatch_attempt from public, anon, authenticated;
grant select, insert, update on garimpa.dispatch_attempt to garimpa_app;

-- Ativar RLS
alter table garimpa.dispatch_job enable row level security;
alter table garimpa.dispatch_attempt enable row level security;

-- Policy de isolamento tenant
drop policy if exists dispatch_job_tenant_isolation on garimpa.dispatch_job;
create policy dispatch_job_tenant_isolation on garimpa.dispatch_job
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

drop policy if exists dispatch_attempt_tenant_isolation on garimpa.dispatch_attempt;
create policy dispatch_attempt_tenant_isolation on garimpa.dispatch_attempt
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));
