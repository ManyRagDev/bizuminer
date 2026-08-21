-- Reparo 19/08/2026: a migration 20260817120000_garimpa_subscriber.sql existia
-- no repositório mas nunca foi aplicada; /api/newsletter respondia 500.
-- Aplicada remotamente via MCP como `garimpa_subscriber_repair` (19/08/2026).
create table if not exists garimpa.subscriber (
  id          text primary key default gen_random_uuid()::text,
  tenant_id   text not null default 'local',
  email       text not null unique,
  source      text not null default 'web:footer',
  consented_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

grant select, insert, update, delete on garimpa.subscriber to garimpa_app;
