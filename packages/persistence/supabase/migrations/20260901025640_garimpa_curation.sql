-- Curadoria editorial v1 (01/09/2026).
--
-- Invariantes:
--   1. todo produto tem exatamente um estado editorial por tenant;
--   2. produto novo nasce `pending` e não aparece nas superfícies públicas;
--   3. catálogo anterior à migration permanece visível como `legacy_visible`
--      enquanto entra na fila de revisão (rollout sem apagar a vitrine);
--   4. toda decisão gera evento append-only; `other` sempre carrega o texto
--      livre que alimentará a análise de padrões/LLM futura.

create table garimpa.product_curation (
  tenant_id               text not null,
  product_id              text not null,
  status                  text not null default 'pending',
  reason_code             text,
  reason_detail           text,
  reviewed_by_app_user_id text,
  reviewed_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  primary key (tenant_id, product_id),
  constraint product_curation_tenant_fkey
    foreign key (tenant_id) references garimpa.affiliate_account (tenant_id) on delete restrict,
  constraint product_curation_product_tenant_fkey
    foreign key (product_id, tenant_id) references garimpa.product (id, tenant_id) on delete restrict,
  constraint product_curation_reviewer_tenant_fkey
    foreign key (reviewed_by_app_user_id, tenant_id) references garimpa.app_user (id, tenant_id) on delete restrict,
  constraint product_curation_status_check
    check (status in ('legacy_visible', 'pending', 'approved', 'rejected', 'held')),
  constraint product_curation_reason_check
    check (reason_code is null or reason_code in (
      'adult_sexual', 'misleading_claim', 'low_utility', 'unsafe_restricted',
      'audience_mismatch', 'low_quality_listing', 'duplicate',
      'insufficient_evidence', 'weak_offer', 'stale_offer', 'unavailable', 'other'
    )),
  constraint product_curation_decision_reason_required_check
    check (status not in ('rejected', 'held') or reason_code is not null),
  constraint product_curation_reason_context_check
    check (
      (status = 'rejected' and reason_code in (
        'adult_sexual', 'misleading_claim', 'low_utility', 'unsafe_restricted',
        'audience_mismatch', 'low_quality_listing', 'duplicate', 'other'
      ))
      or (status = 'held' and reason_code in (
        'insufficient_evidence', 'weak_offer', 'stale_offer', 'unavailable', 'other'
      ))
      or (status in ('legacy_visible', 'pending', 'approved') and reason_code is null and reason_detail is null)
    ),
  constraint product_curation_other_detail_check
    check (
      reason_code is distinct from 'other'
      or (reason_detail is not null and char_length(btrim(reason_detail)) between 3 and 1000)
    )
);

create index product_curation_product_idx
  on garimpa.product_curation (product_id);
create index product_curation_queue_idx
  on garimpa.product_curation (tenant_id, created_at, product_id)
  where status in ('legacy_visible', 'pending');

create table garimpa.curation_event (
  id                    bigint generated always as identity primary key,
  tenant_id             text not null,
  product_id            text not null,
  from_status           text,
  to_status             text not null,
  reason_code           text,
  reason_detail         text,
  actor_type            text not null default 'human',
  actor_app_user_id     text,
  policy_version        text not null default 'v1',
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  constraint curation_event_tenant_fkey
    foreign key (tenant_id) references garimpa.affiliate_account (tenant_id) on delete restrict,
  constraint curation_event_product_tenant_fkey
    foreign key (product_id, tenant_id) references garimpa.product (id, tenant_id) on delete restrict,
  constraint curation_event_actor_tenant_fkey
    foreign key (actor_app_user_id, tenant_id) references garimpa.app_user (id, tenant_id) on delete restrict,
  constraint curation_event_from_status_check
    check (from_status is null or from_status in ('legacy_visible', 'pending', 'approved', 'rejected', 'held')),
  constraint curation_event_to_status_check
    check (to_status in ('legacy_visible', 'pending', 'approved', 'rejected', 'held')),
  constraint curation_event_actor_type_check
    check (actor_type in ('human', 'system', 'rule', 'llm')),
  constraint curation_event_reason_check
    check (reason_code is null or reason_code in (
      'adult_sexual', 'misleading_claim', 'low_utility', 'unsafe_restricted',
      'audience_mismatch', 'low_quality_listing', 'duplicate',
      'insufficient_evidence', 'weak_offer', 'stale_offer', 'unavailable', 'other'
    )),
  constraint curation_event_reason_context_check
    check (
      (to_status = 'rejected' and reason_code in (
        'adult_sexual', 'misleading_claim', 'low_utility', 'unsafe_restricted',
        'audience_mismatch', 'low_quality_listing', 'duplicate', 'other'
      ))
      or (to_status = 'held' and reason_code in (
        'insufficient_evidence', 'weak_offer', 'stale_offer', 'unavailable', 'other'
      ))
      or (to_status in ('legacy_visible', 'pending', 'approved') and reason_code is null and reason_detail is null)
    ),
  constraint curation_event_other_detail_check
    check (
      reason_code is distinct from 'other'
      or (reason_detail is not null and char_length(btrim(reason_detail)) between 3 and 1000)
    )
);

create index curation_event_product_idx
  on garimpa.curation_event (tenant_id, product_id, created_at desc);

-- O catálogo anterior entra na fila sem desaparecer da vitrine.
insert into garimpa.product_curation (tenant_id, product_id, status)
select tenant_id, id, 'legacy_visible'
from garimpa.product
on conflict (tenant_id, product_id) do nothing;

-- Invariante centralizada: há três bordas de captura hoje (sweep, manual e
-- extensão). O trigger impede uma quarta borda futura de publicar produto novo
-- sem estado editorial por esquecimento no código da aplicação.
create function garimpa.seed_product_curation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into garimpa.product_curation (tenant_id, product_id, status)
  values (new.tenant_id, new.id, 'pending')
  on conflict (tenant_id, product_id) do nothing;
  return new;
end;
$$;

create trigger product_seed_curation
after insert on garimpa.product
for each row execute function garimpa.seed_product_curation();

alter table garimpa.product_curation enable row level security;
alter table garimpa.curation_event enable row level security;

create policy product_curation_app_access on garimpa.product_curation
  for all to garimpa_app using (true) with check (true);
create policy curation_event_app_access on garimpa.curation_event
  for select to garimpa_app using (true);
create policy curation_event_app_insert on garimpa.curation_event
  for insert to garimpa_app with check (true);

grant select, insert, update on garimpa.product_curation to garimpa_app;
grant select, insert on garimpa.curation_event to garimpa_app;
grant usage, select on sequence garimpa.curation_event_id_seq to garimpa_app;
revoke all on function garimpa.seed_product_curation() from public;
grant execute on function garimpa.seed_product_curation() to garimpa_app;

comment on table garimpa.product_curation is
  'Estado editorial atual do produto. Ausência é inválida: trigger cria pending em todo insert.';
comment on table garimpa.curation_event is
  'Histórico append-only das decisões de curadoria; texto de reason_code=other é insumo para padrões futuros.';
