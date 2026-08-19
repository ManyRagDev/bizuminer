-- Garimpa Phase 2 — schema inicial (modelo-de-dados.md, subconjunto)
create schema if not exists garimpa;
comment on schema garimpa is 'Garimpa — agregador de ofertas de afiliados (captura ML /ofertas)';

-- Catálogo -------------------------------------------------------------
create table garimpa.product (
  id            text primary key,
  tenant_id     text not null,
  marketplace   text not null,
  external_id   text not null,
  title         text not null,
  product_url   text not null,
  image_url     text,
  last_price_cents integer not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, marketplace, external_id)
);

-- Histórico de preço (append-only; dado não gravado não se recupera) ----
create table garimpa.price_observation (
  id            text primary key,
  tenant_id     text not null,
  product_id    text not null references garimpa.product (id) on delete cascade,
  price_cents   integer not null,
  original_price_cents integer,
  claimed_discount_rate double precision,
  observed_at   timestamptz not null default now()
);
create index price_observation_product_idx on garimpa.price_observation (product_id, observed_at);

-- Execuções do worker (zero itens = alerta) ----------------------------
create table garimpa.capture_run (
  id            text primary key,
  tenant_id     text not null,
  marketplace   text not null,
  started_at    timestamptz not null,
  finished_at   timestamptz,
  status        text not null check (status in ('running', 'ok', 'error')),
  items_captured integer not null default 0,
  items_new     integer not null default 0,
  price_changes integer not null default 0,
  error         text
);

-- Publicação de oferta em canal (web / telegram) -----------------------
create table garimpa.publication (
  id            text primary key,
  tenant_id     text not null,
  product_id    text not null references garimpa.product (id) on delete cascade,
  channel       text not null,
  slug          text not null unique,
  status        text not null default 'active' check (status in ('active', 'expired')),
  published_at  timestamptz not null default now()
);

-- Telemetria própria de cliques (painel ML é batchado/atrasado) --------
create table garimpa.click_event (
  id            text primary key,
  tenant_id     text not null,
  publication_id text not null references garimpa.publication (id) on delete cascade,
  clicked_at    timestamptz not null default now(),
  user_agent    text,
  referer       text,
  ip_hash       text  -- hash, nunca IP puro (LGPD)
);
create index click_event_publication_idx on garimpa.click_event (publication_id, clicked_at);
