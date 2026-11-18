begin;
set local lock_timeout='5s';

-- A single deployment-wide counter, deliberately independent of tenant daily
-- budgets. Only maintenance can configure it; app logins can reserve a slot.
create table garimpa.curation_provider_call_budget (
  provider text primary key check(provider='openrouter'),
  key_fingerprint text not null check(key_fingerprint ~ '^[a-f0-9]{64}$'),
  max_calls integer not null check(max_calls between 1 and 20),
  reserved_calls integer not null default 0 check(reserved_calls between 0 and max_calls),
  created_at timestamptz not null default now()
);
create table garimpa.curation_provider_call_reservation (
  id uuid primary key,
  provider text not null references garimpa.curation_provider_call_budget(provider),
  model text not null check(length(model) between 1 and 200),
  kind text not null check(kind in ('legacy','attributes')),
  reserved_at timestamptz not null default now()
);
alter table garimpa.curation_provider_call_budget enable row level security;
alter table garimpa.curation_provider_call_reservation enable row level security;
revoke all on garimpa.curation_provider_call_budget,garimpa.curation_provider_call_reservation
  from public,anon,authenticated,garimpa_app,garimpa_public_runtime;

-- Narrow private command: no reset, key replacement, account data or budget
-- mutation parameters are exposed. A repeated request ID is never reusable.
create function garimpa.reserve_curation_provider_call(p_fingerprint text,p_request uuid,p_model text,p_kind text)
returns text language plpgsql security definer set search_path=pg_catalog,garimpa as $$
declare budget garimpa.curation_provider_call_budget;
begin
  if p_request is null or p_model is null or length(p_model) not between 1 and 200
    or p_kind is null or p_kind not in ('legacy','attributes') then
    raise exception 'ai_curation_call_invalid';
  end if;
  select * into budget from garimpa.curation_provider_call_budget where provider='openrouter' for update;
  if not found or p_fingerprint is distinct from budget.key_fingerprint then return 'not_configured'; end if;
  if exists(select 1 from garimpa.curation_provider_call_reservation where id=p_request) then
    raise exception 'ai_curation_call_already_reserved';
  end if;
  if budget.reserved_calls>=budget.max_calls then return 'limit_reached'; end if;
  update garimpa.curation_provider_call_budget set reserved_calls=reserved_calls+1 where provider='openrouter';
  insert into garimpa.curation_provider_call_reservation(id,provider,model,kind)
    values(p_request,'openrouter',p_model,p_kind);
  return 'reserved';
end $$;
revoke all on function garimpa.reserve_curation_provider_call(text,uuid,text,text)
  from public,anon,authenticated,garimpa_public_runtime;
grant execute on function garimpa.reserve_curation_provider_call(text,uuid,text,text) to garimpa_app;

commit;
