begin;
set local lock_timeout='5s';

-- The function is invoker-security: account RLS on each source table still
-- applies. The public role remains restricted to the public projections.
grant execute on function garimpa.current_offer_valid_until(text,text,text) to garimpa_app;

-- Availability and policy can change without a new price observation.
-- Invalidate the persisted selection in the same transaction as those facts.
do $$
declare t text;
begin
  foreach t in array array['curation_policy_v2','offer_verification','offer_availability_observation'] loop
    execute format('create trigger pauta_changed_insert after insert on garimpa.%I referencing new table as pauta_new for each statement execute function garimpa.invalidate_pauta_selection()',t);
    execute format('create trigger pauta_changed_update after update on garimpa.%I referencing old table as pauta_old new table as pauta_new for each statement execute function garimpa.invalidate_pauta_selection()',t);
    execute format('create trigger pauta_changed_delete after delete on garimpa.%I referencing old table as pauta_old for each statement execute function garimpa.invalidate_pauta_selection()',t);
  end loop;
end $$;
commit;
