begin;
set local lock_timeout='5s';

create table garimpa.curation_policy_v2 (
  tenant_id text primary key references garimpa.affiliate_account(tenant_id),
  version integer not null default 1 check(version>0),
  enabled boolean not null default false,
  factual_gate_required boolean not null default false,
  config jsonb not null check(jsonb_typeof(config)='object'),
  updated_at timestamptz not null default now()
);
-- Once activated, reverting the selection algorithm cannot restore expired
-- public prices. Preserve this protection even when selection is disabled.
create function garimpa.preserve_factual_gate() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if tg_op='UPDATE' then new.factual_gate_required:=old.factual_gate_required or new.factual_gate_required or new.enabled;
 else new.factual_gate_required:=new.factual_gate_required or new.enabled; end if;
 return new;
end $$;
revoke all on function garimpa.preserve_factual_gate() from public,anon,authenticated,garimpa_public_runtime;
create trigger preserve_factual_gate before insert or update on garimpa.curation_policy_v2
 for each row execute function garimpa.preserve_factual_gate();

-- Promotion is a recoverable request, not an editorial approval or a deletion.
create table garimpa.curation_promotion (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  product_id text not null,
  option_key text not null,
  price_type text not null check(price_type in ('exact','range','from')),
  requested_observation_id text not null,
  requested_revision text not null,
  policy_version integer not null check(policy_version>0),
  reason text not null check(reason in ('promotion','renewal','slot','watch')),
  status text not null default 'pending' check(status in ('pending','claimed','confirmed','cancelled','expired')),
  priority numeric not null default 0,
  deadline timestamptz not null,
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0 check(attempts>=0),
  device_id text references garimpa.extension_device(id),
  claim_token_hash text check(claim_token_hash is null or claim_token_hash ~ '^[0-9a-f]{64}$'),
  lease_until timestamptz,
  result_observation_id text,
  result jsonb check(result is null or jsonb_typeof(result)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(product_id,tenant_id) references garimpa.product(id,tenant_id),
  foreign key(requested_observation_id,tenant_id,product_id) references garimpa.price_observation(id,tenant_id,product_id),
  foreign key(result_observation_id,tenant_id,product_id) references garimpa.price_observation(id,tenant_id,product_id)
);
create unique index curation_promotion_one_open on garimpa.curation_promotion(tenant_id,product_id,option_key,price_type,reason)
 where status in ('pending','claimed');
create index curation_promotion_ready on garimpa.curation_promotion(tenant_id,next_attempt_at,priority desc,id)
 where status='pending';
create index curation_promotion_expiry on garimpa.curation_promotion(tenant_id,deadline,id)
 where status in ('pending','claimed');
create index curation_promotion_expired_fact on garimpa.curation_promotion
 (tenant_id,product_id,option_key,price_type,requested_observation_id)
 where reason='promotion' and status='expired';
create unique index curation_promotion_scope_identity on garimpa.curation_promotion(id,tenant_id,product_id);
-- One record per committed edition, never for a simulation or an unchanged refresh.
create table garimpa.curation_selection_event (
  edition_id uuid primary key references garimpa.recommendation_edition_archive(id),
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  created_at timestamptz not null default now(),
  capacity integer not null check(capacity between 1 and 24),
  prepared integer not null check(prepared between 0 and 24),
  entries jsonb not null check(jsonb_typeof(entries)='array'),
  exits jsonb not null check(jsonb_typeof(exits)='array'),
  exceptions jsonb not null check(jsonb_typeof(exceptions)='array')
);
create index curation_selection_event_recent on garimpa.curation_selection_event(tenant_id,created_at desc);
alter table garimpa.curation_selection_event enable row level security;
create policy curation_selection_event_read on garimpa.curation_selection_event for select to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and (current_setting('garimpa.actor_type',true)='worker' or current_setting('garimpa.membership_role',true) in ('owner','operator')));
create policy curation_selection_event_insert on garimpa.curation_selection_event for insert to garimpa_app
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and (current_setting('garimpa.actor_type',true)='worker' or current_setting('garimpa.membership_role',true) in ('owner','operator'))
   and exists(select 1 from garimpa.recommendation_edition_archive e where e.id=edition_id and e.tenant_id=curation_selection_event.tenant_id and e.channel='home'));
revoke all on garimpa.curation_selection_event from public,anon,authenticated,garimpa_public_runtime;
grant select,insert on garimpa.curation_selection_event to garimpa_app;
alter table garimpa.curation_policy_v2 enable row level security;
alter table garimpa.curation_promotion enable row level security;
create policy curation_policy_read on garimpa.curation_policy_v2 for select to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and (current_setting('garimpa.actor_type',true)='worker' or current_setting('garimpa.membership_role',true) in ('owner','operator')));
create policy curation_policy_write on garimpa.curation_policy_v2 for all to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and current_setting('garimpa.membership_role',true)='owner')
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and current_setting('garimpa.membership_role',true)='owner');
create policy curation_promotion_scope on garimpa.curation_promotion to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and (current_setting('garimpa.actor_type',true) in ('worker','device') or current_setting('garimpa.membership_role',true) in ('owner','operator')))
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and (current_setting('garimpa.actor_type',true) in ('worker','device') or current_setting('garimpa.membership_role',true) in ('owner','operator'))
   and (device_id is null or exists(select 1 from garimpa.extension_device d join garimpa.affiliate_account a on a.id=d.affiliate_id
     where d.id=curation_promotion.device_id and a.tenant_id=curation_promotion.tenant_id and d.revoked_at is null
       and (current_setting('garimpa.actor_type',true)='worker' or d.created_by_app_user_id=nullif(current_setting('garimpa.actor_app_user_id',true),'')))));
revoke all on garimpa.curation_policy_v2,garimpa.curation_promotion from public,anon,authenticated,garimpa_public_runtime;
grant select,insert,update on garimpa.curation_policy_v2,garimpa.curation_promotion to garimpa_app;
create trigger signal_curation_policy_insert after insert on garimpa.curation_policy_v2
 for each row execute function garimpa.signal_curation_projection();
create trigger signal_curation_policy_update after update on garimpa.curation_policy_v2
 for each row execute function garimpa.signal_curation_projection();
commit;
