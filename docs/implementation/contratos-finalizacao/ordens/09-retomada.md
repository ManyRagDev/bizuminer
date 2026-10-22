# OS-09 — Componentes aprovados retomados e observados

Estado: PRONTA
Papel: executor-blindado
Base verificada: main / 43700c59f4e24f68f3a2e32c20ee5147fa4816cd + alterações locais preexistentes; conferir novamente antes de executar.
Depende de: OS-08 CONCLUIDA para todo fluxo a reabrir; nenhum defeito impeditivo e recuperação disponível.
Execução: sequencial

## Objetivo e aceite

- AC-1: reabrir somente entrypoints e writers aprovados; capacidades sem entradas continuam desabilitadas.
- AC-2: observar primeira execução legítima dos jobs usados e SHA/ref efetivos, ausência de erro de RLS/tenant/Storage/monetização e gravações corretas.
- AC-3: integridade/fingerprints preservados depois da retomada; limites de observação e componentes ainda parados explícitos.

## Leitura e contrato

- CF-01/02/03, resultados OS-02/05/08 e estado anterior de workflows/pausa.
- Workflows capture-offers e monitor-prices, inventário de dispositivos, logs Vercel/GitHub/Banco do BizuMiner.

## Escrita autorizada

Somente resultado/evidência da ordem; temporários sanitizados em `/tmp/bizuminer-finalizacao/os-09/`. Nenhum código/SQL/contrato/arquivo de configuração global ou automação recorrente nova.

Resultado: `docs/implementation/contratos-finalizacao/resultados/09-retomada.md` — novo, exclusivo do executor desta ordem.
Evidência: `docs/implementation/contratos-finalizacao/resultados/09-retomada.json` — opcional, nova e sanitizada, limitada ao aceite desta ordem.
Protegidos: todo caminho fora da lista; contratos compartilhados, SQLs/manifestos selados, testes de aceite e evidências históricas não podem ser alterados. Nenhuma ordem autoriza limpar trabalho preexistente. Escrita remota tem escopo próprio abaixo e não decorre da lista de arquivos.

## Dependências e integração

O executor desta ordem é seu único escritor; não há execução paralela autorizada. Consumir o resultado anterior, conferir suas evidências e interromper a fase dependente se houver falha. CF-01 rege transição, CF-02 preservação/recuperação e CF-03 integração. OS-08 valida o conjunto e OS-10 é o único integrador dos registros centrais. Não avançar com estado desconhecido nem pedir nova autorização genérica quando a existente já cobre alvo/operação e suas condições estão satisfeitas.

## Verificações

Retomar primeiro web/caminhos aprovados, depois cada writer aprovado; verificar links e acesso legítimo. Conferir execução por SHA de job, não só configuração da branch. Observar uma execução legítima completa de cada worker efetivamente usado; se a agenda não couber na sessão, registrar NAO_VERIFICADO e manter dependência aberta, sem inventar run nem criar acompanhamento automático.

Inspecionar erros/queries/leases sem expor dados pessoais/segredos; comparar counts/digests levando em conta gravações legítimas desde a baseline e reconferir fingerprints dos outros apps/buckets. Não afirmar “zero regressões” com componente crítico sem prova. Não repetir suites inteiras se não houver mudança/falha nova.

## Operações externas

Despausar somente projeto Vercel web CF-01 e reativar somente os dois workflows/componentes que passaram, restaurando suas configurações anteriores compatíveis com refs novas. Dispositivos somente após versão verificada. Execuções externas normais limitam-se à operação própria já autorizada; dispatch/canal não recebe nova autorização pelo controle true.

Erro de operação após abertura: pausar componente afetado, preservar dados e recuperação compatível; falha transversal impede manter abertura. Sem pausa Supabase global, convite/cobrança ou automação nova.
