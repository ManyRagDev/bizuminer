-- Protect internal curation tables used through the server-side garimpa_app role.
-- Keep existing garimpa_app grants; RLS policies preserve its current access.

revoke all privileges on table garimpa.triage_run from anon, authenticated;
revoke all privileges on table garimpa.editorial_guideline from anon, authenticated;

create policy triage_run_app_access on garimpa.triage_run
  for all to garimpa_app using (true) with check (true);

create policy editorial_guideline_app_access on garimpa.editorial_guideline
  for all to garimpa_app using (true) with check (true);

alter table garimpa.triage_run enable row level security;
alter table garimpa.editorial_guideline enable row level security;
