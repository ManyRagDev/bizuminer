-- RLS defensiva (26/08/2026) — defesa em profundidade.
-- Fato verificado: anon/authenticated NÃO têm grant no schema garimpa. Habilitar
-- RLS garante default-deny caso alguém conceda por engano no futuro.
-- A política de garimpa_app é permissiva POR ENQUANTO (o app é a borda única);
-- o escopo por tenant (`tenant_id = current_setting('garimpa.tenant_id', true)`)
-- entra numa entrega seguinte, depois da adoção de `withTenantDb` em transação
-- (ver `20260826030000_garimpa_tenant_rls.sql`, versão gated).

do $$
declare
  rel text;
begin
  foreach rel in array array[
    'product', 'price_observation', 'capture_run', 'publication', 'click_event',
    'subscriber', 'app_user', 'favorite', 'price_watch', 'buyer_profile',
    'affiliate_account', 'affiliate_membership', 'affiliate_marketplace_config',
    'extension_device'
  ]
  loop
    execute format('alter table garimpa.%I enable row level security', rel);
    execute format('drop policy if exists %I on garimpa.%I', rel || '_app_access', rel);
    execute format(
      'create policy %I on garimpa.%I for all to garimpa_app using (true) with check (true)',
      rel || '_app_access', rel
    );
  end loop;
end $$;
