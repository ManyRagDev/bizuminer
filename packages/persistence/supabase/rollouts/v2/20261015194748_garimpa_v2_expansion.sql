-- Replacement BizuMiner V2 rollout. Execute only the explicit manifest, one transaction per unit.
-- Supersedes pending original2--12 for this baseline; never reapply already-installed originals.
-- Candidate for isolated verification, NOT a production approval. Preserve history and data on recovery.
set local search_path=pg_catalog;
set local standard_conforming_strings=on;
set local lock_timeout='5s';
set local statement_timeout='45s';
do $guard$ begin
 if (select coalesce(jsonb_agg(tablename order by tablename),'[]'::jsonb) from pg_tables where schemaname='garimpa') <> '["affiliate_account","affiliate_marketplace_config","affiliate_membership","affiliate_monitoring_policy","affiliate_monitoring_policy_event","affiliate_monitoring_skip","affiliate_secret","app_user","app_user_role","buyer_profile","capture_batch","capture_run","click_event","curation_event","editorial_assessment","editorial_guideline","editorial_selection","editorial_selection_item","extension_device","favorite","price_observation","price_watch","product","product_curation","publication","rollout_control","short_link","subscriber","triage_run"]'::jsonb then raise exception 'rollout_table_inventory_mismatch'; end if;
 end $guard$;
do $guard$ begin
 if (select coalesce(jsonb_agg(jsonb_build_object('tablename',tablename,'policyname',policyname,'permissive',permissive,'roles',roles,'cmd',cmd,'qual',qual,'with_check',with_check) order by tablename,policyname),'[]'::jsonb) from pg_policies where schemaname='garimpa') <> '[{"tablename":"affiliate_account","policyname":"affiliate_account_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"affiliate_marketplace_config","policyname":"affiliate_marketplace_config_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"affiliate_membership","policyname":"affiliate_membership_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"affiliate_monitoring_policy","policyname":"affiliate_monitoring_policy_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"affiliate_monitoring_policy_event","policyname":"affiliate_monitoring_policy_event_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"affiliate_monitoring_skip","policyname":"affiliate_monitoring_skip_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"affiliate_secret","policyname":"affiliate_secret_bootstrap_scope","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"((tenant_id = NULLIF(current_setting(''garimpa.tenant_id''::text, true), ''''::text)) AND ((current_setting(''garimpa.membership_role''::text, true) = ''owner''::text) OR (current_setting(''garimpa.actor_type''::text, true) = ''worker''::text)) AND (EXISTS ( SELECT 1\n   FROM garimpa.affiliate_account a\n  WHERE ((a.tenant_id = affiliate_secret.tenant_id) AND (a.status = ''active''::text)))))","with_check":"((tenant_id = NULLIF(current_setting(''garimpa.tenant_id''::text, true), ''''::text)) AND ((current_setting(''garimpa.membership_role''::text, true) = ''owner''::text) OR (current_setting(''garimpa.actor_type''::text, true) = ''worker''::text)) AND (EXISTS ( SELECT 1\n   FROM garimpa.affiliate_account a\n  WHERE ((a.tenant_id = affiliate_secret.tenant_id) AND (a.status = ''active''::text)))))"},{"tablename":"app_user","policyname":"app_user_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"app_user_role","policyname":"app_user_role_runtime_read","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"SELECT","qual":"true","with_check":null},{"tablename":"buyer_profile","policyname":"buyer_profile_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"capture_batch","policyname":"capture_batch_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"capture_run","policyname":"capture_run_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"click_event","policyname":"click_event_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"curation_event","policyname":"curation_event_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"SELECT","qual":"true","with_check":null},{"tablename":"curation_event","policyname":"curation_event_app_insert","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"INSERT","qual":null,"with_check":"true"},{"tablename":"editorial_assessment","policyname":"editorial_assessment_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"editorial_guideline","policyname":"editorial_guideline_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"editorial_selection","policyname":"editorial_selection_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"editorial_selection_item","policyname":"editorial_selection_item_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"extension_device","policyname":"extension_device_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"favorite","policyname":"favorite_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"price_observation","policyname":"price_observation_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"price_watch","policyname":"price_watch_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"product","policyname":"product_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"product_curation","policyname":"product_curation_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"publication","policyname":"publication_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"rollout_control","policyname":"rollout_status_read","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"SELECT","qual":"(id = ''bizuminer-v2''::text)","with_check":null},{"tablename":"short_link","policyname":"short_link_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"subscriber","policyname":"subscriber_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"triage_run","policyname":"triage_run_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"}]'::jsonb then raise exception 'rollout_policy_inventory_mismatch'; end if;
 end $guard$;

do $guard$ begin
 if (select count(*) from garimpa.rollout_control where id='bizuminer-v2' and not enabled)<>1 or garimpa.commercial_rollout_ready() then raise exception 'rollout_gate_must_be_closed'; end if;
 if not exists(select 1 from pg_roles where rolname='garimpa_public_runtime' and not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolreplication) then raise exception 'unsafe_public_runtime_role'; end if;
end $guard$;

-- Adopted source: 20261014102000_garimpa_price_evidence_canonical.sql sha256=5663b934ce2240efcafa8b069e54376f08cc392ec07d87d62d4c4c98deceb2b6
-- M-01: Política de evidência de preço versionada e cálculo canônico de alegações (EP-01 / C-02).
--
-- Objetivos:
-- 1. Cria garimpa.price_evidence_policy_version para governança técnica e comercial dos limiares de preço.
-- 2. Atualiza a view garimpa.curation_queue_facts para substituir a regra heurística insegura (3 obs / 7 dias)
--    pelo cálculo canônico baseado em configuração física/comercial verificada (variantKey) e política ativa.
-- 3. Garante que lowest_verified seja false e previous_min_price_cents seja null quando a configuração
--    for desconhecida ou não comparável, ou quando a política E3 não estiver aprovada/habilitada.

-- 1. Tabela de versão de política de evidência de preço ---------------------
create table if not exists garimpa.price_evidence_policy_version (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  version text not null,
  config jsonb not null,
  approved_by text,
  approved_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  created_at timestamptz not null default now(),
  unique (tenant_id, version)
);

create index if not exists idx_price_evidence_policy_tenant_status
  on garimpa.price_evidence_policy_version (tenant_id, status);

comment on table garimpa.price_evidence_policy_version is
  'Versões de política de evidência de preço por conta (C-02 / EP-01). E3 requer aprovação formal (G-PRICE).';

-- Seed da política conservadora padrão (v1.0.0, e3Enabled = false) para contas existentes
insert into garimpa.price_evidence_policy_version (tenant_id, version, config, status)
select a.tenant_id, '1.0.0', jsonb_build_object(
  'windowDays', 30,
  'bucketHours', 24,
  'minimumPriorCount', 3,
  'minimumDistinctDays', 3,
  'maximumGapHours', 72,
  'minimumCoverageRatio', 0.7,
  'maxAgeHours', 48,
  'scope', 'listing_price_excluding_shipping',
  'e3Enabled', false
), 'draft'
from garimpa.affiliate_account a
on conflict (tenant_id, version) do nothing;

-- Runtime access and immutable approved policy versions.
revoke all on garimpa.price_evidence_policy_version from public,anon,authenticated;
grant select,insert,update on garimpa.price_evidence_policy_version to garimpa_app;
alter table garimpa.price_evidence_policy_version enable row level security;
create policy price_evidence_policy_scope on garimpa.price_evidence_policy_version for select to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''));
create policy price_evidence_policy_owner on garimpa.price_evidence_policy_version for all to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and current_setting('garimpa.membership_role',true)='owner')
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and current_setting('garimpa.membership_role',true)='owner');
create or replace function garimpa.offer_configuration_key(e jsonb)
returns jsonb language plpgsql immutable set search_path=pg_catalog,garimpa as $$
declare key text; quantity jsonb; field text; material jsonb; value jsonb; begin
  key:=coalesce(e->'variantIdentity'->>'key',e->>'variantKey');
  if key is null or key='' then return null; end if;
  if e ? 'variantIdentity' and coalesce(e->'variantIdentity'->>'state','unknown') not in ('source_verified','human_verified') then return null; end if;
  if e ? 'priceType' and e->>'priceType'<>'exact' then return null; end if;
  if e->>'priceMinCents' is not null and e->>'priceMaxCents' is not null and e->>'priceMinCents'<>e->>'priceMaxCents' then return null; end if;
  quantity:=coalesce(e->'packageQuantity',e->'conditions'->'quantity');
  if jsonb_typeof(quantity) is distinct from 'number' or quantity::text !~ '^[1-9][0-9]*$' then return null; end if;
  material:=jsonb_build_object('variantKey',key,'quantity',quantity,'attributes',coalesce(e->'variantIdentity'->'attributes','{}'::jsonb));
  foreach field in array array['sellerId','packageContents','dimensions','payment','coupon','region'] loop
    value:=case when field in ('payment','coupon','region') then e->'conditions'->field else e->field end;
    if value is null or value='null'::jsonb or value='""'::jsonb then
      if e->'fieldStates'->>field is distinct from 'not_applicable' then return null; end if;
      value:='null'::jsonb;
    end if;
    material:=material||jsonb_build_object(case when field='packageContents' then 'contents' else field end,value);
  end loop;
  return material;
end $$;
revoke all on function garimpa.offer_configuration_key(jsonb) from public,anon,authenticated;
grant execute on function garimpa.offer_configuration_key(jsonb) to garimpa_app;

-- Preserve all observed columns, names, order and types of the existing view.
create or replace view garimpa.curation_queue_facts with(security_invoker=true) as
with latest as (
 select distinct on(product_id) * from garimpa.price_observation order by product_id,observed_at desc,id desc
), policy as (
 select distinct on(tenant_id) tenant_id,config from garimpa.price_evidence_policy_version
 where status='approved' order by tenant_id,created_at desc,id desc
), first_run as (
 select distinct on(product_id) product_id,capture_run_id from garimpa.price_observation where capture_run_id is not null order by product_id,observed_at,id
)
select p.id,p.tenant_id,p.marketplace,p.external_id,p.title,p.product_url,p.image_url,p.category,p.last_seen_at,
 p.family_key,p.family_label,p.family_method,p.family_version,c.status,c.reason_code,c.reason_detail,c.deferred_until,c.created_at as queued_at,
 l.price_cents,l.original_price_cents,l.claimed_discount_rate,l.rating_star,l.sales_label,l.sales_count,l.observed_at,
 totals.observation_count,totals.history_days,prior.previous_min_price_cents,
 (coalesce((pol.config->>'e3Enabled')::boolean,false)
   and l.observed_at<=now() and now()<l.observed_at+(coalesce((pol.config->>'maxAgeHours')::numeric,48)*interval '1 hour')
   and l.price_cents>0 and prior.comparable_count>=coalesce((pol.config->>'minimumPriorCount')::int,3)
   and prior.distinct_days>=coalesce((pol.config->>'minimumDistinctDays')::int,3)
   and prior.covered_buckets::numeric / greatest(1,ceil(cfg.window_days*24/cfg.bucket_hours)) >=coalesce((pol.config->>'minimumCoverageRatio')::numeric,0.7)
   and gaps.max_gap<=coalesce((pol.config->>'maximumGapHours')::numeric,72)
   and prior.previous_min_price_cents is not null and l.price_cents<=prior.previous_min_price_cents) as lowest_verified,
 fr.capture_run_id as presenting_capture_run_id,run.marketplace as presenting_marketplace,
 run.parameters->>'capturePlanId' as presenting_plan_id,run.parameters->>'captureQueryId' as presenting_query_id,
 run.parameters->>'captureMode' as presenting_mode,run.parameters->>'targetCategory' as presenting_target_category,
 run.parameters->>'targetFamily' as presenting_target_family,
 run.parameters->>'executionId' as presenting_execution_id,run.collector_run_id as presenting_collector_run_id,run.started_at as presenting_captured_at
from garimpa.product p join garimpa.product_curation c on c.product_id=p.id and c.tenant_id=p.tenant_id
join latest l on l.product_id=p.id and l.tenant_id=p.tenant_id
left join policy pol on pol.tenant_id=p.tenant_id
cross join lateral(select greatest(1,coalesce((pol.config->>'windowDays')::numeric,30)) as window_days,
 greatest(0.01,coalesce((pol.config->>'bucketHours')::numeric,24)) as bucket_hours) cfg
cross join lateral(select count(*)::int as observation_count,
 floor(extract(epoch from(l.observed_at-min(o.observed_at)))/86400)::int as history_days
 from garimpa.price_observation o where o.product_id=p.id and o.tenant_id=p.tenant_id) totals
cross join lateral(
 with comparable as (
  select o.* from garimpa.price_observation o
  where o.product_id=p.id and o.tenant_id=p.tenant_id and o.id<>l.id and o.price_cents>0
   and o.observed_at<l.observed_at and o.observed_at>=l.observed_at-cfg.window_days*interval '1 day'
   and l.offer_evidence->>'currency' is not null and o.offer_evidence->>'currency'=l.offer_evidence->>'currency'
   and garimpa.offer_configuration_key(l.offer_evidence) is not null
   and garimpa.offer_configuration_key(o.offer_evidence)=garimpa.offer_configuration_key(l.offer_evidence)
 )
 select min(price_cents) as previous_min_price_cents,count(*)::int as comparable_count,
 count(distinct (observed_at at time zone 'UTC')::date)::int as distinct_days,
 count(distinct floor(extract(epoch from(observed_at-(l.observed_at-cfg.window_days*interval '1 day')))/(cfg.bucket_hours*3600)))::int as covered_buckets
 from comparable
) prior
cross join lateral(
 select max(extract(epoch from(next_time-observed_at))/3600) as max_gap from (
  select observed_at,lead(observed_at) over(order by observed_at) as next_time from (
   select l.observed_at-cfg.window_days*interval '1 day' as observed_at union all select l.observed_at
   union all select o.observed_at from garimpa.price_observation o
    where o.product_id=p.id and o.tenant_id=p.tenant_id and o.id<>l.id and o.price_cents>0
    and o.observed_at<l.observed_at and o.observed_at>=l.observed_at-cfg.window_days*interval '1 day'
    and l.offer_evidence->>'currency' is not null and o.offer_evidence->>'currency'=l.offer_evidence->>'currency'
    and garimpa.offer_configuration_key(l.offer_evidence) is not null
    and garimpa.offer_configuration_key(o.offer_evidence)=garimpa.offer_configuration_key(l.offer_evidence)
  ) points
 ) ordered
) gaps
left join first_run fr on fr.product_id=p.id
left join garimpa.capture_run run on run.id=fr.capture_run_id and run.tenant_id=p.tenant_id;

-- An approved calibration is a signed version, not editable thresholds.
alter table garimpa.price_evidence_policy_version add constraint price_policy_approval_evidence
 check(status<>'approved' or (approved_by is not null and approved_at is not null));
create or replace function garimpa.protect_price_policy_version()
returns trigger language plpgsql set search_path=pg_catalog,garimpa as $$ begin
 if old.status='approved' and (new.config is distinct from old.config or new.version is distinct from old.version
  or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
  or new.status not in ('approved','retired')) then raise exception 'approved_policy_immutable'; end if;
 return new;
end $$;
create trigger price_policy_immutable before update on garimpa.price_evidence_policy_version
 for each row execute function garimpa.protect_price_policy_version();

-- Adopted source: 20261014103000_garimpa_rubric_assessment_shadow.sql sha256=fc2ebbd70c0c31f9a416b2026d1a0789aafa908b68031710fec41ba5e7483139
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

-- Adopted source: 20261014104000_garimpa_audience_policy_and_opportunity.sql sha256=f7891a8b351f3efe3da146e520c1a2a0c2c05afd0a6e8d848c2f34302331341a
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

-- Adopted source: 20261014105000_garimpa_commerce_and_campaign_link.sql sha256=0ac1aac79763568890d0ea5a6f8785898f338da0d981d3e49aa87e569763e648
-- M-04: Campanhas comerciais, kits, publicações sociais e links de campanha (EP-04 / C-04 / C-05 / C-06).
--
-- Objetivos:
-- 1. Cria campaign e destination para gerenciamento comercial.
-- 2. Cria commercial_kit, commercial_kit_revision, kit_validation e kit_approval (ledger de conteúdo imutável).
-- 3. Cria campaign_publication para publicações sociais assistidas/integradas.
-- 4. Cria campaign_link com códigos de 12 caracteres (C-06) segregados dos 4 caracteres legados.
-- 5. Aplica isolamento estrito de tenant via RLS.

-- 1. Campanha e destinos ----------------------------------------------------
create table if not exists garimpa.campaign (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  name text not null,
  objective text not null,
  audience_policy_version_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  version int not null default 1 check (version > 0),
  created_by text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, tenant_id),
  foreign key (audience_policy_version_id, tenant_id) references garimpa.audience_policy_version(id, tenant_id)
);

create index if not exists idx_campaign_tenant_status
  on garimpa.campaign (tenant_id, status);

create table if not exists garimpa.destination (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  channel text not null,
  label text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  external_target_ref text,
  secret_ref text,
  automation_mode text not null default 'assisted' check (automation_mode in ('assisted', 'integrated', 'scheduled')),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, tenant_id)
);

create index if not exists idx_destination_tenant_channel
  on garimpa.destination (tenant_id, channel, status);

-- 2. Kit comercial e revisões ----------------------------------------------
create table if not exists garimpa.commercial_kit (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  campaign_id text not null,
  opportunity_id text not null,
  current_revision int not null default 1 check (current_revision > 0),
  version int not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'validating', 'needs_revision', 'approved', 'invalidated', 'archived')),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, tenant_id),
  foreign key (campaign_id, tenant_id) references garimpa.campaign(id, tenant_id),
  foreign key (opportunity_id, tenant_id) references garimpa.opportunity(id, tenant_id)
);

create index if not exists idx_commercial_kit_campaign
  on garimpa.commercial_kit (tenant_id, campaign_id, status);

create table if not exists garimpa.commercial_kit_revision (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  kit_id text not null,
  revision int not null check (revision > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  claims jsonb not null check (jsonb_typeof(claims) = 'array'),
  materials jsonb not null check (jsonb_typeof(materials) = 'array'),
  template_version text not null default '1.0.0',
  prompt_version text,
  created_by text not null,
  created_at timestamptz not null default clock_timestamp(),
  content_digest text not null,
  unique (kit_id, revision),
  unique (id, tenant_id),
  foreign key (kit_id, tenant_id) references garimpa.commercial_kit(id, tenant_id)
);

create index if not exists idx_kit_revision_lookup
  on garimpa.commercial_kit_revision (tenant_id, kit_id, revision desc);

create table if not exists garimpa.kit_validation (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  revision_id text not null,
  input_digest text not null,
  checked_at timestamptz not null default clock_timestamp(),
  valid_until timestamptz not null,
  result text not null check (result in ('valid', 'invalid', 'unknown')),
  blockers text[] not null default array[]::text[],
  validator_version text not null default '1.0.0',
  unique (id, tenant_id),
  foreign key (revision_id, tenant_id) references garimpa.commercial_kit_revision(id, tenant_id)
);

create table if not exists garimpa.kit_approval (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  revision_id text not null,
  validation_id text not null,
  approved_by text not null,
  approved_at timestamptz not null default clock_timestamp(),
  unique (id, tenant_id),
  foreign key (revision_id, tenant_id) references garimpa.commercial_kit_revision(id, tenant_id),
  foreign key (validation_id, tenant_id) references garimpa.kit_validation(id, tenant_id)
);

-- 3. Publicações de campanha e links ---------------------------------------
create table if not exists garimpa.campaign_publication (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  campaign_id text not null,
  kit_id text not null,
  kit_revision_id text not null,
  destination_id text not null,
  channel text not null,
  version int not null default 1 check (version > 0),
  status text not null default 'planned' check (status in ('planned', 'ready', 'exported', 'published_confirmed', 'cancelled', 'expired', 'failed')),
  scheduled_at timestamptz,
  exported_at timestamptz,
  published_at timestamptz,
  confirmation_source text,
  publication_url text,
  failure_code text,
  created_by text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, tenant_id),
  foreign key (campaign_id, tenant_id) references garimpa.campaign(id, tenant_id),
  foreign key (kit_id, tenant_id) references garimpa.commercial_kit(id, tenant_id),
  foreign key (kit_revision_id, tenant_id) references garimpa.commercial_kit_revision(id, tenant_id),
  foreign key (destination_id, tenant_id) references garimpa.destination(id, tenant_id)
);

create index if not exists idx_campaign_publication_status
  on garimpa.campaign_publication (tenant_id, campaign_id, status);

create table if not exists garimpa.campaign_link (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  publication_id text not null,
  web_publication_id text,
  code text not null unique check (length(code) = 12),
  target_url text,
  monetization_status text not null default 'reserved' check (monetization_status in ('reserved', 'valid', 'invalid', 'revoked')),
  capability_version text not null default '1.0.0',
  validated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (publication_id, tenant_id),
  unique (id, tenant_id),
  foreign key (publication_id, tenant_id) references garimpa.campaign_publication(id, tenant_id)
);

create index if not exists idx_campaign_link_code
  on garimpa.campaign_link (code);

-- 4. Permissões e RLS ------------------------------------------------------
revoke all on
  garimpa.campaign,
  garimpa.destination,
  garimpa.commercial_kit,
  garimpa.commercial_kit_revision,
  garimpa.kit_validation,
  garimpa.kit_approval,
  garimpa.campaign_publication,
  garimpa.campaign_link
from public, anon, authenticated;

grant select, insert, update on
  garimpa.campaign,
  garimpa.destination,
  garimpa.commercial_kit,
  garimpa.commercial_kit_revision,
  garimpa.kit_validation,
  garimpa.kit_approval,
  garimpa.campaign_publication,
  garimpa.campaign_link
to garimpa_app;

alter table garimpa.campaign enable row level security;
alter table garimpa.destination enable row level security;
alter table garimpa.commercial_kit enable row level security;
alter table garimpa.commercial_kit_revision enable row level security;
alter table garimpa.kit_validation enable row level security;
alter table garimpa.kit_approval enable row level security;
alter table garimpa.campaign_publication enable row level security;
alter table garimpa.campaign_link enable row level security;

create policy campaign_isolation on garimpa.campaign
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy destination_isolation on garimpa.destination
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy commercial_kit_isolation on garimpa.commercial_kit
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy commercial_kit_revision_isolation on garimpa.commercial_kit_revision
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy kit_validation_isolation on garimpa.kit_validation
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy kit_approval_isolation on garimpa.kit_approval
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy campaign_publication_isolation on garimpa.campaign_publication
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy campaign_link_isolation on garimpa.campaign_link
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

-- Frozen revisions, validations and approvals are append-only.
revoke update,delete on garimpa.commercial_kit_revision,garimpa.kit_validation,garimpa.kit_approval from garimpa_app;
alter table garimpa.campaign_link add constraint campaign_link_web_publication_fkey
 foreign key(web_publication_id,tenant_id) references garimpa.publication(id,tenant_id) on delete restrict;

-- Public projections: no private account/configuration DTO is returned.
create or replace function garimpa.public_offer_rows(p_tenant text default null)
returns table(id text,tenant_id text,publication_id text,title text,image_url text,category text,marketplace text,slug text,
 price_cents int,original_price_cents int,claimed_discount_rate double precision,rating_star double precision,
 sales_label text,sales_count int,evidence_observed_at timestamptz,min_price_cents int,previous_min_price_cents int,
 observation_count int,history_days int,lowest_verified boolean)
language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select f.id,f.tenant_id,pub.id,f.title,f.image_url,f.category,f.marketplace,pub.slug,
 f.price_cents,f.original_price_cents,f.claimed_discount_rate,f.rating_star,f.sales_label,f.sales_count,f.observed_at,
 f.previous_min_price_cents,f.previous_min_price_cents,f.observation_count,f.history_days,f.lowest_verified
 from garimpa.curation_queue_facts f
 join lateral(select p.* from garimpa.publication p join garimpa.affiliate_account a on a.id=p.affiliate_id and a.tenant_id=p.tenant_id and a.status='active'
   where p.product_id=f.id and p.tenant_id=f.tenant_id and p.channel='web' and p.status='active' order by p.published_at desc,p.id limit 1) pub on true
 where f.status='approved' and f.price_cents>0 and f.last_seen_at>=now()-interval '7 days'
   and (p_tenant is null or f.tenant_id=p_tenant);
$$;

create or replace function garimpa.public_deal_detail(p_slug text)
returns jsonb language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select jsonb_build_object('deal',to_jsonb(f)-'tenant_id'-'publication_id','price_history',coalesce((
   select jsonb_agg(jsonb_build_object('price_cents',o.price_cents,'observed_at',o.observed_at) order by o.observed_at,o.id)
   from garimpa.price_observation o
   where o.product_id=f.id and o.tenant_id=f.tenant_id and o.observed_at>=now()-interval '90 days' and o.price_cents>0
     and o.offer_evidence->>'currency' is not null and o.offer_evidence->>'currency'=latest.offer_evidence->>'currency'
     and garimpa.offer_configuration_key(latest.offer_evidence) is not null
     and garimpa.offer_configuration_key(o.offer_evidence)=garimpa.offer_configuration_key(latest.offer_evidence)
 ),'[]'::jsonb))
 from garimpa.public_offer_rows(null) f join lateral(select offer_evidence from garimpa.price_observation where product_id=f.id and tenant_id=f.tenant_id order by observed_at desc,id desc limit 1) latest on true
 where f.slug=p_slug limit 1;
$$;

create or replace function garimpa.public_catalog(p_tenant text,q jsonb)
returns jsonb language sql stable security definer set search_path=pg_catalog,garimpa as $$
 with selected as(select id,version from garimpa.editorial_selection where tenant_id=p_tenant and status='active' and valid_until>now() order by version desc limit 1),
 filtered as (
  select f.*,item.position from garimpa.public_offer_rows(p_tenant) f
  left join garimpa.editorial_selection_item item on item.product_id=f.id and item.tenant_id=f.tenant_id and item.selection_id=(select id from selected) and 'home'=any(item.destinations)
  where (q->>'category' is null or f.category=q->>'category') and (q->>'search' is null or f.title ilike '%'||(q->>'search')||'%')
   and (q->>'marketplace' is null or f.marketplace=q->>'marketplace')
   and (q->>'minPriceCents' is null or f.price_cents>=(q->>'minPriceCents')::int)
   and (q->>'maxPriceCents' is null or f.price_cents<=(q->>'maxPriceCents')::int)
   and (q->>'minRating' is null or f.rating_star>=(q->>'minRating')::numeric)
   and (q->>'minDiscount' is null or f.claimed_discount_rate>=(q->>'minDiscount')::numeric/100)
   and (not coalesce((q->>'lowestOnly')::boolean,false) or f.lowest_verified)
   and (not coalesce((q->>'hasHistory')::boolean,false) or (f.observation_count>=3 and f.history_days>=7))
   and (q->>'freshnessDays' is null or f.evidence_observed_at>=now()-least(7,(q->>'freshnessDays')::int)*interval '1 day')
 ), paged as(select * from filtered order by
   case when coalesce(q->>'sort','signal')='signal' then position end nulls last,
   case when q->>'sort'='price' then price_cents end asc nulls last,
   case when q->>'sort'='popularity' then sales_count end desc nulls last,
   evidence_observed_at desc,id limit least(24,greatest(1,coalesce((q->>'limit')::int,12))) offset greatest(0,coalesce((q->>'offset')::int,0)))
 select jsonb_build_object('deals',coalesce((select jsonb_agg(to_jsonb(p)-'tenant_id'-'publication_id'-'position') from paged p),'[]'::jsonb),
  'total',(select count(*) from filtered),'selectionVersion',(select version from selected),'selectionStateKey','public-v1');
$$;

create or replace function garimpa.public_campaign_link(p_code text,p_slug text default null)
returns table(code text,slug text,tenant_id text,link_id text,social_publication_id text,web_publication_id text)
language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select cl.code,f.slug,f.tenant_id,cl.id,cp.id,f.publication_id
 from garimpa.campaign_link cl join garimpa.campaign_publication cp on cp.id=cl.publication_id and cp.tenant_id=cl.tenant_id
 join garimpa.commercial_kit k on k.id=cp.kit_id and k.tenant_id=cp.tenant_id
 join garimpa.opportunity o on o.id=k.opportunity_id and o.tenant_id=k.tenant_id
 join garimpa.public_offer_rows(null) f on f.id=o.product_id and f.tenant_id=cl.tenant_id and f.publication_id=cl.web_publication_id
 where cl.code=p_code and cl.monetization_status='valid' and cl.revoked_at is null
   and (p_slug is null or f.slug=p_slug);
$$;

create or replace function garimpa.uri_component(p_text text)
returns text language plpgsql immutable set search_path=pg_catalog as $$
declare bytes bytea:=convert_to(p_text,'UTF8'); result text:=''; b int; i int; begin
 for i in 0..length(bytes)-1 loop b:=get_byte(bytes,i);
  result:=result||case when (b between 48 and 57) or (b between 65 and 90) or (b between 97 and 122) or b in (45,46,95,126) then chr(b) else '%'||upper(lpad(to_hex(b),2,'0')) end;
 end loop; return result;
end $$;

create or replace function garimpa.public_monetized_target(p_slug text)
returns table(url text,publication_id text,tenant_id text)
language plpgsql stable security definer set search_path=pg_catalog,garimpa as $$
declare f record; p record; c record; pair text; kept text[]:=array[]::text[]; base text; fragment text; query text; begin
 select * into f from garimpa.public_offer_rows(null) where slug=p_slug limit 1;
 if not found then return; end if;
 select pub.*,product.product_url into p from garimpa.publication pub join garimpa.product product on product.id=pub.product_id and product.tenant_id=pub.tenant_id where pub.id=f.publication_id;
 if f.marketplace in ('shopee','aliexpress') then
  if p.affiliate_url is null or p.affiliate_url !~ '^https://' then return; end if;
  return query select p.affiliate_url::text,f.publication_id::text,f.tenant_id::text; return;
 end if;
 if f.marketplace<>'mercadolivre' or p.product_url !~ '^https://([a-z0-9-]+[.])*mercadolivre[.]com[.]br/' then return; end if;
 select * into c from garimpa.affiliate_marketplace_config where affiliate_id=p.affiliate_id and marketplace=f.marketplace and status='active';
 if not found or c.tracking_id is null or c.tool_id is null or c.tracking_id='' or c.tool_id='' then return; end if;
 base:=split_part(split_part(p.product_url,'#',1),'?',1); fragment:=case when position('#' in p.product_url)>0 then '#'||split_part(p.product_url,'#',2) else '' end;
 query:=case when position('?' in split_part(p.product_url,'#',1))>0 then split_part(split_part(p.product_url,'#',1),'?',2) else '' end;
 foreach pair in array string_to_array(query,'&') loop if pair<>'' and split_part(pair,'=',1) not in ('matt_word','matt_tool','forceInApp') then kept:=array_append(kept,pair); end if; end loop;
 kept:=kept||array['matt_word='||garimpa.uri_component(c.tracking_id||'_'||p_slug),'matt_tool='||garimpa.uri_component(c.tool_id),'forceInApp=true'];
 return query select (base||'?'||array_to_string(kept,'&')||fragment)::text,f.publication_id::text,f.tenant_id::text;
end $$;

revoke all on function garimpa.public_offer_rows(text),garimpa.public_deal_detail(text),garimpa.public_catalog(text,jsonb),garimpa.public_campaign_link(text,text),garimpa.public_monetized_target(text),garimpa.uri_component(text) from public,anon,authenticated;
grant execute on function garimpa.public_offer_rows(text),garimpa.public_deal_detail(text),garimpa.public_catalog(text,jsonb),garimpa.public_campaign_link(text,text),garimpa.public_monetized_target(text) to garimpa_public_runtime;

-- Tenant equality alone does not establish kit/campaign/revision ownership.
alter table garimpa.commercial_kit add unique(id,campaign_id,tenant_id);
alter table garimpa.commercial_kit_revision add unique(id,kit_id,tenant_id);
alter table garimpa.kit_validation add unique(id,revision_id,tenant_id);
alter table garimpa.campaign_publication add foreign key(kit_id,campaign_id,tenant_id)
 references garimpa.commercial_kit(id,campaign_id,tenant_id);
alter table garimpa.campaign_publication add foreign key(kit_revision_id,kit_id,tenant_id)
 references garimpa.commercial_kit_revision(id,kit_id,tenant_id);
alter table garimpa.kit_approval add foreign key(validation_id,revision_id,tenant_id)
 references garimpa.kit_validation(id,revision_id,tenant_id);

-- Existing four-character links retain a public, eligibility-checked resolver.
create or replace function garimpa.public_short_link(p_code text,p_tenant text)
returns text language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select s.slug from garimpa.short_link s join garimpa.public_offer_rows(p_tenant) f on f.slug=s.slug and f.tenant_id=s.tenant_id
 where s.code=p_code and (p_tenant is null or s.tenant_id=p_tenant) limit 1;
$$;
revoke all on function garimpa.public_short_link(text,text) from public,anon,authenticated;
grant execute on function garimpa.public_short_link(text,text) to garimpa_public_runtime;

create or replace function garimpa.public_catalog_stats(p_tenant text,p_days int)
returns jsonb language sql stable security definer set search_path=pg_catalog,garimpa as $$
 with rows as (select f.* from garimpa.public_offer_rows(p_tenant) f join garimpa.product p on p.id=f.id and p.tenant_id=f.tenant_id
  where p.last_seen_at>=now()-least(7,greatest(1,p_days))*interval '1 day'),
 categories as(select category,count(*)::int as count,sum(coalesce(sales_count,0))::bigint as "totalSales",sum(price_cents)::bigint as "sumPriceCents" from rows where category is not null group by category)
 select jsonb_build_object('categories',coalesce((select jsonb_agg(category order by category) from categories),'[]'::jsonb),
 'marketplaces',coalesce((select jsonb_object_agg(m,n) from (select marketplace m,count(*)::int n from rows group by marketplace) counts),'{}'::jsonb),
 'categoryStats',coalesce((select jsonb_agg(c) from categories c),'[]'::jsonb));
$$;
revoke all on function garimpa.public_catalog_stats(text,int) from public,anon,authenticated;
grant execute on function garimpa.public_catalog_stats(text,int) to garimpa_public_runtime;

create or replace function garimpa.public_mint_short_link(p_slug text,p_tenant text,p_code text)
returns text language plpgsql security definer set search_path=pg_catalog,garimpa as $$
declare result text; begin
 if p_code !~ '^[abcdefghjkmnpqrtuvwxyz2346789]{4}$' or not exists(select 1 from garimpa.public_offer_rows(p_tenant) where slug=p_slug) then return null; end if;
 select code into result from garimpa.short_link where slug=p_slug and tenant_id=p_tenant;
 if found then return result; end if;
 insert into garimpa.short_link(code,tenant_id,slug) values(p_code,p_tenant,p_slug) on conflict do nothing;
 select code into result from garimpa.short_link where slug=p_slug and tenant_id=p_tenant;
 return result;
end $$;
revoke all on function garimpa.public_mint_short_link(text,text,text) from public,anon,authenticated;
grant execute on function garimpa.public_mint_short_link(text,text,text) to garimpa_public_runtime;

create or replace function garimpa.public_hero_candidates(p_tenant text)
returns jsonb language sql stable security definer set search_path=pg_catalog,garimpa as $$
 select coalesce(jsonb_agg(to_jsonb(f)-'tenant_id'-'publication_id'),'[]'::jsonb)
 from garimpa.public_offer_rows(p_tenant) f where image_url is not null;
$$;
revoke all on function garimpa.public_hero_candidates(text) from public,anon,authenticated;
grant execute on function garimpa.public_hero_candidates(text) to garimpa_public_runtime;

-- Adopted source: 20261014106000_garimpa_commercial_financial_ledger.sql sha256=64e3695d1defc2dc28b69fa61f3ea2eea71a2d8bffb3f4aac0475079618ed038
-- M-08: Ledger Financeiro Comercial, Conversões, Comissões e Receita SaaS (EP-08 / C-07).

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

-- Adopted source: 20261014107000_garimpa_click_attribution_and_channels.sql sha256=45da44abba0327b4d7c78c39f3f9ba29040f937ff291a6f9aa2961ba27686da9
-- M-07: Atribuição de Cliques e Canais de Distribuição (EP-07 / C-06).
-- Adiciona colunas nullable e índices em garimpa.click_event para vincular cliques a publicações sociais e links de campanha.

alter table garimpa.click_event
  add column if not exists campaign_publication_id text,
  add column if not exists campaign_link_id text,
  add column if not exists classification text default 'observed' check (classification in ('observed', 'known_preview', 'unknown')),
  add column if not exists classifier_version text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'click_event_campaign_publication_fk'
  ) then
    alter table garimpa.click_event
      add constraint click_event_campaign_publication_fk
      foreign key (campaign_publication_id, tenant_id)
      references garimpa.campaign_publication(id, tenant_id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'click_event_campaign_link_fk'
  ) then
    alter table garimpa.click_event
      add constraint click_event_campaign_link_fk
      foreign key (campaign_link_id, tenant_id)
      references garimpa.campaign_link(id, tenant_id) on delete set null;
  end if;
end $$;

create index if not exists click_event_campaign_pub_idx
  on garimpa.click_event (tenant_id, campaign_publication_id);

create index if not exists click_event_campaign_link_idx
  on garimpa.click_event (tenant_id, campaign_link_id);

-- Limited public telemetry writer: resolves ownership again, never accepts tenant ids.
create or replace function garimpa.record_public_click(p_slug text,p_code text,p_agent text,p_referer text,p_ip_hash text)
returns boolean language plpgsql security definer set search_path=pg_catalog,garimpa as $$
declare target record; link record; begin
 select null::text as social_publication_id,null::text as link_id into link;
 select * into target from garimpa.public_monetized_target(p_slug);
 if not found then return false; end if;
 if p_code is not null then
  select * into link from garimpa.public_campaign_link(p_code,p_slug);
  if not found or link.web_publication_id<>target.publication_id or link.tenant_id<>target.tenant_id then return false; end if;
 end if;
 insert into garimpa.click_event(id,tenant_id,publication_id,campaign_publication_id,campaign_link_id,user_agent,referer,ip_hash)
 values(gen_random_uuid()::text,target.tenant_id,target.publication_id,link.social_publication_id,link.link_id,left(p_agent,500),left(p_referer,2000),left(p_ip_hash,64));
 return true;
end $$;
revoke all on function garimpa.record_public_click(text,text,text,text,text) from public,anon,authenticated;
grant execute on function garimpa.record_public_click(text,text,text,text,text) to garimpa_public_runtime;

-- Adopted source: 20261014108000_garimpa_policy_experiments.sql sha256=4dee052305d5d0d10a73e7139de358f2bfc9af54b9de5ae53dec4cb7e12e0f08
-- M-09: Experimentos de Políticas Editoriais e Métricas de Coorte (EP-09 / C-08).

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

-- Adopted source: 20261014109000_garimpa_dispatch_jobs_outbox.sql sha256=89165a429250169ec34f11bd7db62d306fdcb429aacaa70ac6bb9a0e481225ff
-- M-11: Fila Transacional de Disparo e Agendamento Assistido (EP-11 / C-08).

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

-- Adopted source: 20261014110000_garimpa_saas_onboarding_entitlements.sql sha256=0c247052eb42a56ac97edf845fda5d548f0c7194d5745d4d51ed2739d9978a7b
-- M-12: Onboarding SaaS, Entitlements e Limites de Uso (EP-12 / C-08).

alter type garimpa.app_role add value if not exists 'platform_admin';

-- Account ID and tenant must identify the same account, including for privileged writers.
alter table garimpa.affiliate_account
  add constraint affiliate_account_id_tenant_key unique (id, tenant_id);

create table if not exists garimpa.account_entitlement (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  affiliate_id text not null,
  plan_version text not null,
  status text not null check (status in ('pilot', 'active', 'suspended', 'ended')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  limits jsonb not null default '{}'::jsonb,
  terms_ref text not null,
  created_at timestamptz not null default now(),
  constraint account_entitlement_account_tenant_fkey foreign key (affiliate_id, tenant_id)
    references garimpa.affiliate_account(id, tenant_id) on delete cascade
);

create table if not exists garimpa.account_invitation (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  affiliate_id text not null,
  token_hash text not null unique,
  invited_email text not null,
  role text not null check (role in ('owner', 'operator')),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_app_user_id text,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint account_invitation_account_tenant_fkey foreign key (affiliate_id, tenant_id)
    references garimpa.affiliate_account(id, tenant_id) on delete cascade
);

create table if not exists garimpa.onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  affiliate_id text not null,
  step text not null,
  status text not null check (status in ('pending', 'in_progress', 'completed', 'skipped')),
  evidence_ref text,
  updated_at timestamptz not null default now(),
  constraint onboarding_progress_unique_step unique (affiliate_id, step),
  constraint onboarding_progress_account_tenant_fkey foreign key (affiliate_id, tenant_id)
    references garimpa.affiliate_account(id, tenant_id) on delete cascade
);

create table if not exists garimpa.usage_event (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  operation text not null,
  idempotency_key text not null,
  quantity integer not null default 1,
  occurred_at timestamptz not null default now(),
  constraint usage_event_unique_idempotency unique (tenant_id, operation, idempotency_key)
);

create table if not exists garimpa.account_lifecycle_event (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  affiliate_id text not null,
  event_type text not null,
  actor_app_user_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint account_lifecycle_event_account_tenant_fkey foreign key (affiliate_id, tenant_id)
    references garimpa.affiliate_account(id, tenant_id) on delete cascade
);

-- Grants
revoke all on
  garimpa.account_entitlement,
  garimpa.account_invitation,
  garimpa.onboarding_progress,
  garimpa.usage_event,
  garimpa.account_lifecycle_event
from public, anon, authenticated;

grant select, insert, update on
  garimpa.account_entitlement,
  garimpa.account_invitation,
  garimpa.onboarding_progress
to garimpa_app;

grant select, insert on
  garimpa.usage_event,
  garimpa.account_lifecycle_event
to garimpa_app;

-- Ativar RLS
alter table garimpa.account_entitlement enable row level security;
alter table garimpa.account_invitation enable row level security;
alter table garimpa.onboarding_progress enable row level security;
alter table garimpa.usage_event enable row level security;
alter table garimpa.account_lifecycle_event enable row level security;

-- Policies de isolamento multi-tenant
drop policy if exists account_invitation_tenant_isolation on garimpa.account_invitation;
drop policy if exists account_invitation_tenant_manage on garimpa.account_invitation;
drop policy if exists account_invitation_token_lookup on garimpa.account_invitation;
drop policy if exists account_invitation_token_claim on garimpa.account_invitation;
drop policy if exists account_invitation_platform_manage on garimpa.account_invitation;

-- CF-01: Sem tenant ativo ou platform_admin, convites não podem ser lidos ou alterados
create policy account_invitation_tenant_manage on garimpa.account_invitation
  for all to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''))
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

create policy account_invitation_platform_manage on garimpa.account_invitation
  for all to garimpa_app
  using (nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role'))
  with check (nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role'));

-- Policies de isolamento multi-tenant para planos / entitlements
drop policy if exists account_entitlement_tenant_isolation on garimpa.account_entitlement;
drop policy if exists account_entitlement_tenant_read on garimpa.account_entitlement;
create policy account_entitlement_tenant_read on garimpa.account_entitlement
  for select to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

-- CF-01: Sem platform_admin, planos não podem ser criados ou alterados (removido bypass de membership_role null)
drop policy if exists account_entitlement_platform_manage on garimpa.account_entitlement;
create policy account_entitlement_platform_manage on garimpa.account_entitlement
  for all to garimpa_app
  using (nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role'))
  with check (nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role'));

drop policy if exists onboarding_progress_tenant_isolation on garimpa.onboarding_progress;
create policy onboarding_progress_tenant_isolation on garimpa.onboarding_progress
  for all to garimpa_app
  using (
    tenant_id = nullif(current_setting('garimpa.tenant_id', true), '')
    or nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role')
  )
  with check (
    tenant_id = nullif(current_setting('garimpa.tenant_id', true), '')
    or nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role')
  );

drop policy if exists usage_event_tenant_isolation on garimpa.usage_event;
drop policy if exists usage_event_tenant_read on garimpa.usage_event;
create policy usage_event_tenant_read on garimpa.usage_event
  for select to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

drop policy if exists usage_event_tenant_insert on garimpa.usage_event;
create policy usage_event_tenant_insert on garimpa.usage_event
  for insert to garimpa_app
  with check (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

drop policy if exists account_lifecycle_event_tenant_read on garimpa.account_lifecycle_event;
create policy account_lifecycle_event_tenant_read on garimpa.account_lifecycle_event
  for select to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

drop policy if exists account_lifecycle_event_platform_insert on garimpa.account_lifecycle_event;
create policy account_lifecycle_event_platform_insert on garimpa.account_lifecycle_event
  for insert to garimpa_app
  with check (
    tenant_id = nullif(current_setting('garimpa.tenant_id', true), '')
    or nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role')
  );

-- Permitir concessão de membership via convite verificado (com token de uso único) ou platform_admin
drop policy if exists affiliate_membership_claim_or_manage on garimpa.affiliate_membership;
create policy affiliate_membership_claim_or_manage on garimpa.affiliate_membership
  for all to garimpa_app
  using (
    nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role')
    or current_setting('garimpa.invitation_claim', true) = 'active'
  )
  with check (
    nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role')
    or current_setting('garimpa.invitation_claim', true) = 'active'
  );

-- Permitir concessão estrita de papel base 'afiliado' durante aceite de convite ou por platform_admin
drop policy if exists app_user_role_claim_or_platform on garimpa.app_user_role;
create policy app_user_role_claim_or_platform on garimpa.app_user_role
  for insert to garimpa_app
  with check (
    (current_setting('garimpa.invitation_claim', true) = 'active' and role = 'afiliado')
    or nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role')
  );

-- CF-13 / CF-14: Rotina segura (SECURITY DEFINER) para aceite atômico de convite de conta.
-- Valida identidade autenticada, email e token único; concede membership e role base 'afiliado'
-- sob isolamento estrito sem exigir permissões DML amplas para garimpa_app em app_user_role.
create or replace function garimpa.accept_account_invitation(
  p_token_hash text,
  p_actor_app_user_id text,
  p_auth_user_id text,
  p_verified_email text
)
returns table (
  accepted boolean,
  tenant_id text,
  affiliate_id text,
  role text
)
language plpgsql
security definer
set search_path = garimpa, pg_catalog, pg_temp
as $$
#variable_conflict use_column
declare
  v_invitation record;
  v_user_auth_id text;
begin
  if not garimpa.commercial_rollout_ready() then raise exception 'commercial_rollout_not_ready'; end if;
  if p_actor_app_user_id is null or p_auth_user_id is null or p_verified_email is null then
    raise exception 'unauthenticated_identity_required';
  end if;

  select auth_user_id into v_user_auth_id
  from garimpa.app_user
  where id = p_actor_app_user_id;

  if v_user_auth_id is null or v_user_auth_id <> p_auth_user_id then
    raise exception 'identity_mismatch_forbidden';
  end if;

  select * into v_invitation
  from garimpa.account_invitation
  where token_hash = p_token_hash
  for update;

  if v_invitation.id is null then
    raise exception 'invitation_not_found';
  end if;

  if v_invitation.used_at is not null then
    raise exception 'invitation_already_used_or_disputed';
  end if;

  if v_invitation.expires_at <= now() then
    raise exception 'invitation_invalid:INVITATION_EXPIRED';
  end if;

  -- Definer code must independently reject a mismatched or suspended account.
  perform 1 from garimpa.affiliate_account a
  where a.id = v_invitation.affiliate_id and a.tenant_id = v_invitation.tenant_id
    and a.status = 'active'
  for share;
  if not found then
    raise exception 'invitation_account_unavailable';
  end if;

  if lower(trim(v_invitation.invited_email)) <> lower(trim(p_verified_email)) then
    raise exception 'invitation_email_mismatch';
  end if;

  update garimpa.account_invitation
  set used_at = now(),
      used_by_app_user_id = p_actor_app_user_id
  where id = v_invitation.id;

  insert into garimpa.affiliate_membership (affiliate_id, app_user_id, role)
  values (v_invitation.affiliate_id, p_actor_app_user_id, v_invitation.role::text)
  on conflict (affiliate_id, app_user_id) do update
  set role = excluded.role, revoked_at = null;

  insert into garimpa.app_user_role (app_user_id, role)
  values (p_actor_app_user_id, 'afiliado'::garimpa.app_role)
  on conflict (app_user_id, role) do update
  set revoked_at = null;

  insert into garimpa.account_lifecycle_event (tenant_id, affiliate_id, event_type, actor_app_user_id, payload)
  values (
    v_invitation.tenant_id,
    v_invitation.affiliate_id,
    'invitation_accepted',
    p_actor_app_user_id,
    jsonb_build_object('role', v_invitation.role, 'invitation_id', v_invitation.id)
  );

  return query select true, v_invitation.tenant_id, v_invitation.affiliate_id, v_invitation.role;
end;
$$;

revoke all on function garimpa.accept_account_invitation(text, text, text, text) from public, anon, authenticated;
grant execute on function garimpa.accept_account_invitation(text, text, text, text) to garimpa_app;


-- Final relational/immutability audit of the installed commercial surface.
-- It changes no historical data. Every tenant remains owned by an account.
do $$ declare r record; begin
 for r in select unnest(array['account_entitlement','account_invitation','account_lifecycle_event','affiliate_secret','analysis_assessment','app_user','audience_policy','audience_policy_version','buyer_profile','campaign','campaign_link','campaign_publication','capture_batch','capture_run','click_event','commercial_kit','commercial_kit_revision','commission_entry','comparison_review','conversion','conversion_attribution','curation_event','destination','dispatch_attempt','dispatch_job','domain_event','editorial_assessment','editorial_guideline','editorial_selection','editorial_selection_item','experiment_assignment','experiment_evaluation','favorite','import_batch','import_row','kit_approval','kit_validation','onboarding_progress','operational_cost','opportunity','policy_experiment','price_evidence_policy_version','price_observation','price_watch','product','product_curation','publication','saas_revenue_entry','short_link','subscriber','triage_run','usage_event']::text[]) as table_name loop
  if not exists(select 1 from pg_constraint k where k.conrelid=format('garimpa.%I',r.table_name)::regclass and k.contype='f'
    and k.confrelid='garimpa.affiliate_account'::regclass
    and k.conkey=array[(select attnum from pg_attribute where attrelid=k.conrelid and attname='tenant_id')]::smallint[]) then
   execute format('alter table garimpa.%I add constraint %I foreign key(tenant_id) references garimpa.affiliate_account(tenant_id) on delete restrict',r.table_name,r.table_name||'_account_tenant_fk');
  end if;
  execute format('drop trigger if exists trg_prevent_tenant_mutation on garimpa.%I',r.table_name);
  execute format('create trigger trg_prevent_tenant_mutation before update on garimpa.%I for each row execute function garimpa.prevent_tenant_mutation()',r.table_name);
 end loop;
end $$;

-- Permitir que platform_admin gerencie e provisione affiliate_account
drop policy if exists affiliate_account_platform_manage on garimpa.affiliate_account;
create policy affiliate_account_platform_manage on garimpa.affiliate_account
  for all to garimpa_app
  using (nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role'))
  with check (nullif(current_setting('garimpa.platform_role', true), '') in ('platform_admin', 'service_role'));

-- A later migration must not re-enable access to a suspended account.
do $$ declare r record; begin
 for r in select unnest(array['account_entitlement','account_invitation','affiliate_secret','analysis_assessment','app_user','audience_policy','audience_policy_version','buyer_profile','campaign','campaign_link','campaign_publication','capture_batch','capture_run','click_event','commercial_kit','commercial_kit_revision','commission_entry','comparison_review','conversion','conversion_attribution','curation_event','destination','dispatch_attempt','dispatch_job','domain_event','editorial_assessment','editorial_guideline','editorial_selection','editorial_selection_item','experiment_assignment','experiment_evaluation','favorite','import_batch','import_row','kit_approval','kit_validation','onboarding_progress','operational_cost','opportunity','policy_experiment','price_evidence_policy_version','price_observation','price_watch','product','product_curation','publication','saas_revenue_entry','short_link','subscriber','triage_run','usage_event']::text[]) as table_name loop
  execute format('create policy %I on garimpa.%I as restrictive for all to garimpa_app using(garimpa.active_tenant(tenant_id) or nullif(current_setting(''garimpa.platform_role'', true), '''') in (''platform_admin'', ''service_role'')) with check(garimpa.active_tenant(tenant_id) or nullif(current_setting(''garimpa.platform_role'', true), '''') in (''platform_admin'', ''service_role''))',r.table_name||'_active_account',r.table_name);
 end loop;
end $$;

-- Adopted source: 20261015021300_garimpa_verified_workflows.sql sha256=f2566ff5f61b5ad605bb28ae40ed7062e81f773ca3937fe22311730525182038
-- Recovery: disable new capabilities, keep append-only evidence, restore compatible code.
-- Never delete assessments, ledger events, reservations or artifacts to roll back.
alter table garimpa.editorial_assessment add column review_key text;
alter table garimpa.editorial_assessment add column review_digest text;
-- Preserve any historical repeated comparisons; uniqueness governs verified writes after this expansion.
alter table garimpa.comparison_review add column canonical_write boolean not null default false;
alter table garimpa.comparison_review alter column canonical_write set default true;
create unique index comparison_review_pair_idx on garimpa.comparison_review(tenant_id,analysis_assessment_id,editorial_assessment_id) where canonical_write and editorial_assessment_id is not null;
create unique index editorial_review_request_idx on garimpa.editorial_assessment(tenant_id,review_key) where review_key is not null;

create table garimpa.governance_decision (
 id uuid primary key default gen_random_uuid(),
 tenant_id text not null references garimpa.affiliate_account(tenant_id),
 kind text not null check(kind in ('rubric','price')),
 subject_version text not null,
 method jsonb not null,
 evidence_ids jsonb not null check(jsonb_typeof(evidence_ids)='array'),
 approved_by text not null references garimpa.app_user(id),
 rationale text not null check(length(trim(rationale))>0),
 approved_at timestamptz not null default clock_timestamp(),
 unique(id,tenant_id)
);
create table garimpa.price_calibration_run (
 id uuid primary key default gen_random_uuid(),
 tenant_id text not null references garimpa.affiliate_account(tenant_id),
 policy_version text not null,
 observation_ids jsonb not null check(jsonb_array_length(observation_ids)>0),
 results jsonb not null,
 policy_snapshot jsonb not null,
 policy_digest text not null check(length(policy_digest)=64),
 source_ref text not null,
 synthetic boolean not null,
 reviewed_by text not null references garimpa.app_user(id),
 reviewed_at timestamptz not null default clock_timestamp(),
 unique(id,tenant_id)
);
alter table garimpa.price_evidence_policy_version add column calibration_run_id uuid;
alter table garimpa.price_evidence_policy_version add foreign key(calibration_run_id,tenant_id) references garimpa.price_calibration_run(id,tenant_id);

create table garimpa.private_artifact (
 id uuid primary key default gen_random_uuid(), tenant_id text not null references garimpa.affiliate_account(tenant_id),
 kind text not null check(kind in ('commission_original','kit_asset','kit_render','account_evidence')),
 object_path text not null unique, sha256 text not null check(length(sha256)=64),
 mime_type text not null, byte_size integer not null check(byte_size>0),
 original_name text not null, status text not null check(status in ('pending','ready','orphaned')),
 owner_ref text, rights jsonb not null default '{}', created_by text not null references garimpa.app_user(id),
 created_at timestamptz not null default clock_timestamp(), unique(id,tenant_id)
);
alter table garimpa.import_batch add column artifact_id uuid;
alter table garimpa.import_batch add foreign key(artifact_id,tenant_id) references garimpa.private_artifact(id,tenant_id);
alter table garimpa.import_batch add column commit_digest text;

alter table garimpa.policy_experiment alter column min_sample drop default;
alter table garimpa.policy_experiment add column methodology jsonb;
alter table garimpa.policy_experiment add column method_approved_by text references garimpa.app_user(id);
alter table garimpa.policy_experiment add column method_approved_at timestamptz;
alter table garimpa.policy_experiment add column reviewed_by text references garimpa.app_user(id);
alter table garimpa.policy_experiment add column review_notes text;
alter table garimpa.policy_experiment add column reviewed_at timestamptz;
alter table garimpa.experiment_assignment drop constraint experiment_assignment_variant_check;
alter table garimpa.experiment_assignment add check(variant in ('baseline','candidate','paired'));
alter table garimpa.experiment_assignment add column input_digest text;
alter table garimpa.experiment_assignment add column input_snapshot jsonb;
alter table garimpa.experiment_evaluation add foreign key(tenant_id,experiment_id,unit_id)
 references garimpa.experiment_assignment(tenant_id,experiment_id,unit_id) not valid;
-- Existing unassigned legacy evaluations stay historical; promotion only counts new eligible pairs.
revoke update,delete on garimpa.experiment_assignment,garimpa.experiment_evaluation from garimpa_app;

create table garimpa.dispatch_control (
 tenant_id text primary key references garimpa.affiliate_account(tenant_id),
 kill_switch boolean not null default true, configuration jsonb not null,
 updated_by text not null references garimpa.app_user(id), updated_at timestamptz not null default clock_timestamp()
);
-- dispatch_job(id,tenant_id) is already unique from the outbox foundation.
create table garimpa.dispatch_reservation (
 id uuid primary key default gen_random_uuid(), tenant_id text not null references garimpa.affiliate_account(tenant_id),
 job_id uuid not null, audience_key text not null, channel text not null,
 window_start timestamptz not null, window_end timestamptz not null,
 state text not null check(state in ('reserved','started','sent','unknown','released')),
 created_at timestamptz not null default clock_timestamp(), unique(tenant_id,job_id),
 foreign key(job_id,tenant_id) references garimpa.dispatch_job(id,tenant_id),
 check(window_end>window_start)
);
create index dispatch_reservation_window_idx on garimpa.dispatch_reservation(tenant_id,channel,window_start,window_end);

do $$ declare t text; begin
 foreach t in array array['governance_decision','price_calibration_run','private_artifact','dispatch_control','dispatch_reservation'] loop
  execute format('revoke all on garimpa.%I from public,anon,authenticated',t);
  execute format('grant select,insert on garimpa.%I to garimpa_app',t);
  execute format('alter table garimpa.%I enable row level security',t);
  execute format('create policy tenant_read on garimpa.%I for select to garimpa_app using(tenant_id=nullif(current_setting(''garimpa.tenant_id'',true),''''))',t);
  execute format('create policy tenant_write on garimpa.%I for insert to garimpa_app with check(tenant_id=nullif(current_setting(''garimpa.tenant_id'',true),''''))',t);
  execute format('create policy active_account on garimpa.%I as restrictive for all to garimpa_app using(garimpa.active_tenant(tenant_id)) with check(garimpa.active_tenant(tenant_id))',t);
  execute format('create trigger prevent_tenant_mutation before update on garimpa.%I for each row execute function garimpa.prevent_tenant_mutation()',t);
 end loop;
 foreach t in array array['governance_decision','price_calibration_run','dispatch_control'] loop
  execute format('create policy owner_write on garimpa.%I as restrictive for insert to garimpa_app with check(current_setting(''garimpa.membership_role'',true)=''owner'')',t);
 end loop;
end $$;
grant update on garimpa.dispatch_control,garimpa.dispatch_reservation to garimpa_app;
grant update(status) on garimpa.private_artifact to garimpa_app;
create policy artifact_update on garimpa.private_artifact for update to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'')) with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''));
create policy control_update on garimpa.dispatch_control for update to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and current_setting('garimpa.membership_role',true)='owner')
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and current_setting('garimpa.membership_role',true)='owner');
create policy reservation_update on garimpa.dispatch_reservation for update to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'')) with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''));

-- Supabase Storage is private; only backend service credentials access object bytes.
-- Local SQL fixture has no storage schema; storage behavior is separately adapter-tested.
do $$ begin
 if to_regclass('storage.buckets') is not null then
  execute $s$insert into storage.buckets(id,name,public) values('bizuminer-private','bizuminer-private',false) on conflict(id) do nothing$s$;
  if exists(select 1 from storage.buckets where id='bizuminer-private' and public) then raise exception 'private_bucket_is_public'; end if;
 end if;
end $$;


-- An old approval without a verifiable calibration never grants E3 to any consumer.
create view garimpa.effective_price_evidence_policy with(security_invoker=true) as
select p.id,p.tenant_id,p.version,p.status,p.created_at,
 jsonb_set(p.config,'{e3Enabled}',to_jsonb(coalesce(p.config->>'e3Enabled'='true',false) and exists(
  select 1 from garimpa.price_calibration_run c where c.id=p.calibration_run_id and c.tenant_id=p.tenant_id
   and c.policy_version=p.version and c.synthetic=false and c.policy_snapshot=p.config
   and c.results->>'experiment'='EXP-02' and c.results->>'reviewed'='true' and c.results->>'pass'='true'
  ))) as config
from garimpa.price_evidence_policy_version p;
revoke all on garimpa.effective_price_evidence_policy from public,anon,authenticated;
grant select on garimpa.effective_price_evidence_policy to garimpa_app;

create or replace view garimpa.curation_queue_facts with(security_invoker=true) as
with latest as (
 select distinct on(product_id) * from garimpa.price_observation order by product_id,observed_at desc,id desc
), policy as (
 select distinct on(tenant_id) tenant_id,config from garimpa.effective_price_evidence_policy
 where status='approved' order by tenant_id,created_at desc,id desc
), first_run as (
 select distinct on(product_id) product_id,capture_run_id from garimpa.price_observation where capture_run_id is not null order by product_id,observed_at,id
)
select p.id,p.tenant_id,p.marketplace,p.external_id,p.title,p.product_url,p.image_url,p.category,p.last_seen_at,
 p.family_key,p.family_label,p.family_method,p.family_version,c.status,c.reason_code,c.reason_detail,c.deferred_until,c.created_at as queued_at,
 l.price_cents,l.original_price_cents,l.claimed_discount_rate,l.rating_star,l.sales_label,l.sales_count,l.observed_at,
 totals.observation_count,totals.history_days,prior.previous_min_price_cents,
 (coalesce((pol.config->>'e3Enabled')::boolean,false)
   and l.observed_at<=now() and now()<l.observed_at+(coalesce((pol.config->>'maxAgeHours')::numeric,48)*interval '1 hour')
   and l.price_cents>0 and prior.comparable_count>=coalesce((pol.config->>'minimumPriorCount')::int,3)
   and prior.distinct_days>=coalesce((pol.config->>'minimumDistinctDays')::int,3)
   and prior.covered_buckets::numeric / greatest(1,ceil(cfg.window_days*24/cfg.bucket_hours)) >=coalesce((pol.config->>'minimumCoverageRatio')::numeric,0.7)
   and gaps.max_gap<=coalesce((pol.config->>'maximumGapHours')::numeric,72)
   and prior.previous_min_price_cents is not null and l.price_cents<=prior.previous_min_price_cents) as lowest_verified,
 fr.capture_run_id as presenting_capture_run_id,run.marketplace as presenting_marketplace,
 run.parameters->>'capturePlanId' as presenting_plan_id,run.parameters->>'captureQueryId' as presenting_query_id,
 run.parameters->>'captureMode' as presenting_mode,run.parameters->>'targetCategory' as presenting_target_category,
 run.parameters->>'targetFamily' as presenting_target_family,
 run.parameters->>'executionId' as presenting_execution_id,run.collector_run_id as presenting_collector_run_id,run.started_at as presenting_captured_at
from garimpa.product p join garimpa.product_curation c on c.product_id=p.id and c.tenant_id=p.tenant_id
join latest l on l.product_id=p.id and l.tenant_id=p.tenant_id
left join policy pol on pol.tenant_id=p.tenant_id
cross join lateral(select greatest(1,coalesce((pol.config->>'windowDays')::numeric,30)) as window_days,
 greatest(0.01,coalesce((pol.config->>'bucketHours')::numeric,24)) as bucket_hours) cfg
cross join lateral(select count(*)::int as observation_count,
 floor(extract(epoch from(l.observed_at-min(o.observed_at)))/86400)::int as history_days
 from garimpa.price_observation o where o.product_id=p.id and o.tenant_id=p.tenant_id) totals
cross join lateral(
 with comparable as (
  select o.* from garimpa.price_observation o
  where o.product_id=p.id and o.tenant_id=p.tenant_id and o.id<>l.id and o.price_cents>0
   and o.observed_at<l.observed_at and o.observed_at>=l.observed_at-cfg.window_days*interval '1 day'
   and l.offer_evidence->>'currency' is not null and o.offer_evidence->>'currency'=l.offer_evidence->>'currency'
   and garimpa.offer_configuration_key(l.offer_evidence) is not null
   and garimpa.offer_configuration_key(o.offer_evidence)=garimpa.offer_configuration_key(l.offer_evidence)
 )
 select min(price_cents) as previous_min_price_cents,count(*)::int as comparable_count,
 count(distinct (observed_at at time zone 'UTC')::date)::int as distinct_days,
 count(distinct floor(extract(epoch from(observed_at-(l.observed_at-cfg.window_days*interval '1 day')))/(cfg.bucket_hours*3600)))::int as covered_buckets
 from comparable
) prior
cross join lateral(
 select max(extract(epoch from(next_time-observed_at))/3600) as max_gap from (
  select observed_at,lead(observed_at) over(order by observed_at) as next_time from (
   select l.observed_at-cfg.window_days*interval '1 day' as observed_at union all select l.observed_at
   union all select o.observed_at from garimpa.price_observation o
    where o.product_id=p.id and o.tenant_id=p.tenant_id and o.id<>l.id and o.price_cents>0
    and o.observed_at<l.observed_at and o.observed_at>=l.observed_at-cfg.window_days*interval '1 day'
    and l.offer_evidence->>'currency' is not null and o.offer_evidence->>'currency'=l.offer_evidence->>'currency'
    and garimpa.offer_configuration_key(l.offer_evidence) is not null
    and garimpa.offer_configuration_key(o.offer_evidence)=garimpa.offer_configuration_key(l.offer_evidence)
  ) points
 ) ordered
) gaps
left join first_run fr on fr.product_id=p.id
left join garimpa.capture_run run on run.id=fr.capture_run_id and run.tenant_id=p.tenant_id;

-- Approval of a frozen candidate does not activate it; only experiment promotion moves the pointer.
grant update(approved_by,approved_at) on garimpa.audience_policy_version to garimpa_app;
create policy audience_candidate_owner on garimpa.audience_policy_version as restrictive for update to garimpa_app
 using(current_setting('garimpa.membership_role',true)='owner')
 with check(current_setting('garimpa.membership_role',true)='owner');

-- Compatibility contract for existing monitoring workers. No individual buyer rows are exposed.
-- Worker GUCs are set only by the trusted backend, transaction-local, with no human owner identity.
create function garimpa.monitoring_interest_counts(p_tenant text)
returns table(product_id text,active_watches integer)
language plpgsql stable security definer set search_path=pg_catalog,garimpa as $$
begin
 if current_setting('garimpa.actor_type',true) is distinct from 'worker'
    or nullif(current_setting('garimpa.tenant_id',true),'') is null
    or current_setting('garimpa.tenant_id',true) is distinct from p_tenant then
  raise exception 'monitoring_worker_scope_required';
 end if;
 if not garimpa.active_tenant(p_tenant) then raise exception 'monitoring_account_unavailable'; end if;
 return query select interests.product_id,count(*)::integer from (
  select w.product_id from garimpa.price_watch w where w.tenant_id=p_tenant and w.active
  union all
  select f.product_id from garimpa.favorite f where f.tenant_id=p_tenant
 ) interests group by interests.product_id;
end $$;

create function garimpa.monitoring_account_state(p_tenant text,p_marketplace text)
returns table(affiliate_id text,account_status text,enabled boolean)
language plpgsql stable security definer set search_path=pg_catalog,garimpa as $$
begin
 if current_setting('garimpa.actor_type',true) is distinct from 'worker'
    or nullif(current_setting('garimpa.tenant_id',true),'') is null
    or current_setting('garimpa.tenant_id',true) is distinct from p_tenant then
  raise exception 'monitoring_worker_scope_required';
 end if;
 return query select a.id,a.status,p.enabled from garimpa.affiliate_account a
  left join garimpa.affiliate_monitoring_policy p on p.affiliate_id=a.id and p.marketplace=p_marketplace
  where a.tenant_id=p_tenant;
end $$;

create function garimpa.monitoring_record_skip(p_affiliate text,p_marketplace text,p_run text,p_reason text)
returns void language plpgsql security definer set search_path=pg_catalog,garimpa as $$
declare v_status text; v_enabled boolean;
begin
 if current_setting('garimpa.actor_type',true) is distinct from 'worker'
    or nullif(current_setting('garimpa.tenant_id',true),'') is null then
  raise exception 'monitoring_worker_scope_required';
 end if;
 if p_marketplace is null or p_marketplace not in ('mercadolivre','shopee','aliexpress')
    or nullif(trim(p_run),'') is null or p_reason is null or p_reason not in ('policy_disabled','account_suspended') then
  raise exception 'invalid_monitoring_skip';
 end if;
 select a.status,p.enabled into v_status,v_enabled from garimpa.affiliate_account a
 left join garimpa.affiliate_monitoring_policy p on p.affiliate_id=a.id and p.marketplace=p_marketplace
 where a.id=p_affiliate and a.tenant_id=current_setting('garimpa.tenant_id',true) for share of a;
 if not found then raise exception 'monitoring_affiliate_scope_mismatch'; end if;
 if (p_reason='account_suspended' and v_status='active') or
    (p_reason='policy_disabled' and (v_status<>'active' or coalesce(v_enabled,false))) then
  raise exception 'monitoring_skip_reason_mismatch';
 end if;
 insert into garimpa.affiliate_monitoring_skip(affiliate_id,marketplace,github_run_id,reason)
 values(p_affiliate,p_marketplace,p_run,p_reason)
 on conflict(affiliate_id,marketplace,github_run_id) do nothing;
end $$;
revoke all on function garimpa.monitoring_interest_counts(text),garimpa.monitoring_account_state(text,text),garimpa.monitoring_record_skip(text,text,text,text) from public,anon,authenticated;
grant execute on function garimpa.monitoring_interest_counts(text),garimpa.monitoring_account_state(text,text),garimpa.monitoring_record_skip(text,text,text,text) to garimpa_app;


-- These are pre-existing constraints from the original extension migration.
-- Refuse a different baseline; never create an index in production to hide drift.
do $guard$
declare column_name text;
begin
 foreach column_name in array array['token_hash','pairing_code_hash'] loop
  if not exists(select 1 from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=i.indkey[0]
   where i.indrelid='garimpa.extension_device'::regclass and i.indisunique and i.indisvalid and i.indisready
    and i.indpred is null and i.indexprs is null and i.indnkeyatts=1 and not i.indnullsnotdistinct and a.attname=column_name) then
   raise exception 'extension_unique_hash_required: %',column_name;
  end if;
 end loop;
end $guard$;

-- Preserve the existing extension protocol: eight-character one-use pairing
-- code and SHA-256 token hash. No raw token or credential is accepted/returned.
create function garimpa.exchange_extension_pairing(p_code_hash text,p_token_hash text,p_token_prefix text)
returns table(device_id text,display_name text)
language plpgsql security definer set search_path=pg_catalog set lock_timeout='5s'
as $$
declare v_device garimpa.extension_device%rowtype; v_allowed integer;
begin
 if p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' or
    p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' or
    p_token_prefix is null or p_token_prefix !~ '^bm_ext_[A-Za-z0-9_-]{8}$' then return; end if;
 select d.* into v_device from garimpa.extension_device d
  where d.pairing_code_hash=p_code_hash and d.pairing_expires_at>now() and d.token_hash is null and d.revoked_at is null for update;
 if not found then return; end if;
 select 1 into v_allowed from garimpa.affiliate_account a
  join garimpa.affiliate_membership m on m.affiliate_id=a.id
  join garimpa.app_user_role r on r.app_user_id=m.app_user_id
  where a.id=v_device.affiliate_id and a.status='active'
   and m.app_user_id=v_device.created_by_app_user_id and m.role='owner' and m.revoked_at is null
   and r.role='afiliado' and r.revoked_at is null for share of a,m,r;
 if not found then return; end if;
 return query update garimpa.extension_device d set token_hash=p_token_hash,token_prefix=p_token_prefix,
  pairing_code_hash=null,pairing_expires_at=null,paired_at=now()
  where d.id=v_device.id and d.pairing_code_hash=p_code_hash and d.pairing_expires_at>now()
   and d.token_hash is null and d.revoked_at is null
  returning d.id,(select a.display_name from garimpa.affiliate_account a where a.id=d.affiliate_id);
end $$;
revoke all on function garimpa.exchange_extension_pairing(text,text,text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.exchange_extension_pairing(text,text,text) to garimpa_app;

-- A device can only mark its own use. No owner impersonation or general UPDATE grant.
create function garimpa.touch_extension_device(p_device_id text)
returns boolean language plpgsql security definer set search_path=pg_catalog
as $$
declare affected integer;
begin
 if current_setting('garimpa.actor_type',true) is distinct from 'device' then return false; end if;
 update garimpa.extension_device d set last_used_at=now()
 where d.id=p_device_id and d.revoked_at is null and d.token_hash is not null
   and d.created_by_app_user_id=nullif(current_setting('garimpa.actor_app_user_id',true),'')
   and exists(select 1 from garimpa.affiliate_account a
    join garimpa.affiliate_membership m on m.affiliate_id=a.id and m.app_user_id=d.created_by_app_user_id
    join garimpa.app_user_role r on r.app_user_id=m.app_user_id
    where a.id=d.affiliate_id and a.tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and a.status='active'
     and m.revoked_at is null and r.role='afiliado' and r.revoked_at is null);
 get diagnostics affected=row_count; return affected=1;
end $$;
revoke all on function garimpa.touch_extension_device(text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.touch_extension_device(text) to garimpa_app;


-- Normalize ONLY new-table privileges: production defaults grant unintended UPDATE/DELETE.
revoke all on garimpa."account_entitlement" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."account_entitlement" to garimpa_app;
revoke all on garimpa."account_invitation" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."account_invitation" to garimpa_app;
revoke all on garimpa."account_lifecycle_event" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert on garimpa."account_lifecycle_event" to garimpa_app;
revoke all on garimpa."analysis_assessment" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert on garimpa."analysis_assessment" to garimpa_app;
revoke all on garimpa."audience_policy" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."audience_policy" to garimpa_app;
revoke all on garimpa."audience_policy_version" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
revoke all ("approved_at") on garimpa."audience_policy_version" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
revoke all ("approved_by") on garimpa."audience_policy_version" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert on garimpa."audience_policy_version" to garimpa_app;
grant update ("approved_at") on garimpa."audience_policy_version" to garimpa_app;
grant update ("approved_by") on garimpa."audience_policy_version" to garimpa_app;
revoke all on garimpa."campaign" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."campaign" to garimpa_app;
revoke all on garimpa."campaign_link" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."campaign_link" to garimpa_app;
revoke all on garimpa."campaign_publication" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."campaign_publication" to garimpa_app;
revoke all on garimpa."commercial_kit" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."commercial_kit" to garimpa_app;
revoke all on garimpa."commercial_kit_revision" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert on garimpa."commercial_kit_revision" to garimpa_app;
revoke all on garimpa."commission_entry" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert on garimpa."commission_entry" to garimpa_app;
revoke all on garimpa."comparison_review" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert on garimpa."comparison_review" to garimpa_app;
revoke all on garimpa."conversion" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."conversion" to garimpa_app;
revoke all on garimpa."conversion_attribution" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."conversion_attribution" to garimpa_app;
revoke all on garimpa."destination" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."destination" to garimpa_app;
revoke all on garimpa."dispatch_attempt" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."dispatch_attempt" to garimpa_app;
revoke all on garimpa."dispatch_control" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."dispatch_control" to garimpa_app;
revoke all on garimpa."dispatch_job" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."dispatch_job" to garimpa_app;
revoke all on garimpa."dispatch_reservation" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."dispatch_reservation" to garimpa_app;
revoke all on garimpa."domain_event" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert on garimpa."domain_event" to garimpa_app;
revoke all on garimpa."experiment_assignment" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert on garimpa."experiment_assignment" to garimpa_app;
revoke all on garimpa."experiment_evaluation" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert on garimpa."experiment_evaluation" to garimpa_app;
revoke all on garimpa."governance_decision" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert on garimpa."governance_decision" to garimpa_app;
revoke all on garimpa."import_batch" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."import_batch" to garimpa_app;
revoke all on garimpa."import_row" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."import_row" to garimpa_app;
revoke all on garimpa."kit_approval" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert on garimpa."kit_approval" to garimpa_app;
revoke all on garimpa."kit_validation" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert on garimpa."kit_validation" to garimpa_app;
revoke all on garimpa."onboarding_progress" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."onboarding_progress" to garimpa_app;
revoke all on garimpa."operational_cost" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert on garimpa."operational_cost" to garimpa_app;
revoke all on garimpa."opportunity" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."opportunity" to garimpa_app;
revoke all on garimpa."policy_experiment" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."policy_experiment" to garimpa_app;
revoke all on garimpa."price_calibration_run" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert on garimpa."price_calibration_run" to garimpa_app;
revoke all on garimpa."price_evidence_policy_version" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert,update on garimpa."price_evidence_policy_version" to garimpa_app;
revoke all on garimpa."private_artifact" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
revoke all ("status") on garimpa."private_artifact" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert on garimpa."private_artifact" to garimpa_app;
grant update ("status") on garimpa."private_artifact" to garimpa_app;
revoke all on garimpa."saas_revenue_entry" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert on garimpa."saas_revenue_entry" to garimpa_app;
revoke all on garimpa."usage_event" from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select,insert on garimpa."usage_event" to garimpa_app;
revoke all on garimpa.effective_price_evidence_policy from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select on garimpa.effective_price_evidence_policy to garimpa_app;

-- All new commercial relations remain inaccessible to runtime until the explicit final cutover.
create policy rollout_pending on garimpa."account_entitlement" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."account_invitation" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."account_lifecycle_event" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."analysis_assessment" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."audience_policy" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."audience_policy_version" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."campaign" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."campaign_link" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."campaign_publication" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."commercial_kit" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."commercial_kit_revision" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."commission_entry" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."comparison_review" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."conversion" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."conversion_attribution" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."destination" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."dispatch_attempt" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."dispatch_control" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."dispatch_job" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."dispatch_reservation" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."domain_event" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."experiment_assignment" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."experiment_evaluation" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."governance_decision" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."import_batch" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."import_row" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."kit_approval" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."kit_validation" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."onboarding_progress" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."operational_cost" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."opportunity" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."policy_experiment" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."price_calibration_run" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."price_evidence_policy_version" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."private_artifact" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."saas_revenue_entry" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
create policy rollout_pending on garimpa."usage_event" as restrictive for all to garimpa_app using(garimpa.commercial_rollout_ready()) with check(garimpa.commercial_rollout_ready());
revoke all on function garimpa.accept_account_invitation(text,text,text,text) from public,anon,authenticated,garimpa_app;
do $guard$ begin
 if (select coalesce(jsonb_agg(tablename order by tablename),'[]'::jsonb) from pg_tables where schemaname='garimpa') <> '["account_entitlement","account_invitation","account_lifecycle_event","affiliate_account","affiliate_marketplace_config","affiliate_membership","affiliate_monitoring_policy","affiliate_monitoring_policy_event","affiliate_monitoring_skip","affiliate_secret","analysis_assessment","app_user","app_user_role","audience_policy","audience_policy_version","buyer_profile","campaign","campaign_link","campaign_publication","capture_batch","capture_run","click_event","commercial_kit","commercial_kit_revision","commission_entry","comparison_review","conversion","conversion_attribution","curation_event","destination","dispatch_attempt","dispatch_control","dispatch_job","dispatch_reservation","domain_event","editorial_assessment","editorial_guideline","editorial_selection","editorial_selection_item","experiment_assignment","experiment_evaluation","extension_device","favorite","governance_decision","import_batch","import_row","kit_approval","kit_validation","onboarding_progress","operational_cost","opportunity","policy_experiment","price_calibration_run","price_evidence_policy_version","price_observation","price_watch","private_artifact","product","product_curation","publication","rollout_control","saas_revenue_entry","short_link","subscriber","triage_run","usage_event"]'::jsonb then raise exception 'rollout_table_inventory_mismatch'; end if;
 end $guard$;
