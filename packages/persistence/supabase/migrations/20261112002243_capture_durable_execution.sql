-- The job row is the durable queue; NOTIFY is only a commit-coupled wake-up.
-- Reassert the operational constraint for installations using the replacement baseline.
-- Existing duplicate active rows must be reconciled before this migration, never discarded here.
create unique index if not exists uq_capture_batch_one_running_per_tenant
  on garimpa.capture_batch(tenant_id) where status='running';
create unique index if not exists uq_capture_batch_request
  on garimpa.capture_batch (tenant_id, (metadata#>>'{execution,requestId}'))
  where metadata#>>'{execution,requestId}' is not null;
create index if not exists idx_capture_batch_durable_pending
  on garimpa.capture_batch (tenant_id, started_at)
  where status='running' and metadata#>>'{execution,executor}'='durable';

create or replace function garimpa.notify_capture_batch() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
  if new.metadata#>>'{execution,executor}'='durable' then
    if TG_OP='INSERT' or old.status is distinct from new.status
      or old.metadata#>>'{execution,phase}' is distinct from new.metadata#>>'{execution,phase}'
      or old.metadata#>>'{execution,nextAttemptAt}' is distinct from new.metadata#>>'{execution,nextAttemptAt}'
      or old.metadata#>>'{execution,deadline}' is distinct from new.metadata#>>'{execution,deadline}' then
      perform pg_notify('garimpa_capture_ready', json_build_object('tenantId',new.tenant_id,'batchId',new.id)::text);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function garimpa.notify_capture_batch() from public;
create trigger capture_batch_notify after insert or update on garimpa.capture_batch
for each row execute function garimpa.notify_capture_batch();
