-- M-10A2: scoped policies for the complete observed schema. Apply only after
-- staging verifies the context-aware app/workers and public projections.
create or replace function garimpa.active_tenant(p_tenant text)
returns boolean language sql stable security definer set search_path=pg_catalog,garimpa
as $$ select exists(select 1 from garimpa.affiliate_account where tenant_id=p_tenant and status='active'); $$;
revoke all on function garimpa.active_tenant(text) from public,anon,authenticated;
grant execute on function garimpa.active_tenant(text) to garimpa_app;

do $$ declare r record; p record; predicate text; begin
  for r in select t.table_name from information_schema.tables t
    where t.table_schema='garimpa' and t.table_type='BASE TABLE'
      and exists(select 1 from information_schema.columns c where c.table_schema=t.table_schema and c.table_name=t.table_name and c.column_name='tenant_id')
  loop
    -- Replace every previous runtime/public policy, not guessed suffixes.
    for p in select policyname from pg_policies where schemaname='garimpa' and tablename=r.table_name
      and ('garimpa_app'=any(roles) or 'public'=any(roles))
    loop execute format('drop policy %I on garimpa.%I',p.policyname,r.table_name); end loop;
    predicate := 'tenant_id=nullif(current_setting(''garimpa.tenant_id'',true),'''') and garimpa.active_tenant(tenant_id)';
    if r.table_name='app_user' then
      predicate := predicate || ' and id=nullif(current_setting(''garimpa.actor_app_user_id'',true),'''')';
    elsif r.table_name in ('favorite','price_watch','buyer_profile') then
      predicate := predicate || ' and user_id=nullif(current_setting(''garimpa.actor_app_user_id'',true),'''')';
    elsif r.table_name='affiliate_secret' then
      predicate := predicate || ' and (current_setting(''garimpa.membership_role'',true)=''owner'' or current_setting(''garimpa.actor_type'',true)=''worker'')';
    end if;
    execute format('alter table garimpa.%I enable row level security',r.table_name);
    execute format('create policy %I on garimpa.%I for all to garimpa_app using (%s) with check (%s)',r.table_name||'_tenant_scope',r.table_name,predicate,predicate);
  end loop;
end $$;

do $$ declare r text; p record; predicate text; begin
  foreach r in array array['affiliate_membership','affiliate_marketplace_config','affiliate_monitoring_policy','affiliate_monitoring_policy_event','affiliate_monitoring_skip','extension_device'] loop
    for p in select policyname from pg_policies where schemaname='garimpa' and tablename=r
      and ('garimpa_app'=any(roles) or 'public'=any(roles))
    loop execute format('drop policy %I on garimpa.%I',p.policyname,r); end loop;
    execute format('alter table garimpa.%I enable row level security',r);
    predicate := 'exists(select 1 from garimpa.affiliate_account a where a.id=affiliate_id and a.tenant_id=nullif(current_setting(''garimpa.tenant_id'',true),''''))';
    execute format('create policy %I on garimpa.%I for select to garimpa_app using (%s)',r||'_read',r,predicate);
    predicate := predicate || ' and current_setting(''garimpa.membership_role'',true)=''owner''';
    execute format('create policy %I on garimpa.%I for all to garimpa_app using (%s) with check (%s)',r||'_manage',r,predicate,predicate);
  end loop;
end $$;
drop policy if exists app_user_role_runtime_read on garimpa.app_user_role;
create policy app_user_role_runtime_read on garimpa.app_user_role for select to garimpa_app
  using(app_user_id=nullif(current_setting('garimpa.actor_app_user_id',true),''));

create or replace function garimpa.prevent_tenant_mutation()
returns trigger language plpgsql set search_path=pg_catalog,garimpa as $$ begin
  if new.tenant_id is distinct from old.tenant_id then raise exception 'tenant_immutable'; end if;
  return new;
end $$;
do $$ declare r record; begin
  for r in select table_name from information_schema.columns where table_schema='garimpa' and column_name='tenant_id' loop
    execute format('drop trigger if exists trg_prevent_tenant_mutation on garimpa.%I',r.table_name);
    -- Views have tenant columns too; only attach to base tables.
    if exists(select 1 from information_schema.tables where table_schema='garimpa' and table_name=r.table_name and table_type='BASE TABLE') then
      execute format('create trigger trg_prevent_tenant_mutation before update on garimpa.%I for each row execute function garimpa.prevent_tenant_mutation()',r.table_name);
    end if;
  end loop;
end $$;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='garimpa_public_runtime') then create role garimpa_public_runtime nologin; end if;
end $$;
grant garimpa_public_runtime to garimpa_app;
grant usage on schema garimpa to garimpa_public_runtime;
revoke all on all tables in schema garimpa from garimpa_public_runtime;
