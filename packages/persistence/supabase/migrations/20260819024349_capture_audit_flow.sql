-- Captura auditável: a execução existe antes das observações e cada preço
-- mantém a proveniência e o retrato normalizado recebido naquele momento.

alter table garimpa.capture_run
  add column if not exists collector_run_id text,
  add column if not exists parameters jsonb not null default '{}'::jsonb;

alter table garimpa.product
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_capture_run_id text;

alter table garimpa.price_observation
  add column if not exists capture_run_id text,
  add column if not exists title_snapshot text,
  add column if not exists product_url_snapshot text,
  add column if not exists image_url_snapshot text,
  add column if not exists category_snapshot text;

-- Linhas antigas não recebem um capture_run inventado. Datas de primeira e
-- última aparição, porém, podem ser reconstituídas do histórico existente.
update garimpa.product p
set first_seen_at = coalesce(history.first_seen_at, p.created_at),
    last_seen_at = coalesce(history.last_seen_at, p.updated_at)
from (
  select product_id, min(observed_at) as first_seen_at, max(observed_at) as last_seen_at
  from garimpa.price_observation
  group by product_id
) history
where history.product_id = p.id
  and (p.first_seen_at is null or p.last_seen_at is null);

update garimpa.product
set first_seen_at = coalesce(first_seen_at, created_at),
    last_seen_at = coalesce(last_seen_at, updated_at)
where first_seen_at is null or last_seen_at is null;

alter table garimpa.product
  alter column first_seen_at set default now(),
  alter column first_seen_at set not null,
  alter column last_seen_at set default now(),
  alter column last_seen_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_last_capture_run_id_fkey'
      and conrelid = 'garimpa.product'::regclass
  ) then
    alter table garimpa.product
      add constraint product_last_capture_run_id_fkey
      foreign key (last_capture_run_id) references garimpa.capture_run (id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'price_observation_capture_run_id_fkey'
      and conrelid = 'garimpa.price_observation'::regclass
  ) then
    alter table garimpa.price_observation
      add constraint price_observation_capture_run_id_fkey
      foreign key (capture_run_id) references garimpa.capture_run (id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'price_observation_capture_run_product_key'
      and conrelid = 'garimpa.price_observation'::regclass
  ) then
    alter table garimpa.price_observation
      add constraint price_observation_capture_run_product_key
      unique (capture_run_id, product_id);
  end if;
end $$;

-- Histórico e execuções não devem desaparecer por uma exclusão acidental do
-- produto. O catálogo pode deixar de exibir uma oferta sem apagar a auditoria.
alter table garimpa.price_observation
  drop constraint if exists price_observation_product_id_fkey;

alter table garimpa.price_observation
  add constraint price_observation_product_id_fkey
  foreign key (product_id) references garimpa.product (id) on delete restrict;

create index if not exists product_last_capture_run_idx
  on garimpa.product (last_capture_run_id);

create index if not exists product_tenant_last_seen_idx
  on garimpa.product (tenant_id, marketplace, last_seen_at desc);

create index if not exists price_observation_capture_run_idx
  on garimpa.price_observation (capture_run_id);

create index if not exists capture_run_tenant_marketplace_started_idx
  on garimpa.capture_run (tenant_id, marketplace, started_at desc);

comment on column garimpa.capture_run.collector_run_id is
  'Identificador da execução no processo coletor, usado para correlacionar logs.';
comment on column garimpa.capture_run.parameters is
  'Parâmetros não sensíveis usados pela captura; credenciais nunca entram aqui.';
comment on column garimpa.product.first_seen_at is
  'Primeira vez em que este anúncio foi observado pelo BizuMiner.';
comment on column garimpa.product.last_seen_at is
  'Última vez em que este anúncio apareceu numa captura; ausência não prova indisponibilidade.';
comment on column garimpa.price_observation.capture_run_id is
  'Execução que produziu a observação; nulo apenas em registros legados.';
