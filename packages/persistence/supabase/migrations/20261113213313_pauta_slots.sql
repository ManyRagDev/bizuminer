begin;
set local lock_timeout='5s';

create function garimpa.valid_pauta_slot_hours(p_hours jsonb) returns boolean
language sql immutable set search_path=pg_catalog as $$
 select case when jsonb_typeof(p_hours)<>'array' then false else
   jsonb_array_length(p_hours)<=5
   and not exists(select 1 from jsonb_array_elements(p_hours) v
     where jsonb_typeof(v)<>'string' or (v#>>'{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
   and (select count(*)=count(distinct v#>>'{}') from jsonb_array_elements(p_hours) v)
 end
$$;
revoke all on function garimpa.valid_pauta_slot_hours(jsonb) from public,anon,authenticated;
grant execute on function garimpa.valid_pauta_slot_hours(jsonb) to garimpa_app;

create table garimpa.pauta_slot_config (
 tenant_id text not null references garimpa.affiliate_account(tenant_id),
 channel text not null check(channel in ('whatsapp','stories')),
 version integer not null default 1 check(version>0),enabled boolean not null default false,
 timezone text not null default 'America/Sao_Paulo',hours jsonb not null default '[]'::jsonb check(garimpa.valid_pauta_slot_hours(hours)),
 items_per_slot integer not null default 3 check(items_per_slot between 1 and 4),
 repeat_hours integer not null default 240 check(repeat_hours between 0 and 720),
 impulse_limit_cents integer default 20000 check(impulse_limit_cents is null or impulse_limit_cents between 1 and 100000000),
 allow_price_improvement boolean not null default false,
 improvement_percent integer not null default 5 check(improvement_percent between 1 and 50),
 dom_window_hours integer not null default 12 check(dom_window_hours in (12,24)),
 updated_at timestamptz not null default now(),primary key(tenant_id,channel),
 check(not enabled or jsonb_array_length(hours)>0)
);
create table garimpa.pauta_slot_occurrence (
 id uuid primary key default gen_random_uuid(),tenant_id text not null,channel text not null,
 scheduled_at timestamptz not null,config_version integer not null check(config_version>0),
 status text not null default 'pending' check(status in ('pending','expired','cancelled')),
 predicted jsonb not null default '[]'::jsonb check(jsonb_typeof(predicted)='array' and jsonb_array_length(predicted)<=12),
 updated_at timestamptz not null default now(),created_at timestamptz not null default now(),
 unique(tenant_id,channel,scheduled_at),unique(id,tenant_id,channel),
 foreign key(tenant_id,channel) references garimpa.pauta_slot_config(tenant_id,channel)
);
create index pauta_slot_next on garimpa.pauta_slot_occurrence(tenant_id,channel,scheduled_at) where status='pending';
create table garimpa.pauta_slot_preparation (
 tenant_id text not null,channel text not null,slot_id uuid not null,preparation_id uuid not null,
 product_id text not null,created_at timestamptz not null default now(),
 primary key(tenant_id,channel,slot_id,preparation_id),
 foreign key(slot_id,tenant_id,channel) references garimpa.pauta_slot_occurrence(id,tenant_id,channel),
 foreign key(tenant_id,channel,preparation_id) references garimpa.recommendation_edition_archive(tenant_id,channel,id),
 foreign key(product_id,tenant_id) references garimpa.product(id,tenant_id)
);
alter table garimpa.pauta_slot_config enable row level security;
alter table garimpa.pauta_slot_occurrence enable row level security;
alter table garimpa.pauta_slot_preparation enable row level security;
create policy pauta_slot_config_read on garimpa.pauta_slot_config for select to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and (current_setting('garimpa.actor_type',true)='worker' or current_setting('garimpa.membership_role',true) in ('owner','operator')));
create policy pauta_slot_config_write on garimpa.pauta_slot_config for all to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and current_setting('garimpa.actor_type',true)='human' and current_setting('garimpa.membership_role',true)='owner')
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and current_setting('garimpa.actor_type',true)='human' and current_setting('garimpa.membership_role',true)='owner');
create policy pauta_slot_occurrence_scope on garimpa.pauta_slot_occurrence to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and (current_setting('garimpa.actor_type',true)='worker' or current_setting('garimpa.membership_role',true) in ('owner','operator')))
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and (current_setting('garimpa.actor_type',true)='worker' or current_setting('garimpa.membership_role',true) in ('owner','operator')));
create policy pauta_slot_preparation_scope on garimpa.pauta_slot_preparation to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and current_setting('garimpa.membership_role',true) in ('owner','operator'))
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and garimpa.active_tenant(tenant_id)
   and current_setting('garimpa.actor_type',true)='human' and current_setting('garimpa.membership_role',true) in ('owner','operator'));
revoke all on garimpa.pauta_slot_config,garimpa.pauta_slot_occurrence,garimpa.pauta_slot_preparation from public,anon,authenticated,garimpa_public_runtime;
grant select,insert,update on garimpa.pauta_slot_config,garimpa.pauta_slot_occurrence to garimpa_app;
grant select,insert on garimpa.pauta_slot_preparation to garimpa_app;
create trigger signal_curation_slot_config after insert or update on garimpa.pauta_slot_config
 for each row execute function garimpa.signal_curation_projection();
do $$
declare t text;
begin
 foreach t in array array['pauta_slot_config','curation_score_projection','curation_attribute_assessment'] loop
   execute format('create trigger pauta_changed_insert after insert on garimpa.%I referencing new table as pauta_new for each statement execute function garimpa.invalidate_pauta_selection()',t);
   execute format('create trigger pauta_changed_update after update on garimpa.%I referencing old table as pauta_old new table as pauta_new for each statement execute function garimpa.invalidate_pauta_selection()',t);
   execute format('create trigger pauta_changed_delete after delete on garimpa.%I referencing old table as pauta_old for each statement execute function garimpa.invalidate_pauta_selection()',t);
 end loop;
end $$;
create function garimpa.signal_pauta_slot_channel() returns trigger
language plpgsql security invoker set search_path=pg_catalog,garimpa as $$
declare account_id text;
begin
 account_id:=case when tg_op='DELETE' then old.tenant_id else new.tenant_id end;
 if coalesce(case when tg_op='DELETE' then old.channel else new.channel end,'') in ('whatsapp','stories') then
   perform pg_notify('garimpa_curation_ready',json_build_object('tenantId',account_id)::text);
 end if;
 return null;
end $$;
revoke all on function garimpa.signal_pauta_slot_channel() from public,anon,authenticated,garimpa_public_runtime;
create trigger signal_pauta_slot_channel after insert or update or delete on garimpa.recommendation_channel
 for each row execute function garimpa.signal_pauta_slot_channel();
commit;
