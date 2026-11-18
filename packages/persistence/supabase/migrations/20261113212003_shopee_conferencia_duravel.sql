begin;
set local lock_timeout='5s';

create table garimpa.shopee_lookup_attempt (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  product_id text not null,
  claim_token_hash text not null check(claim_token_hash ~ '^[0-9a-f]{64}$'),
  state text not null default 'reserved' check(state in ('reserved','observed','absent','failed','uncertain')),
  capture_run_id text,
  lease_until timestamptz not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result_code text,
  foreign key(product_id,tenant_id) references garimpa.product(id,tenant_id)
);
-- One in-flight external lookup per account, including across listeners.
create unique index shopee_lookup_one_reserved on garimpa.shopee_lookup_attempt(tenant_id) where state='reserved';
create index shopee_lookup_recovery on garimpa.shopee_lookup_attempt(tenant_id,lease_until) where state='reserved';
alter table garimpa.shopee_lookup_attempt enable row level security;
create policy shopee_lookup_worker on garimpa.shopee_lookup_attempt to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and current_setting('garimpa.actor_type',true)='worker')
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and current_setting('garimpa.actor_type',true)='worker');
revoke all on garimpa.shopee_lookup_attempt from public,anon,authenticated,garimpa_public_runtime;
grant select,insert,update on garimpa.shopee_lookup_attempt to garimpa_app;
create trigger signal_curation_promotion after insert on garimpa.curation_promotion
 for each row execute function garimpa.signal_curation_projection();
create trigger signal_updated_slot_promotion after update of requested_observation_id,requested_revision,policy_version,priority,deadline
 on garimpa.curation_promotion for each row
 when (new.reason='slot' and new.status='pending' and
   (old.requested_observation_id,old.requested_revision,old.policy_version,old.priority,old.deadline)
   is distinct from (new.requested_observation_id,new.requested_revision,new.policy_version,new.priority,new.deadline))
 execute function garimpa.signal_curation_projection();
-- A pending promotion may become actionable again after its fact, score
-- revision or policy changes. Wake consumers without dirtying the projection
-- that made the update, which would otherwise repeatedly schedule itself.
create function garimpa.signal_changed_promotion_request() returns trigger
language plpgsql security invoker set search_path=pg_catalog,garimpa as $$
begin
 perform pg_notify('garimpa_curation_ready',json_build_object('tenantId',new.tenant_id)::text);
 return new;
end $$;
revoke all on function garimpa.signal_changed_promotion_request() from public,anon,authenticated,garimpa_public_runtime;
create trigger signal_changed_promotion_request after update of requested_observation_id,requested_revision,policy_version
 on garimpa.curation_promotion for each row
 when (new.reason='promotion' and new.status='pending' and
   (old.requested_observation_id,old.requested_revision,old.policy_version)
   is distinct from (new.requested_observation_id,new.requested_revision,new.policy_version))
 execute function garimpa.signal_changed_promotion_request();
-- Notify without exposing secret material. The worker rechecks authorization
-- and only resumes auth-blocked work when an active credential was updated.
create function garimpa.signal_shopee_credential_changed() returns trigger
language plpgsql security invoker set search_path=pg_catalog,garimpa as $$
begin
 if new.marketplace='shopee' and new.status='active' then
   perform pg_notify('garimpa_curation_ready',json_build_object('tenantId',new.tenant_id)::text);
 end if;
 return new;
end $$;
revoke all on function garimpa.signal_shopee_credential_changed() from public,anon,authenticated,garimpa_public_runtime;
create trigger signal_shopee_credential_changed after insert or update on garimpa.affiliate_secret
 for each row execute function garimpa.signal_shopee_credential_changed();
commit;
