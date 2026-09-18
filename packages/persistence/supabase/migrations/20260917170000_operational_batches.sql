-- Lotes operacionais do painel: uma ação do administrador pode acionar
-- várias lojas, mas continua auditável como uma única operação.
create table if not exists garimpa.capture_batch (
  id uuid primary key default gen_random_uuid(),
  tenant_id varchar(64) not null,
  requested_marketplaces text[] not null,
  pages smallint not null check (pages between 1 and 3),
  status varchar(16) not null default 'running'
    check (status in ('running', 'ok', 'partial', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

-- Leitura do lote mais recente por tenant e garantia de uma única operação ativa.
create index if not exists idx_capture_batch_tenant_started
  on garimpa.capture_batch (tenant_id, started_at desc);
create unique index if not exists uq_capture_batch_one_running_per_tenant
  on garimpa.capture_batch (tenant_id)
  where status = 'running';

-- Uma única IA por tenant evita duas abas decidindo a mesma fila ao mesmo tempo.
create unique index if not exists uq_triage_run_one_running_per_tenant
  on garimpa.triage_run (tenant_id)
  where status = 'running';

alter table garimpa.capture_batch enable row level security;
create policy capture_batch_app_access on garimpa.capture_batch
  for all to garimpa_app using (true) with check (true);

-- A tabela é interna: o Next usa garimpa_app; não há acesso anônimo.
grant select, insert, update on garimpa.capture_batch to garimpa_app;
grant select, insert, update on garimpa.capture_batch to service_role;
