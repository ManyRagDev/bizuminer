-- Área do comprador (pré-auth): identidade por cookie, favoritos persistentes,
-- acompanhamento de preço com baseline e perfil de preferências.
-- Decisão registrada em docs/tecnico/plano-area-logada.md (19/08/2026):
-- auth entra depois; auth_user_id já nasce para o merge ser um update.
-- Aplicada remotamente via MCP como `garimpa_member_area` (19/08/2026).

create table garimpa.app_user (
  id            text primary key,                 -- uuid do cookie bm_uid
  tenant_id     text not null default 'local',
  auth_user_id  text,                             -- futuro: Supabase Auth
  display_name  text,
  email         text,                             -- só com consentimento explícito (AL-4)
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index app_user_tenant_idx on garimpa.app_user (tenant_id, last_seen_at desc);

create table garimpa.favorite (
  id          text primary key default gen_random_uuid()::text,
  tenant_id   text not null default 'local',
  user_id     text not null references garimpa.app_user (id) on delete cascade,
  product_id  text not null references garimpa.product (id) on delete restrict,
  created_at  timestamptz not null default now(),
  unique (user_id, product_id)
);
create index favorite_user_idx on garimpa.favorite (user_id, created_at desc);
create index favorite_product_idx on garimpa.favorite (product_id);

-- Baseline = preço no momento da marcação. O "movimento desde que você marcou"
-- é sempre derivado (observação atual - baseline), nunca gravado como fato.
create table garimpa.price_watch (
  id                   text primary key default gen_random_uuid()::text,
  tenant_id            text not null default 'local',
  user_id              text not null references garimpa.app_user (id) on delete cascade,
  product_id           text not null references garimpa.product (id) on delete restrict,
  baseline_price_cents integer not null,
  target_price_cents   integer,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  deactivated_at       timestamptz,
  unique (user_id, product_id)
);
create index price_watch_user_idx on garimpa.price_watch (user_id, created_at desc);
create index price_watch_product_active_idx on garimpa.price_watch (product_id) where active;

create table garimpa.buyer_profile (
  user_id              text primary key references garimpa.app_user (id) on delete cascade,
  tenant_id            text not null default 'local',
  preferred_categories text[] not null default '{}',
  price_band           text not null default 'all'
                       check (price_band in ('all', 'under_100', '100_500', 'over_500')),
  updated_at           timestamptz not null default now()
);

grant select, insert, update, delete
  on garimpa.app_user, garimpa.favorite, garimpa.price_watch, garimpa.buyer_profile
  to garimpa_app;
