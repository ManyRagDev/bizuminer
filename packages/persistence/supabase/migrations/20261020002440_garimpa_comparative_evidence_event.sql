-- Migration: 20261020002440_garimpa_comparative_evidence_event.sql
-- OS-037 / AC-037.1: Registro durável e imutável de mutações de evidência comparativa.

set local search_path = pg_catalog, garimpa;

create table if not exists garimpa.comparative_evidence_event (
  id bigint generated always as identity primary key,
  tenant_id text not null,
  product_id text not null,
  subject text not null check (subject in ('product', 'observation')),
  operation text not null check (operation in ('insert', 'update', 'delete')),
  observation_id text,
  material_projection jsonb not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint comparative_evidence_event_product_fkey
    foreign key (product_id, tenant_id) references garimpa.product (id, tenant_id) on delete cascade
);

create index if not exists comparative_evidence_event_lookup_idx
  on garimpa.comparative_evidence_event (tenant_id, product_id, id);

alter table garimpa.comparative_evidence_event enable row level security;

drop policy if exists comparative_evidence_event_tenant_read on garimpa.comparative_evidence_event;
create policy comparative_evidence_event_tenant_read
  on garimpa.comparative_evidence_event
  for select
  to garimpa_app
  using (tenant_id = nullif(current_setting('garimpa.tenant_id', true), ''));

grant select on garimpa.comparative_evidence_event to garimpa_app;

create or replace function garimpa.record_comparative_evidence_event_from_product()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, garimpa
as $$
declare
  v_tenant_id text := coalesce(new.tenant_id, old.tenant_id);
  v_product_id text := coalesce(new.id, old.id);
  v_projection jsonb;
begin
  if tg_op = 'UPDATE' then
    if old.last_price_cents is not distinct from new.last_price_cents
       and old.product_url is not distinct from new.product_url
       and old.title is not distinct from new.title
       and old.marketplace is not distinct from new.marketplace
       and old.external_id is not distinct from new.external_id then
      return new;
    end if;
  end if;

  v_projection := jsonb_build_object(
    'priceCents', case when tg_op = 'DELETE' then old.last_price_cents else new.last_price_cents end,
    'marketplace', case when tg_op = 'DELETE' then old.marketplace else new.marketplace end,
    'externalId', case when tg_op = 'DELETE' then old.external_id else new.external_id end,
    'productUrl', case when tg_op = 'DELETE' then old.product_url else new.product_url end,
    'title', case when tg_op = 'DELETE' then old.title else new.title end,
    'variantKey', null,
    'variantLabel', null,
    'variantConfirmed', false,
    'sourceUrl', null,
    'sourceMarketplace', null
  );

  insert into garimpa.comparative_evidence_event (
    tenant_id, product_id, subject, operation, observation_id, material_projection, recorded_at
  ) values (
    v_tenant_id, v_product_id, 'product', lower(tg_op), null, v_projection, clock_timestamp()
  );

  return coalesce(new, old);
end;
$$;

create or replace function garimpa.record_comparative_evidence_event_from_observation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, garimpa
as $$
declare
  v_tenant_id text := coalesce(new.tenant_id, old.tenant_id);
  v_product_id text := coalesce(new.product_id, old.product_id);
  v_obs_id text := coalesce(new.id, old.id);
  v_target_obs record;
  v_prod record;
  v_evidence jsonb;
  v_source jsonb;
  v_variant_key text;
  v_variant_label text;
  v_variant_confirmed boolean := false;
  v_source_url text;
  v_source_marketplace text;
  v_projection jsonb;
begin
  -- AC-037.2: Adquirir bloqueio conflitante do produto correspondente ANTES de emitir o evento
  perform 1 from garimpa.product
  where tenant_id = v_tenant_id and id = v_product_id
  for update;

  if tg_op = 'DELETE' then
    v_target_obs := old;
  else
    v_target_obs := new;
  end if;

  select marketplace, external_id, product_url, title
  into v_prod
  from garimpa.product
  where tenant_id = v_tenant_id and id = v_product_id;

  v_evidence := coalesce(v_target_obs.offer_evidence, '{}'::jsonb);
  if v_evidence ? 'offerEvidence' and jsonb_typeof(v_evidence->'offerEvidence') = 'object' then
    v_evidence := v_evidence->'offerEvidence';
  end if;

  v_source := coalesce(v_evidence->'source', (v_target_obs.offer_evidence)->'source');

  v_variant_key := nullif(btrim(coalesce(v_evidence->>'variantKey', '')), '');
  v_variant_label := nullif(btrim(coalesce(v_evidence->>'variantLabel', '')), '');

  if (v_variant_key is not null or v_variant_label is not null) and v_source is not null then
    if (nullif(btrim(coalesce(v_source->>'marketplace', '')), '') is not null or nullif(btrim(coalesce(v_source->>'url', '')), '') is not null)
       and (nullif(btrim(coalesce(v_source->>'method', '')), '') is not null or nullif(btrim(coalesce(v_source->>'capturedAt', '')), '') is not null) then
      v_variant_confirmed := true;
    end if;
  end if;

  v_source_url := nullif(btrim(coalesce(v_source->>'url', '')), '');
  v_source_marketplace := nullif(btrim(coalesce(v_source->>'marketplace', '')), '');

  v_projection := jsonb_build_object(
    'priceCents', v_target_obs.price_cents,
    'marketplace', v_prod.marketplace,
    'externalId', v_prod.external_id,
    'productUrl', v_prod.product_url,
    'title', v_prod.title,
    'variantKey', case when v_variant_confirmed then v_variant_key else null end,
    'variantLabel', case when v_variant_confirmed then v_variant_label else null end,
    'variantConfirmed', v_variant_confirmed,
    'sourceUrl', v_source_url,
    'sourceMarketplace', v_source_marketplace,
    'source', case when v_source is not null and jsonb_typeof(v_source) = 'object' then v_source else null end
  );

  insert into garimpa.comparative_evidence_event (
    tenant_id, product_id, subject, operation, observation_id, material_projection, recorded_at
  ) values (
    v_tenant_id, v_product_id, 'observation', lower(tg_op), v_obs_id, v_projection, clock_timestamp()
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_product_comparative_evidence on garimpa.product;
create trigger trg_product_comparative_evidence
  after insert or update on garimpa.product
  for each row
  execute function garimpa.record_comparative_evidence_event_from_product();

drop trigger if exists trg_price_observation_comparative_evidence on garimpa.price_observation;
create trigger trg_price_observation_comparative_evidence
  after insert or update or delete on garimpa.price_observation
  for each row
  execute function garimpa.record_comparative_evidence_event_from_observation();

