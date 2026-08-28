-- Pareamento e identidade de dispositivo (E4, 26/08/2026).
-- Substitui o token global da captura por identidade revogável de dispositivo.
-- NÃO aplicada nesta sessão (ação externa pendente de autorização).

-- Dispositivo da extensão -------------------------------------------------
create table garimpa.extension_device (
  id                     text primary key default gen_random_uuid()::text,
  affiliate_id           text not null references garimpa.affiliate_account (id) on delete restrict,
  created_by_app_user_id text not null references garimpa.app_user (id) on delete restrict,
  name                   text not null check (char_length(name) between 1 and 80),
  token_hash             text unique,
  token_prefix           text,
  pairing_code_hash      text unique,
  pairing_expires_at     timestamptz,
  paired_at              timestamptz,
  last_used_at           timestamptz,
  revoked_at             timestamptz,
  created_at             timestamptz not null default now()
);
create index extension_device_affiliate_idx on garimpa.extension_device (affiliate_id, created_at desc);

-- Proveniência da observação de preço -------------------------------------
alter table garimpa.price_observation
  add column if not exists capture_source text,
  add column if not exists extension_device_id text,
  add column if not exists client_request_id uuid,
  add column if not exists source_page_url text,
  add column if not exists client_captured_at timestamptz,
  add column if not exists received_at timestamptz not null default now();

-- Backfill de proveniência: o que veio de varredura é 'sweep'; o resto é legado.
update garimpa.price_observation
set capture_source = case when capture_run_id is not null then 'sweep' else 'legacy' end
where capture_source is null;

alter table garimpa.price_observation
  alter column capture_source set default 'legacy',
  alter column capture_source set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'price_observation_capture_source_check' and conrelid = 'garimpa.price_observation'::regclass) then
    alter table garimpa.price_observation
      add constraint price_observation_capture_source_check
      check (capture_source in ('sweep', 'bookmarklet', 'extension', 'legacy'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'price_observation_extension_device_id_fkey' and conrelid = 'garimpa.price_observation'::regclass) then
    alter table garimpa.price_observation
      add constraint price_observation_extension_device_id_fkey
      foreign key (extension_device_id) references garimpa.extension_device (id) on delete restrict;
  end if;
end $$;

-- Idempotência: um dispositivo só grava uma observação por client_request_id.
create unique index if not exists price_observation_device_request_idx
  on garimpa.price_observation (extension_device_id, client_request_id)
  where extension_device_id is not null and client_request_id is not null;

grant select, insert, update, delete on garimpa.extension_device to garimpa_app;

comment on column garimpa.price_observation.capture_source is
  'Origem da observação: sweep, bookmarklet, extension ou legacy (pré-E4).';
comment on column garimpa.price_observation.client_request_id is
  'requestId idempotente do client; único por dispositivo (retry não duplica observação).';
