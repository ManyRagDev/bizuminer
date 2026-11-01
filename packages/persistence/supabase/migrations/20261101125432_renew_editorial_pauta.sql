-- Account opt-in and operational result; never a public endpoint or a review.
set local lock_timeout = '5s';
set local statement_timeout = '45s';

alter table garimpa.homepage_product_history add column last_featured_at timestamptz;
update garimpa.homepage_product_history set last_featured_at=first_featured_at;
alter table garimpa.homepage_product_history alter column last_featured_at set not null;
alter table garimpa.homepage_product_history alter column last_featured_at set default now();
grant update(last_featured_at) on garimpa.homepage_product_history to garimpa_app;

create table garimpa.homepage_renewal (
  tenant_id text primary key references garimpa.affiliate_account(tenant_id),
  enabled boolean not null default false,
  last_attempt_at timestamptz,
  outcome text not null default 'not_started' check(outcome in
    ('not_started','published','unchanged','awaiting_review','manual_edition','failed'))
);
revoke all on garimpa.homepage_renewal from public,anon,authenticated,garimpa_public_runtime,garimpa_app;
grant select,insert,update on garimpa.homepage_renewal to garimpa_app;
alter table garimpa.homepage_renewal enable row level security;
create policy homepage_renewal_read on garimpa.homepage_renewal for select to garimpa_app
  using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),''));
create policy homepage_renewal_insert on garimpa.homepage_renewal for insert to garimpa_app
  with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'')
    and (current_setting('garimpa.membership_role',true)='owner' or current_setting('garimpa.actor_type',true)='worker'));
create policy homepage_renewal_update on garimpa.homepage_renewal for update to garimpa_app
  using(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'')
    and (current_setting('garimpa.membership_role',true)='owner' or current_setting('garimpa.actor_type',true)='worker'))
  with check(tenant_id=nullif(current_setting('garimpa.tenant_id',true),'')
    and (current_setting('garimpa.membership_role',true)='owner' or current_setting('garimpa.actor_type',true)='worker'));
