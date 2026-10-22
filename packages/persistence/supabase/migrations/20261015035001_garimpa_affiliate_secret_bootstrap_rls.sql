-- Safety closure for a partially applied rollout: M-10A1 creates this table,
-- while broad RLS activation remains a separate, blocked operation.
-- Protect only the new empty secret table; no legacy policy is changed.
revoke all on garimpa.affiliate_secret from public, anon, authenticated;
alter table garimpa.affiliate_secret enable row level security;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='garimpa' and tablename='affiliate_secret' and policyname='affiliate_secret_bootstrap_scope') then
  create policy affiliate_secret_bootstrap_scope on garimpa.affiliate_secret
   for all to garimpa_app
   using (
    tenant_id=nullif(current_setting('garimpa.tenant_id',true),'')
    and (current_setting('garimpa.membership_role',true)='owner' or current_setting('garimpa.actor_type',true)='worker')
    and exists(select 1 from garimpa.affiliate_account a where a.tenant_id=affiliate_secret.tenant_id and a.status='active')
   )
   with check (
    tenant_id=nullif(current_setting('garimpa.tenant_id',true),'')
    and (current_setting('garimpa.membership_role',true)='owner' or current_setting('garimpa.actor_type',true)='worker')
    and exists(select 1 from garimpa.affiliate_account a where a.tenant_id=affiliate_secret.tenant_id and a.status='active')
   );
 end if;
end $$;
