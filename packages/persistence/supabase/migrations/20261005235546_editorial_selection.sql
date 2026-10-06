-- Shared, supervised editorial selection. Additive; no existing decision changes.
alter table garimpa.price_observation add column offer_evidence jsonb;
alter table garimpa.price_observation add constraint price_observation_offer_evidence_object
  check (offer_evidence is null or jsonb_typeof(offer_evidence) = 'object');

create table garimpa.editorial_assessment (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  product_id text not null,
  actor_app_user_id text not null,
  policy_version text not null,
  evidence_fingerprint text not null,
  assessment jsonb not null check (jsonb_typeof(assessment) = 'object'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, product_id, tenant_id),
  foreign key (product_id, tenant_id) references garimpa.product(id, tenant_id),
  foreign key (actor_app_user_id, tenant_id) references garimpa.app_user(id, tenant_id)
);
create index editorial_assessment_product_idx on garimpa.editorial_assessment(tenant_id, product_id, created_at desc, id desc);
create index editorial_assessment_actor_idx on garimpa.editorial_assessment(actor_app_user_id, tenant_id);

create table garimpa.editorial_selection (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null references garimpa.affiliate_account(tenant_id),
  version integer not null check (version > 0),
  status text not null check (status in ('active', 'retired')),
  valid_until timestamptz not null,
  actor_app_user_id text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, tenant_id),
  unique (tenant_id, version),
  foreign key (actor_app_user_id, tenant_id) references garimpa.app_user(id, tenant_id),
  check (valid_until > created_at)
);
create unique index editorial_selection_active_idx on garimpa.editorial_selection(tenant_id) where status = 'active';
create index editorial_selection_actor_idx on garimpa.editorial_selection(actor_app_user_id, tenant_id);

create table garimpa.editorial_selection_item (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null,
  selection_id text not null,
  product_id text not null,
  assessment_id text not null,
  position integer not null check (position between 0 and 23),
  destinations text[] not null,
  context text not null default '' check (char_length(context) <= 500),
  unique (selection_id, product_id),
  unique (selection_id, position),
  foreign key (selection_id, tenant_id) references garimpa.editorial_selection(id, tenant_id),
  foreign key (assessment_id, product_id, tenant_id) references garimpa.editorial_assessment(id, product_id, tenant_id),
  foreign key (product_id, tenant_id) references garimpa.product(id, tenant_id),
  check (destinations <@ array['home', 'pauta']::text[] and cardinality(destinations) between 1 and 2 and array_position(destinations, null) is null),
  check (destinations <> array['home','home']::text[] and destinations <> array['pauta','pauta']::text[]),
  check (cardinality(destinations) = 2 or char_length(btrim(context)) >= 3)
);
create index editorial_selection_item_assessment_idx on garimpa.editorial_selection_item(assessment_id, product_id, tenant_id);
create index editorial_selection_item_product_idx on garimpa.editorial_selection_item(product_id, tenant_id);

-- The server role is the only reader/writer. Scope and actors are checked in
-- the authenticated server boundary; composite FKs prohibit cross-tenant links.
-- Remove inherited default grants before applying the precise access model.
revoke all on garimpa.editorial_assessment, garimpa.editorial_selection, garimpa.editorial_selection_item from public, anon, authenticated, garimpa_app;
grant select, insert on garimpa.editorial_assessment, garimpa.editorial_selection_item to garimpa_app;
grant select, insert, update on garimpa.editorial_selection to garimpa_app;
alter table garimpa.editorial_assessment enable row level security;
alter table garimpa.editorial_selection enable row level security;
alter table garimpa.editorial_selection_item enable row level security;
create policy editorial_assessment_app_access on garimpa.editorial_assessment for all to garimpa_app using (true) with check (true);
create policy editorial_selection_app_access on garimpa.editorial_selection for all to garimpa_app using (true) with check (true);
create policy editorial_selection_item_app_access on garimpa.editorial_selection_item for all to garimpa_app using (true) with check (true);
