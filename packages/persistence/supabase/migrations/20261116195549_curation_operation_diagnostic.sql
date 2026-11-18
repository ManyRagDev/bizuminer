begin;
set local lock_timeout='5s';
-- Private, sanitized diagnostics. Existing uncertain calls are deliberately not backfilled.
alter table garimpa.curation_attribute_job add column diagnostic jsonb
  check(diagnostic is null or jsonb_typeof(diagnostic)='object');
create index curation_attribute_history on garimpa.curation_attribute_job(tenant_id,updated_at desc,id desc);
alter table garimpa.curation_external_budget add column configured_limit integer check(configured_limit between 1 and 1000);
commit;
