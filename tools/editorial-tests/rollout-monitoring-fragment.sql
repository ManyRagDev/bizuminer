-- Compatibility contract for existing monitoring workers. No individual buyer rows are exposed.
-- Worker GUCs are set only by the trusted backend, transaction-local, with no human owner identity.
create function garimpa.monitoring_interest_counts(p_tenant text)
returns table(product_id text,active_watches integer)
language plpgsql stable security definer set search_path=pg_catalog,garimpa as $$
begin
 if current_setting('garimpa.actor_type',true) is distinct from 'worker'
    or nullif(current_setting('garimpa.tenant_id',true),'') is null
    or current_setting('garimpa.tenant_id',true) is distinct from p_tenant then
  raise exception 'monitoring_worker_scope_required';
 end if;
 if not garimpa.active_tenant(p_tenant) then raise exception 'monitoring_account_unavailable'; end if;
 return query select interests.product_id,count(*)::integer from (
  select w.product_id from garimpa.price_watch w where w.tenant_id=p_tenant and w.active
  union all
  select f.product_id from garimpa.favorite f where f.tenant_id=p_tenant
 ) interests group by interests.product_id;
end $$;

create function garimpa.monitoring_account_state(p_tenant text,p_marketplace text)
returns table(affiliate_id text,account_status text,enabled boolean)
language plpgsql stable security definer set search_path=pg_catalog,garimpa as $$
begin
 if current_setting('garimpa.actor_type',true) is distinct from 'worker'
    or nullif(current_setting('garimpa.tenant_id',true),'') is null
    or current_setting('garimpa.tenant_id',true) is distinct from p_tenant then
  raise exception 'monitoring_worker_scope_required';
 end if;
 return query select a.id,a.status,p.enabled from garimpa.affiliate_account a
  left join garimpa.affiliate_monitoring_policy p on p.affiliate_id=a.id and p.marketplace=p_marketplace
  where a.tenant_id=p_tenant;
end $$;

create function garimpa.monitoring_record_skip(p_affiliate text,p_marketplace text,p_run text,p_reason text)
returns void language plpgsql security definer set search_path=pg_catalog,garimpa as $$
declare v_status text; v_enabled boolean;
begin
 if current_setting('garimpa.actor_type',true) is distinct from 'worker'
    or nullif(current_setting('garimpa.tenant_id',true),'') is null then
  raise exception 'monitoring_worker_scope_required';
 end if;
 if p_marketplace is null or p_marketplace not in ('mercadolivre','shopee','aliexpress')
    or nullif(trim(p_run),'') is null or p_reason is null or p_reason not in ('policy_disabled','account_suspended') then
  raise exception 'invalid_monitoring_skip';
 end if;
 select a.status,p.enabled into v_status,v_enabled from garimpa.affiliate_account a
 left join garimpa.affiliate_monitoring_policy p on p.affiliate_id=a.id and p.marketplace=p_marketplace
 where a.id=p_affiliate and a.tenant_id=current_setting('garimpa.tenant_id',true) for share of a;
 if not found then raise exception 'monitoring_affiliate_scope_mismatch'; end if;
 if (p_reason='account_suspended' and v_status='active') or
    (p_reason='policy_disabled' and (v_status<>'active' or coalesce(v_enabled,false))) then
  raise exception 'monitoring_skip_reason_mismatch';
 end if;
 insert into garimpa.affiliate_monitoring_skip(affiliate_id,marketplace,github_run_id,reason)
 values(p_affiliate,p_marketplace,p_run,p_reason)
 on conflict(affiliate_id,marketplace,github_run_id) do nothing;
end $$;
revoke all on function garimpa.monitoring_interest_counts(text),garimpa.monitoring_account_state(text,text),garimpa.monitoring_record_skip(text,text,text,text) from public,anon,authenticated;
grant execute on function garimpa.monitoring_interest_counts(text),garimpa.monitoring_account_state(text,text),garimpa.monitoring_record_skip(text,text,text,text) to garimpa_app;
