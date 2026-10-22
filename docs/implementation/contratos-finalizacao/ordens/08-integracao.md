# OS-08 — Integração pós-C e classificação honesta de capacidades

Estado: PRONTA
Papel: executor-blindado
Base verificada: main / 43700c59f4e24f68f3a2e32c20ee5147fa4816cd + alterações locais preexistentes; conferir novamente antes de executar.
Depende de: OS-07 CONCLUIDA, manutenção mantida e candidata exata.
Execução: sequencial

## Objetivo e aceite

- AC-1: continuidade usada e acesso real sem bypass/pooler passam; ninguém obtém dados privados sem contexto/conta autorizados.
- AC-2: todos T01–T18, S-* e J1–J3 recebem evidência por ambiente ou pendência específica. Módulos habilitados passam no conjunto; resultados isolados não certificam a integração.
- AC-3: capacidades opcionais não verificadas permanecem desligadas; nenhum defeito impeditivo em fluxo a reabrir; divergências não recebem reparo fora da fronteira.

## Leitura e contrato

- CF-02/03; resultados OS-01 a07; aceite05 e rastreabilidade08.
- `packages/persistence/bin/verify-remote-compatibility.ts`, contratos/callsites da tabela CF-03.
- Registro CAPACIDADES-PENDENTES; evidências históricas31, sem apresentá-las como smokes novos.

## Escrita autorizada

Somente resultado/evidência desta ordem; temporários sanitizados em `/tmp/bizuminer-finalizacao/os-08/`. Suites que produzem arquivos fixos rodam só na cópia isolada, nunca sobrescrevendo evidências31/35. Não editar runtime/SQL/testes/contratos nem STATUS.

Resultado: `docs/implementation/contratos-finalizacao/resultados/08-integracao.md` — novo, exclusivo do executor desta ordem.
Evidência: `docs/implementation/contratos-finalizacao/resultados/08-integracao.json` — opcional, nova e sanitizada, limitada ao aceite desta ordem.
Protegidos: todo caminho fora da lista; contratos compartilhados, SQLs/manifestos selados, testes de aceite e evidências históricas não podem ser alterados. Nenhuma ordem autoriza limpar trabalho preexistente. Escrita remota tem escopo próprio abaixo e não decorre da lista de arquivos.

## Dependências e integração

O executor desta ordem é seu único escritor; não há execução paralela autorizada. Consumir o resultado anterior, conferir suas evidências e interromper a fase dependente se houver falha. CF-01 rege transição, CF-02 preservação/recuperação e CF-03 integração. OS-08 valida o conjunto e OS-10 é o único integrador dos registros centrais. Não avançar com estado desconhecido nem pedir nova autorização genérica quando a existente já cobre alvo/operação e suas condições estão satisfeitas.

## Verificações

No ativo, usar a conexão runtime explícita carregada por mecanismo privado em `BIZUMINER_AUDIT_DATABASE_URL`; executar na raiz `npm run verify:remote-compatibility --prefix packages/persistence` sem URL em argv. Esperado exit0 nesta fase; este comando é read-only e checa catálogo/grants/negação sem contexto, mas NÃO é certificado ponta a ponta.

Executar a matriz CF-03 no deployment/pooler real: proprietário/conta, público mínimo, callbacks, catálogo, links, curadoria/autoria, captura/monitoramento que serão retomados e contexto/reset de sessão. Provar A/B/A com contas autorizadas quando disponíveis; caso contrário executar J2 sintética local e registrar limitação gerenciada, mantendo SaaS externo desligado.

Verificar preços/rubrica/radar, campanha/revisão/kit/render, exportação/links, financeiro/métricas, governança/plano/onboarding de acordo com entrada e efeito legítimos. Storage privado exige upload/download real autorizado antes de ativação, com direitos e arquivo válido; preview do download usa `preview=1` para não produzir export por engano. Não ativar automação/piloto sem suas entradas.

Reusar ou repetir suites específicas existentes listadas na OS-01 conforme mudança; testar regressões efetivas, compilar/testar o conjunto se houver reparo autorizado por ordem posterior. Comparar dados e fingerprints após cada smoke, explicando gravações.

## Operações externas

SELECTs/auditoria read-only e smokes legítimos controlados da operação própria no alvo CF-01; material próprio autorizado quando houver. Não fabricar contas/clientes/cliques/vendas/comissões, disparar mensagem ou cobrar para gerar evidência. Multi-tenant sintético e testes de falha/destrutivos só no cluster isolado.

Falha essencial: `[BLOQUEIO DE FRONTEIRA]`, manter manutenção e delimitar nova ordem com paths exatos; não corrigir qualquer lib/SQL por iniciativa própria. Opcional sem entrada: registrar não homologada/desligada; não marcar integralmente entregue.
