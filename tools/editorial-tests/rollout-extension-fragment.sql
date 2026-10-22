-- Preserve the existing extension protocol: eight-character one-use pairing
-- code and SHA-256 token hash. No raw token or credential is accepted/returned.
create function garimpa.exchange_extension_pairing(p_code_hash text,p_token_hash text,p_token_prefix text)
returns table(device_id text,display_name text)
language plpgsql security definer set search_path=pg_catalog set lock_timeout='5s'
as $$
declare v_device garimpa.extension_device%rowtype; v_allowed integer;
begin
 if p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' or
    p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' or
    p_token_prefix is null or p_token_prefix !~ '^bm_ext_[A-Za-z0-9_-]{8}$' then return; end if;
 select d.* into v_device from garimpa.extension_device d
  where d.pairing_code_hash=p_code_hash and d.pairing_expires_at>now() and d.token_hash is null and d.revoked_at is null for update;
 if not found then return; end if;
 select 1 into v_allowed from garimpa.affiliate_account a
  join garimpa.affiliate_membership m on m.affiliate_id=a.id
  join garimpa.app_user_role r on r.app_user_id=m.app_user_id
  where a.id=v_device.affiliate_id and a.status='active'
   and m.app_user_id=v_device.created_by_app_user_id and m.role='owner' and m.revoked_at is null
   and r.role='afiliado' and r.revoked_at is null for share of a,m,r;
 if not found then return; end if;
 return query update garimpa.extension_device d set token_hash=p_token_hash,token_prefix=p_token_prefix,
  pairing_code_hash=null,pairing_expires_at=null,paired_at=now()
  where d.id=v_device.id and d.pairing_code_hash=p_code_hash and d.pairing_expires_at>now()
   and d.token_hash is null and d.revoked_at is null
  returning d.id,(select a.display_name from garimpa.affiliate_account a where a.id=d.affiliate_id);
end $$;
revoke all on function garimpa.exchange_extension_pairing(text,text,text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.exchange_extension_pairing(text,text,text) to garimpa_app;

-- A device can only mark its own use. No owner impersonation or general UPDATE grant.
create function garimpa.touch_extension_device(p_device_id text)
returns boolean language plpgsql security definer set search_path=pg_catalog
as $$
declare affected integer;
begin
 if current_setting('garimpa.actor_type',true) is distinct from 'device' then return false; end if;
 update garimpa.extension_device d set last_used_at=now()
 where d.id=p_device_id and d.revoked_at is null and d.token_hash is not null
   and d.created_by_app_user_id=nullif(current_setting('garimpa.actor_app_user_id',true),'')
   and exists(select 1 from garimpa.affiliate_account a
    join garimpa.affiliate_membership m on m.affiliate_id=a.id and m.app_user_id=d.created_by_app_user_id
    join garimpa.app_user_role r on r.app_user_id=m.app_user_id
    where a.id=d.affiliate_id and a.tenant_id=nullif(current_setting('garimpa.tenant_id',true),'') and a.status='active'
     and m.revoked_at is null and r.role='afiliado' and r.revoked_at is null);
 get diagnostics affected=row_count; return affected=1;
end $$;
revoke all on function garimpa.touch_extension_device(text) from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.touch_extension_device(text) to garimpa_app;
