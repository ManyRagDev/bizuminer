begin;
set local lock_timeout='5s';

-- A membership-only price must not be compared with the ordinary price of
-- the same option. Preserve the remaining canonical configuration fields.
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
  return material||jsonb_build_object('membership',coalesce(e->'conditions'->'membership','null'::jsonb));
end $$;

-- Assessment history is append-only and never turns an old 1-5 rating into
-- the new attribute schema. The observation and product must share a tenant.
create table garimpa.curation_attribute_assessment (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  product_id text not null,
  observation_id text not null,
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  material_fingerprint text not null,
  price_cents integer not null check (price_cents>0),
  policy_version text not null,
  prompt_version text not null,
  model text not null,
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot)='object'),
  attributes jsonb not null check (jsonb_typeof(attributes)='object'),
  last_curation_event_id text,
  previous_assessment_id uuid,
  created_at timestamptz not null default now(),
  unique(id,tenant_id,product_id),
  unique(tenant_id,product_id,input_fingerprint,policy_version,prompt_version,model),
  foreign key(product_id,tenant_id) references garimpa.product(id,tenant_id),
  foreign key(observation_id,tenant_id,product_id) references garimpa.price_observation(id,tenant_id,product_id),
  foreign key(previous_assessment_id,tenant_id,product_id) references garimpa.curation_attribute_assessment(id,tenant_id,product_id)
);
create index curation_attribute_assessment_recent on garimpa.curation_attribute_assessment(tenant_id,product_id,created_at desc,id desc);

-- An uncertain paid call is reconciled manually; leases do not silently start
-- the same call again. A new material revision can create a new job.
create table garimpa.curation_attribute_job (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  product_id text not null,
  observation_id text not null,
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot)='object'),
  status text not null default 'queued' check(status in ('queued','running','completed','superseded','failed','reconciliation')),
  worker_id uuid,
  lease_until timestamptz,
  attempts integer not null default 0 check(attempts>=0),
  next_attempt_at timestamptz not null default now(),
  assessment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,tenant_id,product_id),
  foreign key(product_id,tenant_id) references garimpa.product(id,tenant_id),
  foreign key(observation_id,tenant_id,product_id) references garimpa.price_observation(id,tenant_id,product_id),
  foreign key(assessment_id,tenant_id,product_id) references garimpa.curation_attribute_assessment(id,tenant_id,product_id)
);
create unique index curation_attribute_one_open on garimpa.curation_attribute_job(tenant_id,product_id)
  where status in ('queued','running','reconciliation');
create index curation_attribute_ready on garimpa.curation_attribute_job(tenant_id,next_attempt_at,id) where status='queued';

create table garimpa.curation_external_budget (
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  local_day date not null,
  kind text not null check(kind in ('ai','shopee','listing','pdp')),
  marketplace text not null default 'all',
  consumed integer not null default 0 check(consumed>=0),
  watch_consumed integer not null default 0 check(watch_consumed>=0 and watch_consumed<=consumed),
  primary key(tenant_id,local_day,kind,marketplace)
);

-- A notification only wakes listeners; this row is the durable schedule.
create table garimpa.curation_projection_job (
  tenant_id text primary key references garimpa.affiliate_account(tenant_id),
  next_due_at timestamptz not null default now(),
  dirty_revision bigint not null default 0,
  claimed_revision bigint,
  lease_owner uuid,
  lease_until timestamptz,
  eligibility_cursor text,
  category_reference_week date,
  last_completed_at timestamptz,
  last_error text
);

create table garimpa.curation_score_projection (
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  product_id text not null,
  option_key text not null,
  observation_id text not null,
  assessment_id uuid,
  policy_version text not null,
  source_revision text not null,
  cohort jsonb not null check(jsonb_typeof(cohort)='object'),
  components jsonb not null check(jsonb_typeof(components)='object'),
  score_vitrine numeric not null check(score_vitrine between 0 and 100),
  score_pauta numeric not null check(score_pauta between 0 and 100),
  potential_score numeric not null check(potential_score between 0 and 100),
  calculated_at timestamptz not null,
  next_recalculation_at timestamptz not null,
  primary key(tenant_id,product_id,option_key),
  foreign key(product_id,tenant_id) references garimpa.product(id,tenant_id),
  foreign key(observation_id,tenant_id,product_id) references garimpa.price_observation(id,tenant_id,product_id),
  foreign key(assessment_id,tenant_id,product_id) references garimpa.curation_attribute_assessment(id,tenant_id,product_id)
);
create index curation_score_rank on garimpa.curation_score_projection(tenant_id,score_vitrine desc,product_id);
create index curation_score_recalculation on garimpa.curation_score_projection(tenant_id,next_recalculation_at,product_id);

create table garimpa.curation_category_reference (
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  week_start date not null,
  marketplace text not null,
  category text not null,
  price_band text not null check(price_band in ('ate_50','50_a_200','acima_200')),
  sample_size integer not null check(sample_size>=20),
  percentile_95 numeric not null,
  min_history_days integer not null check(min_history_days>=3),
  min_history_span_days integer not null check(min_history_span_days>=7),
  earliest_evidence timestamptz not null,
  latest_evidence timestamptz not null,
  calculated_at timestamptz not null default now(),
  primary key(tenant_id,week_start,marketplace,category,price_band)
);
alter table garimpa.curation_category_reference enable row level security;
create policy curation_category_reference_read on garimpa.curation_category_reference for select to garimpa_app
  using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
    and (current_setting('garimpa.actor_type',true)='worker' or current_setting('garimpa.membership_role',true) in ('owner','operator')));
create policy curation_category_reference_worker on garimpa.curation_category_reference for all to garimpa_app
  using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id) and current_setting('garimpa.actor_type',true)='worker')
  with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id) and current_setting('garimpa.actor_type',true)='worker');
revoke all on garimpa.curation_category_reference from public,anon,authenticated,garimpa_public_runtime;
grant select,insert,update on garimpa.curation_category_reference to garimpa_app;

alter table garimpa.curation_attribute_assessment enable row level security;
alter table garimpa.curation_attribute_job enable row level security;
alter table garimpa.curation_score_projection enable row level security;
alter table garimpa.curation_external_budget enable row level security;
alter table garimpa.curation_projection_job enable row level security;
create policy curation_attribute_assessment_scope on garimpa.curation_attribute_assessment to garimpa_app
  using (tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
    and (current_setting('garimpa.actor_type',true)='worker' or current_setting('garimpa.membership_role',true) in ('owner','operator')))
  with check (tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
    and current_setting('garimpa.actor_type',true)='worker');
create policy curation_attribute_job_scope on garimpa.curation_attribute_job to garimpa_app
  using (tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
    and current_setting('garimpa.actor_type',true)='worker')
  with check (tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
    and current_setting('garimpa.actor_type',true)='worker');
create policy curation_score_projection_scope on garimpa.curation_score_projection to garimpa_app
  using (tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
    and (current_setting('garimpa.actor_type',true)='worker' or current_setting('garimpa.membership_role',true) in ('owner','operator')))
  with check (tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
    and current_setting('garimpa.actor_type',true)='worker');
create policy curation_external_budget_scope on garimpa.curation_external_budget to garimpa_app
  using (tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
    and (current_setting('garimpa.actor_type',true)='worker' or (current_setting('garimpa.actor_type',true)='device' and kind in ('listing','pdp'))))
  with check (tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
    and (current_setting('garimpa.actor_type',true)='worker' or (current_setting('garimpa.actor_type',true)='device' and kind in ('listing','pdp'))));
create policy curation_external_budget_human_read on garimpa.curation_external_budget for select to garimpa_app
  using (tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
    and current_setting('garimpa.actor_type',true)='human' and current_setting('garimpa.membership_role',true) in ('owner','operator'));
create policy curation_projection_job_scope on garimpa.curation_projection_job to garimpa_app
  using (tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id))
  with check (tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id));
revoke all on garimpa.curation_attribute_assessment,garimpa.curation_attribute_job,garimpa.curation_score_projection from public,anon,authenticated,garimpa_public_runtime;
grant select,insert on garimpa.curation_attribute_assessment to garimpa_app;
grant select,insert,update on garimpa.curation_attribute_job,garimpa.curation_score_projection to garimpa_app;
revoke all on garimpa.curation_external_budget from public,anon,authenticated,garimpa_public_runtime;
grant select,insert,update on garimpa.curation_external_budget to garimpa_app;
revoke all on garimpa.curation_projection_job from public,anon,authenticated,garimpa_public_runtime;
grant select,insert,update on garimpa.curation_projection_job to garimpa_app;

create function garimpa.signal_curation_projection() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 insert into garimpa.curation_projection_job(tenant_id,dirty_revision,next_due_at)
   values(new.tenant_id,1,now()) on conflict(tenant_id) do update
   set dirty_revision=garimpa.curation_projection_job.dirty_revision+1,
       next_due_at=least(garimpa.curation_projection_job.next_due_at,now());
 perform pg_catalog.pg_notify('garimpa_curation_ready',pg_catalog.json_build_object('tenantId',new.tenant_id)::text);
 return new;
end $$;
revoke all on function garimpa.signal_curation_projection() from public,anon,authenticated,garimpa_public_runtime;
create trigger signal_curation_projection after insert on garimpa.curation_fact_delta
 for each row execute function garimpa.signal_curation_projection();
create trigger signal_curation_delta_reopened after update of processed_at on garimpa.curation_fact_delta
 for each row when (old.processed_at is not null and new.processed_at is null)
 execute function garimpa.signal_curation_projection();
create trigger signal_curation_assessment after insert on garimpa.curation_attribute_assessment
 for each row execute function garimpa.signal_curation_projection();
create trigger signal_curation_human_event after insert on garimpa.curation_event
 for each row execute function garimpa.signal_curation_projection();
create trigger signal_curation_offer_choice after insert or update of option_key on garimpa.editorial_offer_choice
 for each row execute function garimpa.signal_curation_projection();

-- A correction to the product itself may not add a price observation. Mark
-- its latest factual input dirty without inventing a new observation.
create function garimpa.signal_curation_material_change() returns trigger
language plpgsql security invoker set search_path=pg_catalog,garimpa as $$
declare latest_id text;
begin
 if (old.title,old.product_url,old.image_url,old.category) is not distinct from
    (new.title,new.product_url,new.image_url,new.category) then return new; end if;
 select o.id into latest_id from garimpa.price_observation o where o.tenant_id=new.tenant_id and o.product_id=new.id
   order by o.observed_at desc,o.id desc limit 1;
 if latest_id is not null then
   insert into garimpa.curation_fact_delta(tenant_id,product_id,observation_id)
     values(new.tenant_id,new.id,latest_id) on conflict(tenant_id,observation_id) do update set processed_at=null;
   insert into garimpa.curation_projection_job(tenant_id,dirty_revision,next_due_at) values(new.tenant_id,1,now())
     on conflict(tenant_id) do update set dirty_revision=garimpa.curation_projection_job.dirty_revision+1,
       next_due_at=least(garimpa.curation_projection_job.next_due_at,now());
   perform pg_notify('garimpa_curation_ready',json_build_object('tenantId',new.tenant_id)::text);
 end if;
 return new;
end $$;
revoke all on function garimpa.signal_curation_material_change() from public,anon,authenticated,garimpa_public_runtime;
create trigger signal_curation_material_change after update of title,product_url,image_url,category on garimpa.product
 for each row execute function garimpa.signal_curation_material_change();

-- A paid request with an unknown outcome cannot be replayed automatically.
-- Only the account owner may explicitly release it for a new budgeted call.
create table garimpa.curation_attribute_reconciliation (
 id uuid primary key default gen_random_uuid(),tenant_id text not null,job_id uuid not null,
 product_id text not null,actor_id text not null references garimpa.app_user(id),
 reason text not null check(length(btrim(reason)) between 3 and 1000),created_at timestamptz not null default now(),
 foreign key(product_id,tenant_id) references garimpa.product(id,tenant_id),
 foreign key(job_id,tenant_id,product_id) references garimpa.curation_attribute_job(id,tenant_id,product_id)
);
alter table garimpa.curation_attribute_reconciliation enable row level security;
create policy curation_attribute_reconciliation_owner_read on garimpa.curation_attribute_reconciliation for select to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and current_setting('garimpa.membership_role',true)='owner');
revoke all on garimpa.curation_attribute_reconciliation from public,anon,authenticated,garimpa_public_runtime;
grant select on garimpa.curation_attribute_reconciliation to garimpa_app;
create policy curation_attribute_job_owner_read on garimpa.curation_attribute_job for select to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and current_setting('garimpa.actor_type',true)='human' and current_setting('garimpa.membership_role',true)='owner');
create function garimpa.release_uncertain_attribute_job(p_tenant text,p_job uuid,p_reason text)
returns boolean language plpgsql security definer set search_path=pg_catalog,garimpa as $$
declare actor text; product text; observation text;
begin
 actor:=nullif(current_setting('garimpa.actor_app_user_id',true),'');
 if p_tenant is distinct from nullif(current_setting('garimpa.tenant_id',true),'')
   or current_setting('garimpa.actor_type',true) is distinct from 'human'
   or current_setting('garimpa.membership_role',true) is distinct from 'owner'
   or not garimpa.active_tenant(p_tenant) or actor is null
   or not exists(select 1 from garimpa.affiliate_membership m join garimpa.affiliate_account a on a.id=m.affiliate_id
      where a.tenant_id=p_tenant and a.status='active' and m.app_user_id=actor and m.role='owner' and m.revoked_at is null)
   or p_reason is null or length(btrim(p_reason)) not between 3 and 1000 then raise exception 'reconciliation_forbidden'; end if;
 select j.product_id into product from garimpa.curation_attribute_job j
   where j.tenant_id=p_tenant and j.id=p_job and j.status='reconciliation' for update;
 if product is null then return false; end if;
 select o.id into observation from garimpa.price_observation o where o.tenant_id=p_tenant and o.product_id=product
   and (not exists(select 1 from garimpa.editorial_offer_choice choice where choice.tenant_id=p_tenant and choice.product_id=product)
     or o.option_key=(select choice.option_key from garimpa.editorial_offer_choice choice where choice.tenant_id=p_tenant and choice.product_id=product))
   order by o.observed_at desc,o.id desc limit 1;
 if observation is null then return false; end if;
 update garimpa.curation_attribute_job set status='superseded',updated_at=now() where tenant_id=p_tenant and id=p_job;
 insert into garimpa.curation_attribute_reconciliation(tenant_id,job_id,product_id,actor_id,reason)
   values(p_tenant,p_job,product,actor,btrim(p_reason));
 insert into garimpa.curation_fact_delta(tenant_id,product_id,observation_id) values(p_tenant,product,observation)
   on conflict(tenant_id,observation_id) do update set processed_at=null;
 insert into garimpa.curation_projection_job(tenant_id,dirty_revision,next_due_at) values(p_tenant,1,now())
   on conflict(tenant_id) do update set dirty_revision=garimpa.curation_projection_job.dirty_revision+1,next_due_at=least(garimpa.curation_projection_job.next_due_at,now());
 perform pg_notify('garimpa_curation_ready',json_build_object('tenantId',p_tenant)::text);
 return true;
end $$;
revoke all on function garimpa.release_uncertain_attribute_job(text,uuid,text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.release_uncertain_attribute_job(text,uuid,text) to garimpa_app;
commit;
