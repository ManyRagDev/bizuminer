# Resultado OS-04 — Unidade B

Estado: CONCLUIDO

B completa aplicada via MCP no Supabase `spbuwcwmxlycchuwhfir`, versão **20261016185708**, nome `garimpa_v2_expansion`. Histórico contém um statement completo, SHA256 `02810325f1eecc16dfc05121f44b75a64c5ce0655b9329f2662ffb0d74cbecaa`, igual ao arquivo aprovado33. Transporte dedicado de migration, sem COMMIT interno ou fracionamento.

AC-1: 66 tabelas, 180 policies e bucket próprio `bizuminer-private` privado. Inventários de tabelas/ACL, policies, views, ACL de colunas, 243 constraints e 145 FKs conferem com o catálogo selado. As 26 funções conferem individualmente em definição, corpo, SECURITY DEFINER, configuração e ACL. Há um trigger adicional legítimo do legado, `product_seed_curation`, preservado; os 58 previstos são verificados antes de C. A FK `experiment_evaluation_tenant_id_experiment_id_unit_id_fkey` permanece NOT VALID conforme o desenho selado, não é falha nova.

AC-2: controle comercial permanece false; leitura real pelo runtime `garimpa_app`, sem SUPER/BYPASS, devolve ready=false e nega acesso comercial com `commercial_rollout_not_ready`. Role pública continua com zero SELECT direto privado e FORCE RLS de `app_user_role` preservado. Não foram criados convites, contas, vendas ou fatos artificiais.

AC-3: todas as 28 contagens/digests de colunas originais, os fingerprints dos 8 schemas externos e metadata dos 8 buckets existentes conferem com OS-02. Runtime lê 1.657 produtos, 9.338 observações, 1.495 publicações e 172 links; script temporário exit0. Os testes obrigatórios de rollout e suítes nativas passaram na OS-01 com as mesmas fontes/SQLs. Nenhuma mudança desses bytes ocorreu; não foi exigido verde do verificador final que depende de C.

Pendência encontrada para C: seu guard de inventário de funções compara array ordenado pela collation padrão com literal produzido sob C. A produção usa en_US.UTF-8 e inverte a posição de `public_catalog`/`public_catalog_stats`; os conteúdos são iguais. C NÃO foi aplicada nem corrigida nesta ordem. O auditor técnico foi consultado para confirmar a fronteira; não se recapturou catálogo nem relaxou check. Isso não invalida o aceite da expansão B, mas impede liberar C sem reconciliação autorizada.

Manutenção permanece ativa para publicação/smokes compatíveis; backup persistente e restore demonstrados na OS-02. Alterações próprias limitadas a este resultado/JSON e temporários. [Evidência](04-unidade-b.json).
