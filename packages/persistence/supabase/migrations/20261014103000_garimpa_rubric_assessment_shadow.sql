-- M-02: Avaliação de IA em modo sombra e comparação com curadoria humana (EP-02 / C-03).
--
-- Objetivos:
-- 1. Cria garimpa.analysis_assessment para persistir avaliações de IA imutáveis (modo shadow/assisted)
--    sem inventar autor humano fictício nem sobrescrever o fluxo de curadoria.
-- 2. Cria garimpa.comparison_review para documentar desacordos explicados entre humano e IA.
-- 3. Aplica RLS estritamente isolado por tenant e permissões scoped para garimpa_app.

-- 1. Avaliações de inteligência artificial (shadow/assisted) ---------------
create table if not exists garimpa.analysis_assessment (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  product_id text not null,
  rubric_version text not null,
  input_digest text not null,
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  model_version text not null,
  prompt_version text not null,
  mode text not null check (mode in ('shadow', 'assisted')),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, tenant_id),
  foreign key (product_id, tenant_id) references garimpa.product(id, tenant_id)
);

create index if not exists idx_analysis_assessment_product
  on garimpa.analysis_assessment (tenant_id, product_id, created_at desc);

create index if not exists idx_analysis_assessment_digest
  on garimpa.analysis_assessment (tenant_id, input_digest);

comment on table garimpa.analysis_assessment is
  'Avaliações analíticas de IA imutáveis (shadow e assisted). Não inventa autoria humana.';

-- 2. Revisão de comparação entre humano e IA -------------------------------
create table if not exists garimpa.comparison_review (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  product_id text not null,
  analysis_assessment_id text not null,
  editorial_assessment_id text,
  rubric_version text not null,
  agreement boolean not null,
  disagreements jsonb not null default '[]'::jsonb check (jsonb_typeof(disagreements) = 'array'),
  reviewed_by_app_user_id text not null,
  reviewed_at timestamptz not null default clock_timestamp(),
  notes text,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, tenant_id),
  foreign key (product_id, tenant_id) references garimpa.product(id, tenant_id),
  foreign key (analysis_assessment_id, tenant_id) references garimpa.analysis_assessment(id, tenant_id),
  foreign key (reviewed_by_app_user_id) references garimpa.app_user(id)
);

-- Relaxar FK de ator em editorial_assessment para referenciar app_user(id) global (CF-05)
alter table garimpa.editorial_assessment drop constraint if exists editorial_assessment_actor_app_user_id_tenant_id_fkey;
alter table garimpa.editorial_assessment drop constraint if exists editorial_assessment_actor_fkey;
alter table garimpa.editorial_assessment add constraint editorial_assessment_actor_fkey foreign key (actor_app_user_id) references garimpa.app_user(id);

create index if not exists idx_comparison_review_product
  on garimpa.comparison_review (tenant_id, product_id, created_at desc);

create index if not exists idx_comparison_review_analysis
  on garimpa.comparison_review (tenant_id, analysis_assessment_id);

comment on table garimpa.comparison_review is
  'Registro de calibração e desacordos entre decisão humana e resultado de IA (EP-02 / G-RUBRIC).';

-- 3. Segurança e controle de acesso ----------------------------------------
revoke all on garimpa.analysis_assessment, garimpa.comparison_review from public, anon, authenticated;
grant select, insert on garimpa.analysis_assessment, garimpa.comparison_review to garimpa_app;

alter table garimpa.analysis_assessment enable row level security;
alter table garimpa.comparison_review enable row level security;

create policy analysis_assessment_tenant_isolation on garimpa.analysis_assessment
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy comparison_review_tenant_isolation on garimpa.comparison_review
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (
    tenant_id = nullif(current_setting('garimpa.tenant_id', true), '')
    and exists (
      select 1 from garimpa.affiliate_membership m
      join garimpa.affiliate_account a on a.id = m.affiliate_id
      where m.app_user_id = garimpa.comparison_review.reviewed_by_app_user_id
        and a.tenant_id = garimpa.comparison_review.tenant_id
        and m.revoked_at is null
    )
  );
