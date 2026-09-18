-- M4-D.1 — endurecimento da trilha editorial (04/09/2026).
--
-- A migration M4-D já está aplicada no banco compartilhado. Esta correção é
-- aditiva e registra o estado anterior completo necessário para um undo
-- auditável, sem reescrever eventos históricos. Eventos legados permanecem
-- com os novos campos nulos e falham fechado ao tentar restaurar um estado
-- held/rejected cujo motivo anterior não é conhecido.

alter table garimpa.curation_event
  add column if not exists from_reason_code text,
  add column if not exists from_reason_detail text,
  add column if not exists from_deferred_until timestamptz;

alter table garimpa.curation_event
  add constraint curation_event_from_reason_check
  check (
    (from_reason_code is null and from_reason_detail is null)
    or (from_status = 'rejected' and from_reason_code in (
      'adult_sexual', 'misleading_claim', 'low_utility', 'unsafe_restricted',
      'audience_mismatch', 'low_quality_listing', 'duplicate', 'other'
    ))
    or (from_status = 'held' and from_reason_code in (
      'insufficient_evidence', 'weak_offer', 'stale_offer', 'unavailable',
      'family_saturation', 'other'
    ))
  );

alter table garimpa.curation_event
  add constraint curation_event_from_other_detail_check
  check (
    from_reason_code is distinct from 'other'
    or (from_reason_detail is not null
        and char_length(btrim(from_reason_detail)) between 3 and 1000)
  );

alter table garimpa.curation_event
  add constraint curation_event_from_deferred_status_check
  check (
    from_deferred_until is null
    or from_status in ('pending', 'legacy_visible', 'held')
  );

comment on column garimpa.curation_event.from_reason_code is
  'Motivo estruturado do estado anterior, usado para restaurar undo sem perder contexto.';
comment on column garimpa.curation_event.from_reason_detail is
  'Texto livre do motivo anterior quando from_reason_code=other.';
comment on column garimpa.curation_event.from_deferred_until is
  'Adiamento anterior à transição; uma decisão o consome e undo pode restaurá-lo.';
