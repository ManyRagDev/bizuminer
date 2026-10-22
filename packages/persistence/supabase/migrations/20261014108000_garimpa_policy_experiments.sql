-- M-09: Experimentos de Políticas Editoriais e Métricas de Coorte (EP-09 / C-08).
-- Autorizado apenas para revisão e testes locais em ambiente isolado. Proibida aplicação remota desautorizada.

create table if not exists garimpa.policy_experiment (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  baseline_version text not null,
  candidate_version text not null,
  hypothesis text not null,
  cohort_spec jsonb not null default '{}'::jsonb,
  primary_metric text not null,
  min_sample integer not null default 30,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null check (status in ('draft', 'shadow', 'reviewed', 'promoted', 'rejected')),
  promotion_rationale text,
  promoted_by text,
  created_at timestamptz not null default now()
);

-- Grants
revoke all on garimpa.policy_experiment from public, anon, authenticated;
grant select, insert, update on garimpa.policy_experiment to garimpa_app;

-- Ativar RLS
alter table garimpa.policy_experiment enable row level security;

-- Policy de isolamento tenant
drop policy if exists policy_experiment_tenant_isolation on garimpa.policy_experiment;
create policy policy_experiment_tenant_isolation on garimpa.policy_experiment
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

alter table garimpa.policy_experiment add column if not exists audience_policy_id text;
alter table garimpa.policy_experiment add unique(id, tenant_id);

create table if not exists garimpa.experiment_assignment (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  experiment_id uuid not null,
  unit_id text not null,
  variant text not null check (variant in ('baseline', 'candidate')),
  assigned_at timestamptz not null default now(),
  constraint experiment_assignment_unique unique(tenant_id, experiment_id, unit_id),
  foreign key (experiment_id, tenant_id) references garimpa.policy_experiment(id, tenant_id) on delete cascade
);

create table if not exists garimpa.experiment_evaluation (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  experiment_id uuid not null,
  unit_id text not null,
  variant text not null check (variant in ('baseline', 'candidate')),
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint experiment_evaluation_unique unique(tenant_id, experiment_id, unit_id, variant),
  foreign key (experiment_id, tenant_id) references garimpa.policy_experiment(id, tenant_id) on delete cascade
);

revoke all on garimpa.experiment_assignment, garimpa.experiment_evaluation from public, anon, authenticated;
grant select, insert, update on garimpa.experiment_assignment, garimpa.experiment_evaluation to garimpa_app;

alter table garimpa.experiment_assignment enable row level security;
alter table garimpa.experiment_evaluation enable row level security;

drop policy if exists experiment_assignment_tenant_isolation on garimpa.experiment_assignment;
create policy experiment_assignment_tenant_isolation on garimpa.experiment_assignment
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

drop policy if exists experiment_evaluation_tenant_isolation on garimpa.experiment_evaluation;
create policy experiment_evaluation_tenant_isolation on garimpa.experiment_evaluation
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));
