# Resultado OS-09 — operação retomada

Estado: CONCLUIDO no escopo homologado.16/10/2026, America/Sao_Paulo.

AC-1: restaurada exclusivamente a proteção original Vercel all_except_custom_domains no projeto/equipe CF01. GET posterior confirma paused=false, produção no deployment dpl_EwDxnLU8t7BLFrNFVjsnxbWQVuhp e autoAssignCustomDomains=false preservado. Home/detalhe públicos200 sem página de erro; /p/33pu302 correto; painel sem sessão307 para login. API privada permanece protegida. Nenhum deployment novo foi criado.

Reativado somente monitor-prices.yml, mantendo variáveis/budget20 existentes. capture-offers.yml permanece disabled_manually, assim como a retomada de dispositivos não homologados. Não se ativaram E3/rubrica/canal/piloto ou automação nova.

AC-2: [primeiro run observado](https://github.com/ManyRagDev/bizuminer/actions/runs/38977824431), workflow_dispatch legítimo, SHA efetivo f60b6187ada88addd37ff5b967f1d0f2e8eca2b9, completed/success nos dois jobs. Shopee run c417f574-f016-4adb-b52e-57b7aa011ccf: fila vazia,0 consultas; AliExpress run f86c4af6-dc6c-4d65-b87e-ab7e75b8f226:17 consultas/17 observações/zero ausentes/zero erros/17 mudanças de preço. Logs e banco conferem por githubRunId. Não se infere homologação de API Shopee por execução vazia.

AC-3:1.657 produtos,9.357 observações,413 capture_run,1.495 publicações,172 links,767 cliques na conferência. Desde o pré-C06, quatro execuções reais e18 observações (uma local pós-C +17 GitHub); somente capture_run/price_observation/product mudaram. As outras25 projeções originais são idênticas, e os oito fingerprints de schemas externos permanecem iguais. Zero órfãos de observação/publicação. Única FK NOT VALID igual à de B, sem nova inconsistência. Controle comercial true e RLS restrita mantidos.

A confirmação visual pós-C por automação não pôde ser repetida devido a timeout CUA; preservam-se os limites da OS08 e a prova de login/UI06, runtime/HTTP/serviços/provedor efetivos08–09. Não há afirmação de homologação de capacidade não exercitada nem de ausência eterna de regressão. Observação limitada a este primeiro run completo; não foi criada automação de acompanhamento.

Backups persistentes e recuperação compatível preservados. Em falha posterior, pausar somente o componente afetado; não restaurar policies amplas, banco compartilhado ou código antigo indiscriminadamente. Próxima ordem: OS10, integração dos registros e alcance da conclusão.

[Evidência sanitizada](09-retomada.json). Logs privados em /tmp/bizuminer-finalizacao/os-09/.
