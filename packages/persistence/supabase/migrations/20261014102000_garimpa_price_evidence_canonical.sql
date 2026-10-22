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
