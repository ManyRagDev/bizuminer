begin;
set local lock_timeout='5s';

create table garimpa.curation_exception (
 id uuid primary key default gen_random_uuid(),tenant_id text not null references garimpa.affiliate_account(tenant_id),
 product_id text not null,option_key text not null,assessment_id uuid not null,score_version text not null,basis_fingerprint text not null,
 observation_id text not null,source_revision text not null,
 status text not null default 'open' check(status in ('open','resolved','expired','irrelevant')),
 opened_day date not null,opened_at timestamptz not null default now(),expires_at timestamptz not null,
 priority numeric not null, snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 closed_at timestamptz,close_reason text,editorial_assessment_id text,curation_event_id bigint,
 unique(tenant_id,product_id,option_key,assessment_id,score_version,basis_fingerprint),
 foreign key(product_id,tenant_id) references garimpa.product(id,tenant_id),
 foreign key(assessment_id,tenant_id,product_id) references garimpa.curation_attribute_assessment(id,tenant_id,product_id),
 foreign key(observation_id,tenant_id,product_id) references garimpa.price_observation(id,tenant_id,product_id),
 foreign key(editorial_assessment_id,product_id,tenant_id) references garimpa.editorial_assessment(id,product_id,tenant_id),
 foreign key(curation_event_id) references garimpa.curation_event(id),
 check((status='open' and closed_at is null and close_reason is null) or (status<>'open' and closed_at is not null and close_reason is not null))
);
create index curation_exception_open on garimpa.curation_exception(tenant_id,priority desc,expires_at,id) where status='open';
create index curation_exception_day on garimpa.curation_exception(tenant_id,opened_day);
alter table garimpa.curation_exception enable row level security;
create policy curation_exception_read on garimpa.curation_exception for select to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and (current_setting('garimpa.actor_type',true)='worker' or current_setting('garimpa.membership_role',true) in ('owner','operator')));
create policy curation_exception_worker on garimpa.curation_exception for all to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and current_setting('garimpa.actor_type',true)='worker')
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and current_setting('garimpa.actor_type',true)='worker');
revoke all on garimpa.curation_exception from public,anon,authenticated,garimpa_public_runtime;
grant select,insert,update on garimpa.curation_exception to garimpa_app;

-- The existing human review already persists its own actor, reason and
-- snapshot. Link it atomically; do not create an independent approval path.
create function garimpa.close_curation_exception_from_review() returns trigger
language plpgsql security definer set search_path=pg_catalog,garimpa as $$
begin
 if tg_table_name='curation_event' then
   if new.actor_type='human' and new.actor_app_user_id is not null then
     update garimpa.curation_exception set status='resolved',closed_at=now(),close_reason='human_decision',curation_event_id=new.id
       where tenant_id=new.tenant_id and product_id=new.product_id and status='open' and expires_at>now();
   end if;
 else
   update garimpa.curation_exception set status='resolved',closed_at=now(),close_reason='editorial_review',editorial_assessment_id=new.id
     where tenant_id=new.tenant_id and product_id=new.product_id and status='open' and expires_at>now()
       and observation_id=coalesce(new.snapshot->>'rubricObservationId',new.snapshot->>'observation_id');
 end if;
 return new;
end $$;
revoke all on function garimpa.close_curation_exception_from_review() from public,anon,authenticated,garimpa_public_runtime;
create trigger close_curation_exception_event after insert on garimpa.curation_event
 for each row execute function garimpa.close_curation_exception_from_review();
create trigger close_curation_exception_assessment after insert on garimpa.editorial_assessment
 for each row execute function garimpa.close_curation_exception_from_review();
commit;
