create table garimpa.marketplace_performance (
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  marketplace text not null check (marketplace in ('mercadolivre', 'shopee', 'aliexpress', 'amazon')),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  clicks integer check (clicks >= 0),
  orders integer check (orders >= 0),
  sales_cents bigint check (sales_cents between 0 and 99999999999999),
  reported_commission_cents bigint check (reported_commission_cents between 0 and 99999999999999),
  currency text not null check (currency in ('BRL', 'USD', 'EUR')),
  updated_by text not null references garimpa.app_user(id),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, period_end, period_start, marketplace),
  check (num_nonnulls(clicks, orders, sales_cents, reported_commission_cents) > 0)
);

alter table garimpa.marketplace_performance enable row level security;
revoke all on garimpa.marketplace_performance from public, anon, authenticated;
grant select, insert on garimpa.marketplace_performance to garimpa_app;
grant update (clicks, orders, sales_cents, reported_commission_cents, currency, updated_by, updated_at)
  on garimpa.marketplace_performance to garimpa_app;

create policy marketplace_performance_active on garimpa.marketplace_performance
  as restrictive for all to garimpa_app
  using (garimpa.active_tenant(tenant_id) and garimpa.commercial_rollout_ready())
  with check (garimpa.active_tenant(tenant_id) and garimpa.commercial_rollout_ready());

create policy marketplace_performance_read on garimpa.marketplace_performance
  for select to garimpa_app
  using (
    tenant_id = nullif(current_setting('garimpa.tenant_id', true), '')
    and current_setting('garimpa.membership_role', true) in ('owner', 'operator')
  );

create policy marketplace_performance_insert on garimpa.marketplace_performance
  for insert to garimpa_app
  with check (
    tenant_id = nullif(current_setting('garimpa.tenant_id', true), '')
    and current_setting('garimpa.membership_role', true) = 'owner'
    and updated_by = nullif(current_setting('garimpa.actor_app_user_id', true), '')
  );

create policy marketplace_performance_update on garimpa.marketplace_performance
  for update to garimpa_app
  using (
    tenant_id = nullif(current_setting('garimpa.tenant_id', true), '')
    and current_setting('garimpa.membership_role', true) = 'owner'
  )
  with check (
    tenant_id = nullif(current_setting('garimpa.tenant_id', true), '')
    and current_setting('garimpa.membership_role', true) = 'owner'
    and updated_by = nullif(current_setting('garimpa.actor_app_user_id', true), '')
  );
