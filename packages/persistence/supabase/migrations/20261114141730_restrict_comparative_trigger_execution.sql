begin;
set local lock_timeout='5s';

-- These functions run only through their product/observation triggers. They
-- retain their existing owner; direct API callers need no EXECUTE privilege.
revoke all on function garimpa.record_comparative_evidence_event_from_product()
  from public, anon, authenticated, garimpa_public_runtime;
revoke all on function garimpa.record_comparative_evidence_event_from_observation()
  from public, anon, authenticated, garimpa_public_runtime;

commit;
