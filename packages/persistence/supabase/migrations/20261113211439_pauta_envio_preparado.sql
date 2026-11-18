begin;
set local lock_timeout='5s';

-- The declaration is historical: expiration does not invalidate an event
-- already sent by a human, but must remain visible in its audit record.
alter table garimpa.recommendation_exposure
  add column preparation_expired boolean not null default false;

create index recommendation_archive_pending_pauta_idx
  on garimpa.recommendation_edition_archive(tenant_id,channel,(selection->>'affiliateId'),prepared_at desc,id desc)
  where selection->>'kind'='pauta-copied-v1';

commit;
