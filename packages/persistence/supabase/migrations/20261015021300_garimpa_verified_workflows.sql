-- Corrective expansion after the eleven V2 migrations. No remote application authorized.
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
