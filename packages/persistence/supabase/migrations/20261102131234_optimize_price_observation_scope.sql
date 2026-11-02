-- Cache only the row-independent account check, for one statement. Keep the
-- tenant predicate, restrictive policy, platform branch, and both write checks.
-- No grants, account status, observations, functions or FORCE RLS are changed.
set local lock_timeout = '5s';
set local statement_timeout = '45s';

alter policy price_observation_tenant_scope on garimpa.price_observation
using (
  tenant_id = nullif(current_setting('garimpa.tenant_id', true), '')
  and (select garimpa.active_tenant(nullif(current_setting('garimpa.tenant_id', true), '')))
)
with check (
  tenant_id = nullif(current_setting('garimpa.tenant_id', true), '')
  and (select garimpa.active_tenant(nullif(current_setting('garimpa.tenant_id', true), '')))
);

alter policy price_observation_active_account on garimpa.price_observation
using (
  case when tenant_id = nullif(current_setting('garimpa.tenant_id', true), '')
    then (select garimpa.active_tenant(nullif(current_setting('garimpa.tenant_id', true), '')))
    else garimpa.active_tenant(tenant_id)
  end
  or nullif(current_setting('garimpa.platform_role', true), '') = any(array['platform_admin', 'service_role'])
)
with check (
  case when tenant_id = nullif(current_setting('garimpa.tenant_id', true), '')
    then (select garimpa.active_tenant(nullif(current_setting('garimpa.tenant_id', true), '')))
    else garimpa.active_tenant(tenant_id)
  end
  or nullif(current_setting('garimpa.platform_role', true), '') = any(array['platform_admin', 'service_role'])
);
