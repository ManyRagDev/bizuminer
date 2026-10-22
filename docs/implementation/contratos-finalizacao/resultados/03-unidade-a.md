# Resultado OS-03 — Unidade A

Estado: CONCLUIDO

MCP aplicou `garimpa_v2_foundation` no Supabase spbuwcwmxlycchuwhfir, versão remota **20261016185521**. Histórico tem um único statement contendo o SQL completo; SHA256 armazenado confere com o arquivo aprovado33:33e03729f9e058169844fc353cba083cb3d5fe270b98ea890dafd0fb0a87c40c. Nenhum wrapper COMMIT interno ou execução por statements separados foi adicionado; utilizado o endpoint dedicado apply_migration para corpo e histórico da unidade. Referências do transporte: fonte oficial MCP api-platform.ts/applyMigration e Management API v1-apply-a-migration; erros/incerteza exigem conciliar catálogo/histórico antes de repetir.

A conferência retornou29 tabelas/30 policies, sendo a adição o controle protegido; controle comercial false, runtime sem INSERT/UPDATE/DELETE nesse controle. Role pública sem login/super/bypass e zero SELECT direto privado. As28 tabelas originais preservaram todas as contagens/digests da projeção congelada, e os8 schemas externos mantiveram fingerprints idênticos.

Leitura pela conexão real garimpa_app, sem SUPER/BYPASS e em transação somente leitura:1.657 produtos,9.338 observações,1.495 publicações e172 links. Script temporário runtime-read.cjs exit0. Backup final restaurado e cópia persistente conferidos na OS-02; manutenção permanece ativa. Nenhuma alteração de Auth/Storage/outro app.

[Evidência](03-unidade-a.json). Alterações próprias: somente resultado/JSON e temporários da OS-03. SQL/manifesto/fontes preservados. Próxima unidade: B; não reaplicar A nem originais históricas.
