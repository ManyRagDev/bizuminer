-- Role dedicado do app Garimpa (privilégio mínimo: só o schema garimpa).
-- A senha é provisionada/rotacionada fora do repositório e nunca deve ser
-- gravada em migration ou em outro arquivo versionado.
do $$
begin
  if not exists (select from pg_roles where rolname = 'garimpa_app') then
    create role garimpa_app login;
  else
    alter role garimpa_app login;
  end if;
end
$$;

grant usage on schema garimpa to garimpa_app;
grant select, insert, update, delete on all tables in schema garimpa to garimpa_app;
alter default privileges in schema garimpa grant select, insert, update, delete on tables to garimpa_app;
