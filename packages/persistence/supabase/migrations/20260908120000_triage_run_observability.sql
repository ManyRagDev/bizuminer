-- Migração: Observabilidade Persistida de Triagem (Triage Run)
-- Permite rastreabilidade ponta a ponta de lotes de curadoria automatizada,
-- registrando contadores, versões, tempo de execução e relacionando cada
-- curation_event diretamente ao seu lote específico de execução.

create table if not exists garimpa.triage_run (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(64) not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status varchar(32) not null default 'running' check (status in ('running', 'ok', 'error')),
  total_input integer not null default 0,
  approved_count integer not null default 0,
  held_count integer not null default 0,
  rejected_count integer not null default 0,
  annotated_count integer not null default 0,
  pipeline_version varchar(64) not null default 'curation-pipeline-v2',
  model_name varchar(64),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_triage_run_tenant_started
  on garimpa.triage_run (tenant_id, started_at desc);

-- Adiciona coluna triage_run_id em curation_event se não existir
alter table garimpa.curation_event
  add column if not exists triage_run_id uuid references garimpa.triage_run(id) on delete set null;

create index if not exists idx_curation_event_triage_run
  on garimpa.curation_event (triage_run_id)
  where triage_run_id is not null;

-- Concede permissões para as roles da aplicação
grant select, insert, update on garimpa.triage_run to garimpa_app;
grant select, insert, update on garimpa.triage_run to authenticated;
grant select, insert, update on garimpa.triage_run to service_role;
