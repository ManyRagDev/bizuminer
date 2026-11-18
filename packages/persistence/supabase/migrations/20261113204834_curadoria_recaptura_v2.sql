begin;
set local lock_timeout='5s';

create table garimpa.recapture_session (
  id uuid primary key,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  device_id text not null references garimpa.extension_device(id),
  status text not null check(status in ('active','paused','cancelled','completed')),
  control_sequence integer not null default 0 check(control_sequence>=0),
  control_action text check(control_action in ('pause','resume','cancel')),
  listing_limit integer not null default 5 check(listing_limit between 0 and 50),
  pdp_limit integer not null default 30 check(pdp_limit between 0 and 40),
  listing_used integer not null default 0 check(listing_used>=0),
  pdp_used integer not null default 0 check(pdp_used>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,tenant_id,device_id)
);
create index recapture_session_device on garimpa.recapture_session(tenant_id,device_id,updated_at desc);

create table garimpa.recapture_task (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  marketplace text not null check(marketplace in ('mercadolivre','amazon','aliexpress')),
  kind text not null check(kind in ('listing','pdp')),
  page_url text not null check(length(page_url) between 1 and 2048),
  plan_revision text not null,
  status text not null default 'pending' check(status in ('pending','claimed','completed','cancelled','expired')),
  priority numeric not null default 0,
  next_attempt_at timestamptz not null default now(),
  deadline timestamptz not null,
  session_id uuid,
  device_id text references garimpa.extension_device(id),
  claim_request_id uuid,
  claim_token_hash text check(claim_token_hash is null or claim_token_hash ~ '^[0-9a-f]{64}$'),
  lease_until timestamptz,
  attempts integer not null default 0 check(attempts>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,tenant_id),
  foreign key(session_id,tenant_id,device_id) references garimpa.recapture_session(id,tenant_id,device_id)
);
create index recapture_task_ready on garimpa.recapture_task(tenant_id,marketplace,next_attempt_at,priority desc,id) where status='pending';
create unique index recapture_task_one_open_page on garimpa.recapture_task(tenant_id,marketplace,kind,md5(page_url))
 where status in ('pending','claimed');
create unique index recapture_task_claim_idempotent on garimpa.recapture_task(tenant_id,device_id,claim_request_id)
 where claim_request_id is not null;

create table garimpa.recapture_target (
  tenant_id text not null,
  task_id uuid not null,
  product_id text not null,
  option_key text not null,
  promotion_id uuid,
  watched boolean not null default false,
  expected_external_id text not null,
  observed_at timestamptz,
  status text not null default 'pending' check(status in ('pending','observed','unavailable_confirmed','residual','superseded','unreported')),
  residual_reason text check(residual_reason is null or residual_reason in ('not_found_on_listing','no_price','needs_login','blocked','parse_error','timeout','configuration_mismatch','price_conflict','superseded_observation','unavailable_confirmed','observed')),
  primary key(tenant_id,task_id,product_id,option_key),
  foreign key(task_id,tenant_id) references garimpa.recapture_task(id,tenant_id),
  foreign key(product_id,tenant_id) references garimpa.product(id,tenant_id),
  foreign key(promotion_id,tenant_id,product_id) references garimpa.curation_promotion(id,tenant_id,product_id)
);
create index recapture_target_product on garimpa.recapture_target(tenant_id,product_id,option_key);

-- Keep work without a reproducible source visible without inventing a URL or
-- creating a navigable task. Replanning may resolve it when evidence improves.
create table garimpa.recapture_unroutable (
  tenant_id text not null,
  product_id text not null,
  option_key text not null,
  marketplace text not null check(marketplace in ('mercadolivre','amazon','aliexpress')),
  watched boolean not null default false,
  deadline timestamptz not null,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key(tenant_id,product_id,option_key),
  foreign key(product_id,tenant_id) references garimpa.product(id,tenant_id)
);
create index recapture_unroutable_open on garimpa.recapture_unroutable(tenant_id,deadline,marketplace) where resolved_at is null;
alter table garimpa.recapture_unroutable enable row level security;
create policy recapture_unroutable_read on garimpa.recapture_unroutable for select to garimpa_app
  using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
    and (current_setting('garimpa.actor_type',true)='worker' or
      (current_setting('garimpa.actor_type',true)='human' and current_setting('garimpa.membership_role',true) in ('owner','operator'))));
create policy recapture_unroutable_write on garimpa.recapture_unroutable for all to garimpa_app
  using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
    and current_setting('garimpa.actor_type',true)='worker')
  with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
    and current_setting('garimpa.actor_type',true)='worker');
revoke all on garimpa.recapture_unroutable from public,anon,authenticated,garimpa_public_runtime;
grant select,insert,update on garimpa.recapture_unroutable to garimpa_app;

-- A unique option lease fences overlapping pages across devices without
-- exposing the other device's task or claim token to the extension.
create table garimpa.recapture_target_lease (
  tenant_id text not null,
  product_id text not null,
  option_key text not null,
  task_id uuid not null,
  session_id uuid not null,
  device_id text not null references garimpa.extension_device(id),
  lease_until timestamptz not null,
  primary key(tenant_id,product_id,option_key),
  foreign key(product_id,tenant_id) references garimpa.product(id,tenant_id),
  foreign key(task_id,tenant_id) references garimpa.recapture_task(id,tenant_id),
  foreign key(session_id,tenant_id,device_id) references garimpa.recapture_session(id,tenant_id,device_id)
);
create index recapture_target_lease_task on garimpa.recapture_target_lease(tenant_id,task_id,device_id);
alter table garimpa.recapture_target_lease enable row level security;
create policy recapture_target_lease_read on garimpa.recapture_target_lease for select to garimpa_app
  using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
    and current_setting('garimpa.actor_type',true) in ('device','worker'));
create policy recapture_target_lease_write on garimpa.recapture_target_lease for all to garimpa_app
  using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
    and (current_setting('garimpa.actor_type',true)='worker' or
      (current_setting('garimpa.actor_type',true)='device' and (device_id=nullif(current_setting('garimpa.device_id',true),'') or lease_until<=clock_timestamp()))))
  with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
    and (current_setting('garimpa.actor_type',true)='worker' or
      (current_setting('garimpa.actor_type',true)='device' and device_id=nullif(current_setting('garimpa.device_id',true),'')
        and exists(select 1 from garimpa.recapture_task t where t.tenant_id=recapture_target_lease.tenant_id
          and t.id=recapture_target_lease.task_id and t.device_id=recapture_target_lease.device_id
          and t.session_id=recapture_target_lease.session_id and t.status='claimed'))));
revoke all on garimpa.recapture_target_lease from public,anon,authenticated,garimpa_public_runtime;
grant select,insert,update on garimpa.recapture_target_lease to garimpa_app;

create table garimpa.recapture_claim_receipt (
  tenant_id text not null,
  device_id text not null references garimpa.extension_device(id),
  request_id uuid not null,
  session_id uuid not null,
  task_id uuid not null,
  fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
  lease_until timestamptz not null,
  skipped boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(tenant_id,device_id,request_id),
  foreign key(task_id,tenant_id) references garimpa.recapture_task(id,tenant_id),
  foreign key(session_id,tenant_id,device_id) references garimpa.recapture_session(id,tenant_id,device_id)
);

create table garimpa.recapture_report_receipt (
  tenant_id text not null,
  device_id text not null references garimpa.extension_device(id),
  request_id uuid not null,
  task_id uuid not null,
  fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
  result jsonb not null check(jsonb_typeof(result)='object'),
  created_at timestamptz not null default now(),
  primary key(tenant_id,device_id,request_id),
  foreign key(task_id,tenant_id) references garimpa.recapture_task(id,tenant_id)
);

create table garimpa.offer_availability_observation (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  product_id text not null,
  option_key text not null,
  task_id uuid not null,
  request_id uuid not null,
  source_page_url text not null,
  observed_at timestamptz not null,
  status text not null check(status='unavailable_confirmed'),
  evidence text not null check(evidence='explicit_product_unavailable'),
  unique(tenant_id,task_id,request_id,product_id,option_key),
  foreign key(product_id,tenant_id) references garimpa.product(id,tenant_id),
  foreign key(task_id,tenant_id) references garimpa.recapture_task(id,tenant_id)
);
create index offer_availability_recent on garimpa.offer_availability_observation(tenant_id,product_id,option_key,observed_at desc);

alter table garimpa.recapture_session enable row level security;
alter table garimpa.recapture_task enable row level security;
alter table garimpa.recapture_target enable row level security;
alter table garimpa.recapture_report_receipt enable row level security;
alter table garimpa.recapture_claim_receipt enable row level security;
alter table garimpa.offer_availability_observation enable row level security;
create policy recapture_session_scope on garimpa.recapture_session to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and (current_setting('garimpa.actor_type',true)='worker' or exists(select 1 from garimpa.extension_device d
     where d.id=recapture_session.device_id and d.created_by_app_user_id=nullif(current_setting('garimpa.actor_app_user_id',true),'') and d.revoked_at is null
       and (current_setting('garimpa.actor_type',true)<>'device' or d.id=nullif(current_setting('garimpa.device_id',true),'')))))
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and exists(select 1 from garimpa.extension_device d join garimpa.affiliate_account a on a.id=d.affiliate_id
     where d.id=recapture_session.device_id and a.tenant_id=recapture_session.tenant_id and d.revoked_at is null
       and (current_setting('garimpa.actor_type',true)='worker' or d.created_by_app_user_id=nullif(current_setting('garimpa.actor_app_user_id',true),''))
       and (current_setting('garimpa.actor_type',true)<>'device' or d.id=nullif(current_setting('garimpa.device_id',true),''))));
create policy recapture_task_scope on garimpa.recapture_task to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and (current_setting('garimpa.actor_type',true)='worker' or (current_setting('garimpa.actor_type',true)='device'
     and (device_id is null or device_id=nullif(current_setting('garimpa.device_id',true),'')))
     or (current_setting('garimpa.actor_type',true)='human' and current_setting('garimpa.membership_role',true) in ('owner','operator'))))
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and (current_setting('garimpa.actor_type',true)='worker' or (current_setting('garimpa.actor_type',true)='device'
     and device_id=nullif(current_setting('garimpa.device_id',true),''))
     or (current_setting('garimpa.actor_type',true)='human' and current_setting('garimpa.membership_role',true) in ('owner','operator'))));
create policy recapture_target_scope on garimpa.recapture_target to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and exists(select 1 from garimpa.recapture_task t where t.id=recapture_target.task_id and t.tenant_id=recapture_target.tenant_id))
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and exists(select 1 from garimpa.recapture_task t where t.id=recapture_target.task_id and t.tenant_id=recapture_target.tenant_id
     and (current_setting('garimpa.actor_type',true)<>'device' or t.device_id=nullif(current_setting('garimpa.device_id',true),''))));
create policy recapture_receipt_scope on garimpa.recapture_report_receipt to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and exists(select 1 from garimpa.recapture_task t where t.id=recapture_report_receipt.task_id and t.tenant_id=recapture_report_receipt.tenant_id
     and t.device_id=recapture_report_receipt.device_id))
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and exists(select 1 from garimpa.recapture_task t where t.id=recapture_report_receipt.task_id and t.tenant_id=recapture_report_receipt.tenant_id
     and t.device_id=recapture_report_receipt.device_id));
create policy recapture_claim_receipt_scope on garimpa.recapture_claim_receipt to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and (current_setting('garimpa.actor_type',true)='worker' or device_id=nullif(current_setting('garimpa.device_id',true),'')))
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and device_id=nullif(current_setting('garimpa.device_id',true),''));
create policy offer_availability_scope on garimpa.offer_availability_observation to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and exists(select 1 from garimpa.recapture_task t where t.id=offer_availability_observation.task_id and t.tenant_id=offer_availability_observation.tenant_id))
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and exists(select 1 from garimpa.recapture_task t where t.id=offer_availability_observation.task_id and t.tenant_id=offer_availability_observation.tenant_id
     and t.kind='pdp' and t.status='claimed' and t.device_id=nullif(current_setting('garimpa.device_id',true),'')));
revoke all on garimpa.recapture_session,garimpa.recapture_task,garimpa.recapture_target,garimpa.recapture_report_receipt from public,anon,authenticated,garimpa_public_runtime;
grant select,insert,update on garimpa.recapture_session,garimpa.recapture_task,garimpa.recapture_target to garimpa_app;
grant select,insert on garimpa.recapture_report_receipt to garimpa_app;
revoke all on garimpa.recapture_claim_receipt from public,anon,authenticated,garimpa_public_runtime;
grant select,insert on garimpa.recapture_claim_receipt to garimpa_app;
revoke all on garimpa.offer_availability_observation from public,anon,authenticated,garimpa_public_runtime;
grant select,insert on garimpa.offer_availability_observation to garimpa_app;
create trigger signal_curation_availability after insert on garimpa.offer_availability_observation
 for each row execute function garimpa.signal_curation_projection();
create trigger signal_cancelled_recapture after update of status on garimpa.recapture_task
 for each row when (old.status='claimed' and new.status='cancelled') execute function garimpa.signal_curation_projection();
-- Even a page with no usable facts changes the residual work. Persist a
-- projection signal so the planner revisits it after its retry window.
create trigger signal_completed_recapture after update of status on garimpa.recapture_task
 for each row when (old.status='claimed' and new.status='completed') execute function garimpa.signal_curation_projection();

-- Narrow aggregate: the device learns only whether this product still has an
-- active watch, never who requested it. Validate its membership on every call.
create function garimpa.recapture_watch_active(p_tenant text,p_product text) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,garimpa as $$
begin
 if p_tenant is distinct from nullif(current_setting('garimpa.tenant_id',true),'') or not garimpa.active_tenant(p_tenant) then
   raise exception 'recapture_scope_denied';
 end if;
 if current_setting('garimpa.actor_type',true) is distinct from 'worker' and not exists(
   select 1 from garimpa.extension_device d join garimpa.affiliate_account a on a.id=d.affiliate_id
   join garimpa.affiliate_membership m on m.affiliate_id=a.id and m.app_user_id=d.created_by_app_user_id and m.revoked_at is null
   join garimpa.app_user_role r on r.app_user_id=m.app_user_id and r.role='afiliado' and r.revoked_at is null
   where d.id=nullif(current_setting('garimpa.device_id',true),'') and d.revoked_at is null and a.tenant_id=p_tenant
     and d.created_by_app_user_id=nullif(current_setting('garimpa.actor_app_user_id',true),'')) then
   raise exception 'recapture_scope_denied';
 end if;
 return exists(select 1 from garimpa.price_watch w where w.tenant_id=p_tenant and w.product_id=p_product and w.active);
end $$;
revoke all on function garimpa.recapture_watch_active(text,text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.recapture_watch_active(text,text) to garimpa_app;
create trigger signal_curation_watch after insert or update of active on garimpa.price_watch
 for each row execute function garimpa.signal_curation_projection();
commit;
