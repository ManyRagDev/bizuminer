-- Assinantes da newsletter (LGPD: só e-mail + consentimento, sem IP).
create table if not exists garimpa.subscriber (
  id          text primary key default gen_random_uuid()::text,
  tenant_id   text not null default 'local',
  email       text not null unique,
  source      text not null default 'web:footer',
  consented_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

grant select, insert, update, delete on garimpa.subscriber to garimpa_app;