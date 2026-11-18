begin;
set local lock_timeout = '5s';

-- The selective VPS schema export predates comparative_evidence_event even
-- though it includes newer editorial objects. Do not skip any invalidation
-- source: reconcile the complete historical migration before this delta.
do $$
declare missing text[];
begin
 select array_agg(name order by name) into missing
 from unnest(array['product','price_observation','product_curation','editorial_assessment',
   'editorial_offer_choice','curation_event','comparative_evidence_event','publication',
   'affiliate_marketplace_config','affiliate_account','recommendation_channel','recommendation_exposure',
   'capture_run','capture_batch','short_link']) as source(name)
 where to_regclass('garimpa.'||name) is null;
 if missing is not null then
   raise exception 'pauta_missing_source_relations: %',array_to_string(missing,', ')
     using hint='Reconcile the baseline. comparative_evidence_event requires the complete 20261020002440_garimpa_comparative_evidence_event.sql migration; never omit source triggers.';
 end if;
end $$;

-- One committed source version per account/channel/transaction, including bulk capture.
create table garimpa.pauta_source_version (
 tenant_id text not null references garimpa.affiliate_account(tenant_id) on delete cascade,
 channel text not null check(channel in ('whatsapp','stories')),
 revision bigint not null default 1,
 view_revision bigint not null default 1,
 view_changed_in bigint not null default txid_current(),
 changed_in bigint not null default txid_current(),
 primary key(tenant_id,channel)
);
create table garimpa.pauta_selection_cache (
 tenant_id text not null,
 affiliate_id text not null references garimpa.affiliate_account(id) on delete cascade,
 channel text not null,
 source_revision bigint not null,
 format_version integer not null,
 active boolean not null,
 offer_count integer not null check(offer_count between 0 and 24),
 config_valid_until timestamptz,
 offer_valid_until timestamptz[] not null,
 selection jsonb not null,
 prepared_at timestamptz not null default now(),
 primary key(tenant_id,affiliate_id,channel),
 foreign key(tenant_id,channel) references garimpa.pauta_source_version(tenant_id,channel) on delete cascade
);
revoke all on garimpa.pauta_source_version,garimpa.pauta_selection_cache from public,anon,authenticated,garimpa_public_runtime;
grant select,insert,update on garimpa.pauta_source_version,garimpa.pauta_selection_cache to garimpa_app;
alter table garimpa.pauta_source_version enable row level security;
alter table garimpa.pauta_selection_cache enable row level security;
create policy pauta_version_scope on garimpa.pauta_source_version to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''))
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''));
create policy pauta_cache_scope on garimpa.pauta_selection_cache to garimpa_app
 using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''))
 with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and exists(
   select 1 from garimpa.affiliate_account a where a.id=affiliate_id and a.tenant_id=pauta_selection_cache.tenant_id
 ));
insert into garimpa.pauta_source_version(tenant_id,channel)
 select a.tenant_id,c.channel from garimpa.affiliate_account a cross join (values('whatsapp'),('stories')) c(channel);

-- Transition tables coalesce a whole SQL statement; changed_in coalesces the
-- remaining statements in the same transaction. Never rebuild inside a trigger.
create function garimpa.invalidate_pauta_selection() returns trigger
language plpgsql security invoker set search_path='' as $$
declare source_sql text; scope_sql text;
begin
 source_sql := case tg_op when 'INSERT' then 'select * from pauta_new'
   when 'DELETE' then 'select * from pauta_old'
   else 'select * from pauta_old union all select * from pauta_new' end;
 if tg_table_name='affiliate_marketplace_config' then
   scope_sql := format('select distinct a.tenant_id,c.channel from (%s) r join garimpa.affiliate_account a on a.id=r.affiliate_id cross join (values(''whatsapp''),(''stories'')) c(channel)',source_sql);
 elsif tg_table_name in ('recommendation_channel','recommendation_exposure') then
   scope_sql := format('select distinct r.tenant_id,r.channel from (%s) r join garimpa.affiliate_account a on a.tenant_id=r.tenant_id where r.channel in (''whatsapp'',''stories'')',source_sql);
 else
   scope_sql := format('select distinct r.tenant_id,c.channel from (%s) r join garimpa.affiliate_account a on a.tenant_id=r.tenant_id cross join (values(''whatsapp''),(''stories'')) c(channel)',source_sql);
 end if;
 if tg_table_name in ('capture_run','capture_batch','short_link') then
   execute format('insert into garimpa.pauta_source_version(tenant_id,channel) %s order by 1,2
     on conflict(tenant_id,channel) do update set view_revision=pauta_source_version.view_revision+1,view_changed_in=txid_current()
     where pauta_source_version.view_changed_in is distinct from txid_current()',scope_sql);
 else
   execute format('insert into garimpa.pauta_source_version(tenant_id,channel) %s order by 1,2
     on conflict(tenant_id,channel) do update set revision=pauta_source_version.revision+1,changed_in=txid_current(),
       view_revision=pauta_source_version.view_revision+1,view_changed_in=txid_current()
     where pauta_source_version.changed_in is distinct from txid_current() or exists(
       select 1 from garimpa.pauta_selection_cache c where c.tenant_id=pauta_source_version.tenant_id
         and c.channel=pauta_source_version.channel and c.source_revision=pauta_source_version.revision
     )',scope_sql);
 end if;
 return null;
end $$;
revoke all on function garimpa.invalidate_pauta_selection() from public,anon,authenticated;
-- Invocation is through the source-table triggers, retaining the writer's RLS.

do $$
declare t text;
begin
 foreach t in array array['product','price_observation','product_curation','editorial_assessment',
   'editorial_offer_choice','curation_event','comparative_evidence_event','publication',
   'affiliate_marketplace_config','affiliate_account','recommendation_channel','recommendation_exposure',
   'capture_run','capture_batch','short_link'] loop
   execute format('create trigger pauta_changed_insert after insert on garimpa.%I referencing new table as pauta_new for each statement execute function garimpa.invalidate_pauta_selection()',t);
   execute format('create trigger pauta_changed_update after update on garimpa.%I referencing old table as pauta_old new table as pauta_new for each statement execute function garimpa.invalidate_pauta_selection()',t);
   execute format('create trigger pauta_changed_delete after delete on garimpa.%I referencing old table as pauta_old for each statement execute function garimpa.invalidate_pauta_selection()',t);
 end loop;
end $$;
commit;
