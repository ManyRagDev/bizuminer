-- M4-D — Contrato de agrupamento e contexto imutável (03/09/2026).
--
-- Aditivo, não destrutivo. Quatro mudanças:
--   1. família do produto vira dado estruturado em `product` (key/label/método/
--      versão do classificador), para a curadoria agrupar sem re-classificar;
--   2. "Depois" (adiar) vira coluna `deferred_until` em `product_curation`,
--      sem virar rejeição — o produto sai da fila só até a data;
--   3. `family_saturation` entra como motivo válido de espera (nunca de
--      rejeição) nas constraints das duas tabelas de curadoria;
--   4. `curation_event` ganha `group_id`/`review_session_id`/`bulk_action_id`
--      para ações em lote auditáveis e uma view única de fatos da fila
--      (base tanto da tela quanto do snapshot imutável da decisão).
--
-- O snapshot da decisão (metadata versionado no curation_event) é obrigatório
-- por construção no código (único funil: curation-db) e verificado por
-- `verify-editorial-context.ts`; não há constraint de banco porque a migration
-- roda antes do deploy web e bloquearia o fluxo humano no intervalo.
--
-- Família NÃO é backfill aqui: a classificação vive em TS
-- (`product-family.ts`), fonte única. Linhas antigas permanecem com família
-- nula até serem re-observadas ou backfill explícito por script.

-- 1. Família estruturada ----------------------------------------------------
alter table garimpa.product
  add column if not exists family_key text,
  add column if not exists family_label text,
  add column if not exists family_method text,
  add column if not exists family_version text;

do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'product_family_presence_check'
      and conrelid = 'garimpa.product'::regclass) then
    alter table garimpa.product
      add constraint product_family_presence_check check (
        (family_key is null and family_label is null
         and family_method is null and family_version is null)
        or (family_key is not null and family_label is not null
            and family_method is not null and family_version is not null)
      );
  end if;
end $$;

create index if not exists product_tenant_family_idx
  on garimpa.product (tenant_id, family_key)
  where family_key is not null;

comment on column garimpa.product.family_key is
  'Família editorial reconhecida na captura; null quando o classificador não tem pista (produto singular).';
comment on column garimpa.product.family_label is
  'Rótulo humano da família (dicionário de product-family.ts).';
comment on column garimpa.product.family_method is
  'Método do classificador que produziu a família (ex.: title-keywords).';
comment on column garimpa.product.family_version is
  'Versão das regras usadas na classificação; muda quando o dicionário evolui.';

-- 2. "Depois" sem virar rejeição -------------------------------------------
alter table garimpa.product_curation
  add column if not exists deferred_until timestamptz;

create index if not exists product_curation_deferred_idx
  on garimpa.product_curation (tenant_id, deferred_until)
  where deferred_until is not null;

do $$ begin
  if not exists (select 1 from pg_constraint
    where conname = 'product_curation_deferred_status_check'
      and conrelid = 'garimpa.product_curation'::regclass) then
    alter table garimpa.product_curation
      add constraint product_curation_deferred_status_check
        check (deferred_until is null or status in ('pending', 'legacy_visible', 'held'));
  end if;
end $$;

comment on column garimpa.product_curation.deferred_until is
  'Quando definido, o produto sai das filas de avaliação até este instante; não altera o status editorial (adiar nunca é rejeitar).';

-- 3. family_saturation como motivo de espera -------------------------------
alter table garimpa.product_curation
  drop constraint if exists product_curation_reason_check;
alter table garimpa.product_curation
  add constraint product_curation_reason_check
    check (reason_code is null or reason_code in (
      'adult_sexual', 'misleading_claim', 'low_utility', 'unsafe_restricted',
      'audience_mismatch', 'low_quality_listing', 'duplicate',
      'insufficient_evidence', 'weak_offer', 'stale_offer', 'unavailable',
      'family_saturation', 'other'
    ));

alter table garimpa.product_curation
  drop constraint if exists product_curation_reason_context_check;
alter table garimpa.product_curation
  add constraint product_curation_reason_context_check
    check (
      (status = 'rejected' and reason_code in (
        'adult_sexual', 'misleading_claim', 'low_utility', 'unsafe_restricted',
        'audience_mismatch', 'low_quality_listing', 'duplicate', 'other'
      ))
      or (status = 'held' and reason_code in (
        'insufficient_evidence', 'weak_offer', 'stale_offer', 'unavailable',
        'family_saturation', 'other'
      ))
      or (status in ('legacy_visible', 'pending', 'approved')
          and reason_code is null and reason_detail is null)
    );

alter table garimpa.curation_event
  drop constraint if exists curation_event_reason_check;
alter table garimpa.curation_event
  add constraint curation_event_reason_check
    check (reason_code is null or reason_code in (
      'adult_sexual', 'misleading_claim', 'low_utility', 'unsafe_restricted',
      'audience_mismatch', 'low_quality_listing', 'duplicate',
      'insufficient_evidence', 'weak_offer', 'stale_offer', 'unavailable',
      'family_saturation', 'other'
    ));

alter table garimpa.curation_event
  drop constraint if exists curation_event_reason_context_check;
alter table garimpa.curation_event
  add constraint curation_event_reason_context_check
    check (
      (to_status = 'rejected' and reason_code in (
        'adult_sexual', 'misleading_claim', 'low_utility', 'unsafe_restricted',
        'audience_mismatch', 'low_quality_listing', 'duplicate', 'other'
      ))
      or (to_status = 'held' and reason_code in (
        'insufficient_evidence', 'weak_offer', 'stale_offer', 'unavailable',
        'family_saturation', 'other'
      ))
      or (to_status in ('legacy_visible', 'pending', 'approved')
          and reason_code is null and reason_detail is null)
    );

-- 4. Ações em lote e view única de fatos ------------------------------------
alter table garimpa.curation_event
  add column if not exists group_id text,
  add column if not exists review_session_id text,
  add column if not exists bulk_action_id text;

create index if not exists curation_event_bulk_idx
  on garimpa.curation_event (tenant_id, bulk_action_id)
  where bulk_action_id is not null;
create index if not exists curation_event_group_idx
  on garimpa.curation_event (tenant_id, group_id)
  where group_id is not null;

comment on column garimpa.curation_event.group_id is
  'Identificador determinístico do grupo editorial a que a ação pertence (derivado de tenant+família+método/versão); nulo em decisões singulares.';
comment on column garimpa.curation_event.review_session_id is
  'Sessão de curadoria em que a ação ocorreu; ações de uma mesa compartilham o id.';
comment on column garimpa.curation_event.bulk_action_id is
  'Uma ação em lote grava um evento por produto com o mesmo bulk_action_id.';

-- View de fatos da fila: fonte única para a tela E para o snapshot imutável.
-- A observação "atual" é a mais recente; o mínimo anterior exclui essa linha;
-- a proveniência vem da PRIMEIRA observação com capture_run (a que apresentou
-- o produto), preservando marketplace, plano, modo e categoria-alvo.
-- security_invoker: a view respeita o RLS das tabelas-base como o papel que
-- consulta (quando a RLS por tenant for ativada, não vira backdoor).
create or replace view garimpa.curation_queue_facts
with (security_invoker = true) as
with latest as (
  select distinct on (product_id)
    id, product_id, tenant_id, price_cents, original_price_cents,
    claimed_discount_rate, rating_star, sales_label, sales_count, observed_at
  from garimpa.price_observation
  order by product_id, observed_at desc, id desc
), stats as (
  select l.product_id,
    count(o.id)::int as observation_count,
    floor(extract(epoch from (l.observed_at - min(o.observed_at))) / 86400)::int
      as history_days,
    min(o.price_cents) filter (where o.id <> l.id) as previous_min_price_cents
  from latest l
  join garimpa.price_observation o
    on o.product_id = l.product_id and o.tenant_id = l.tenant_id
  group by l.product_id, l.tenant_id, l.id, l.observed_at
), first_run as (
  select distinct on (product_id) product_id, capture_run_id
  from garimpa.price_observation
  where capture_run_id is not null
  order by product_id, observed_at asc, id asc
)
select p.id, p.tenant_id, p.marketplace, p.external_id, p.title, p.product_url,
       p.image_url, p.category, p.last_seen_at,
       p.family_key as family_key, p.family_label as family_label,
       p.family_method as family_method, p.family_version as family_version,
       c.status, c.reason_code, c.reason_detail, c.deferred_until,
       c.created_at as queued_at,
       l.price_cents, l.original_price_cents, l.claimed_discount_rate,
       l.rating_star, l.sales_label, l.sales_count, l.observed_at,
       s.observation_count, s.history_days, s.previous_min_price_cents,
       (s.observation_count >= 3 and s.history_days >= 7
        and l.price_cents <= s.previous_min_price_cents) as lowest_verified,
       fr.capture_run_id as presenting_capture_run_id,
       run.marketplace as presenting_marketplace,
       run.parameters ->> 'capturePlanId' as presenting_plan_id,
       run.parameters ->> 'captureQueryId' as presenting_query_id,
       run.parameters ->> 'captureMode' as presenting_mode,
       run.parameters ->> 'targetCategory' as presenting_target_category,
       run.parameters ->> 'targetFamily' as presenting_target_family
from garimpa.product_curation c
join garimpa.product p
  on p.id = c.product_id and p.tenant_id = c.tenant_id
join latest l
  on l.product_id = p.id and l.tenant_id = p.tenant_id
join stats s on s.product_id = p.id
left join first_run fr
  on fr.product_id = p.id
left join garimpa.capture_run run
  on run.id = fr.capture_run_id and run.tenant_id = p.tenant_id;

grant select on garimpa.curation_queue_facts to garimpa_app;
