-- Role dedicado do app Garimpa (privilégio mínimo: só o schema garimpa).
-- Evita usar o superusuário `postgres` no runtime; a senha do app é própria.
do $$
begin
  if not exists (select from pg_roles where rolname = 'garimpa_app') then
    create role garimpa_app login password 'GrimpaOf3rtas2026!';
  else
    alter role garimpa_app login password 'GrimpaOf3rtas2026!';
  end if;
end
$$;

grant usage on schema garimpa to garimpa_app;
grant select, insert, update, delete on all tables in schema garimpa to garimpa_app;
alter default privileges in schema garimpa grant select, insert, update, delete on tables to garimpa_app;
