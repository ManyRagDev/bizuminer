-- RLS com contexto de tenant (E2, 26/08/2026) — GATED / NÃO aplicar sem adoção.
--
-- ⚠️ Esta migration é um DESIGN de defesa em profundidade. NÃO aplicar no banco
-- de produção antes de:
--   1. todas as rotas server-side passarem pelo helper `withTenantDb` (web/lib/tenant-db.ts);
--   2. o teste A/B com dois tenants (bin/verify-tenant-isolation.ts) passar.
--
-- O schema `garimpa` NÃO é consumido pelo Data API (anon/authenticated não têm
-- grant — verificado), então a fronteira real segue sendo o servidor/`garimpa_app`.
-- A política abaixo escopa a role `garimpa_app` pelo tenant definido no contexto
-- da transação (`current_setting('garimpa.tenant_id', true)`); fora de transação
-- o contexto é nulo e NENHUMA linha é visível — é exatamente a falha fechada que
-- se quer, e por isso a adoção do helper precisa ser completa antes da ativação.
--
-- A política NÃO depende de `auth.uid()` nem de `user_metadata` (a role do app
-- não é um usuário Supabase). Isto é isolamento por tenant, não por usuário.

do $$
declare
  rel text;
begin
  foreach rel in array array[
    'product', 'price_observation', 'capture_run', 'publication', 'click_event',
    'subscriber', 'app_user', 'favorite', 'price_watch', 'buyer_profile',
    'affiliate_account', 'affiliate_membership', 'affiliate_marketplace_config'
  ]
  loop
    execute format('alter table garimpa.%I enable row level security', rel);

    execute format(
      'create policy %I on garimpa.%I for all to garimpa_app using (tenant_id = current_setting(''garimpa.tenant_id'', true)) with check (tenant_id = current_setting(''garimpa.tenant_id'', true))',
      rel || '_tenant_scope', rel
    );
  end loop;
end $$;
