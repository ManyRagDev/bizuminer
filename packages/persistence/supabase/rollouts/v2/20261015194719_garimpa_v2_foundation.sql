-- Replacement BizuMiner V2 rollout. Execute only the explicit manifest, one transaction per unit.
-- Supersedes pending original2--12 for this baseline; never reapply already-installed originals.
-- Candidate for isolated verification, NOT a production approval. Preserve history and data on recovery.
set local search_path=pg_catalog;
set local standard_conforming_strings=on;
set local lock_timeout='5s';
set local statement_timeout='45s';
do $guard$ begin
 if (select coalesce(jsonb_agg(tablename order by tablename),'[]'::jsonb) from pg_tables where schemaname='garimpa') <> '["affiliate_account","affiliate_marketplace_config","affiliate_membership","affiliate_monitoring_policy","affiliate_monitoring_policy_event","affiliate_monitoring_skip","affiliate_secret","app_user","app_user_role","buyer_profile","capture_batch","capture_run","click_event","curation_event","editorial_assessment","editorial_guideline","editorial_selection","editorial_selection_item","extension_device","favorite","price_observation","price_watch","product","product_curation","publication","short_link","subscriber","triage_run"]'::jsonb then raise exception 'rollout_table_inventory_mismatch'; end if;
 end $guard$;
do $guard$ begin
 if (select coalesce(jsonb_agg(jsonb_build_object('tablename',tablename,'policyname',policyname,'permissive',permissive,'roles',roles,'cmd',cmd,'qual',qual,'with_check',with_check) order by tablename,policyname),'[]'::jsonb) from pg_policies where schemaname='garimpa') <> '[{"tablename":"affiliate_account","policyname":"affiliate_account_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"affiliate_marketplace_config","policyname":"affiliate_marketplace_config_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"affiliate_membership","policyname":"affiliate_membership_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"affiliate_monitoring_policy","policyname":"affiliate_monitoring_policy_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"affiliate_monitoring_policy_event","policyname":"affiliate_monitoring_policy_event_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"affiliate_monitoring_skip","policyname":"affiliate_monitoring_skip_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"affiliate_secret","policyname":"affiliate_secret_bootstrap_scope","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"((tenant_id = NULLIF(current_setting(''garimpa.tenant_id''::text, true), ''''::text)) AND ((current_setting(''garimpa.membership_role''::text, true) = ''owner''::text) OR (current_setting(''garimpa.actor_type''::text, true) = ''worker''::text)) AND (EXISTS ( SELECT 1\n   FROM garimpa.affiliate_account a\n  WHERE ((a.tenant_id = affiliate_secret.tenant_id) AND (a.status = ''active''::text)))))","with_check":"((tenant_id = NULLIF(current_setting(''garimpa.tenant_id''::text, true), ''''::text)) AND ((current_setting(''garimpa.membership_role''::text, true) = ''owner''::text) OR (current_setting(''garimpa.actor_type''::text, true) = ''worker''::text)) AND (EXISTS ( SELECT 1\n   FROM garimpa.affiliate_account a\n  WHERE ((a.tenant_id = affiliate_secret.tenant_id) AND (a.status = ''active''::text)))))"},{"tablename":"app_user","policyname":"app_user_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"app_user_role","policyname":"app_user_role_runtime_read","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"SELECT","qual":"true","with_check":null},{"tablename":"buyer_profile","policyname":"buyer_profile_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"capture_batch","policyname":"capture_batch_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"capture_run","policyname":"capture_run_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"click_event","policyname":"click_event_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"curation_event","policyname":"curation_event_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"SELECT","qual":"true","with_check":null},{"tablename":"curation_event","policyname":"curation_event_app_insert","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"INSERT","qual":null,"with_check":"true"},{"tablename":"editorial_assessment","policyname":"editorial_assessment_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"editorial_guideline","policyname":"editorial_guideline_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"editorial_selection","policyname":"editorial_selection_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"editorial_selection_item","policyname":"editorial_selection_item_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"extension_device","policyname":"extension_device_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"favorite","policyname":"favorite_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"price_observation","policyname":"price_observation_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"price_watch","policyname":"price_watch_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"product","policyname":"product_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"product_curation","policyname":"product_curation_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"publication","policyname":"publication_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"short_link","policyname":"short_link_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"subscriber","policyname":"subscriber_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"},{"tablename":"triage_run","policyname":"triage_run_app_access","permissive":"PERMISSIVE","roles":["garimpa_app"],"cmd":"ALL","qual":"true","with_check":"true"}]'::jsonb then raise exception 'rollout_policy_inventory_mismatch'; end if;
 end $guard$;
do $guard$ begin
 if (select coalesce(jsonb_agg(jsonb_build_object('schema',case when d.defaclnamespace=0 then '<global>' else n.nspname end,'object_type',d.defaclobjtype,'acl',d.defaclacl::text) order by d.defaclnamespace,d.defaclobjtype),'[]'::jsonb) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclrole=(select oid from pg_roles where rolname=current_user) and (d.defaclnamespace=0 or n.nspname='garimpa')) <> '[{"schema":"garimpa","object_type":"r","acl":"{garimpa_app=arwd/postgres}"}]'::jsonb then raise exception 'rollout_default_privilege_inventory_mismatch'; end if;
end $guard$;

do $guard$ begin
 if to_regprocedure('garimpa.resolve_actor_identity(text)') is null or
    (select count(*) from pg_constraint where connamespace='garimpa'::regnamespace and conname in
      ('product_curation_reviewer_user_fkey','editorial_selection_actor_user_fkey') and convalidated)<>2 then
  raise exception 'rollout_installed_subset_required'; end if;
 if exists(select 1 from pg_roles where rolname='garimpa_public_runtime') or to_regprocedure('garimpa.active_tenant(text)') is not null then
  raise exception 'rollout_foundation_already_exists_or_drift'; end if;
 if not exists(select 1 from pg_roles where rolname='garimpa_app' and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolreplication) then raise exception 'unsafe_runtime_role'; end if;
 if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname='garimpa_app') then raise exception 'unexpected_initial_runtime_membership'; end if;
end $guard$;
create role garimpa_public_runtime nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
grant garimpa_public_runtime to garimpa_app;
grant usage on schema garimpa to garimpa_public_runtime;
-- No grant on any existing private table.
create function garimpa.active_tenant(p_tenant text)
returns boolean language sql stable security definer set search_path=pg_catalog,garimpa
as $$ select exists(select 1 from garimpa.affiliate_account where tenant_id=p_tenant and status='active'); $$;
revoke all on function garimpa.active_tenant(text) from public,anon,authenticated;
grant execute on function garimpa.active_tenant(text) to garimpa_app;
create function garimpa.prevent_tenant_mutation()
returns trigger language plpgsql set search_path=pg_catalog,garimpa as $$ begin
 if new.tenant_id is distinct from old.tenant_id then raise exception 'tenant_immutable'; end if;
 return new;
end $$;
revoke all on function garimpa.prevent_tenant_mutation() from public,anon,authenticated;
create table garimpa.rollout_control (
 id text primary key check(id='bizuminer-v2'), enabled boolean not null default false
);
insert into garimpa.rollout_control(id) values('bizuminer-v2');
revoke all on garimpa.rollout_control from public,anon,authenticated,garimpa_app,garimpa_public_runtime;
grant select on garimpa.rollout_control to garimpa_app;
alter table garimpa.rollout_control enable row level security;
create policy rollout_status_read on garimpa.rollout_control for select to garimpa_app using(id='bizuminer-v2');
create function garimpa.commercial_rollout_ready()
returns boolean language sql stable security invoker set search_path=pg_catalog,garimpa
as $$ select coalesce((select enabled from garimpa.rollout_control where id='bizuminer-v2'),false); $$;
revoke all on function garimpa.commercial_rollout_ready() from public,anon,authenticated;
grant execute on function garimpa.commercial_rollout_ready() to garimpa_app;
