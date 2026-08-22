-- Vínculo Supabase Auth -> app_user (AL-3, 22/08/2026).
-- O merge bm_uid -> conta é um update nesta coluna (decisão de 19/08, plano-area-logada.md).
-- O índice parcial único garante a regra "uma conta <=> uma linha app_user" no banco,
-- não apenas na aplicação. auth_user_id nulo (visitantes pré-login) não é indexado.
-- Aplicada remotamente via MCP como `garimpa_auth_link` (22/08/2026).

create unique index app_user_auth_unique_idx
  on garimpa.app_user (auth_user_id)
  where auth_user_id is not null;
