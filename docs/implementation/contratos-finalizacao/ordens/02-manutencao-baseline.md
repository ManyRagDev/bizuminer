# OS-02 — Janela fechada, backup final e baseline consistente

Estado: PRONTA
Papel: executor-blindado
Base verificada: main / 43700c59f4e24f68f3a2e32c20ee5147fa4816cd + alterações locais preexistentes; conferir novamente antes de executar.
Depende de: OS-01 CONCLUIDA, com mecanismo viável, ferramentas e restore de ensaio comprovados.
Execução: sequencial

## Objetivo e aceite

- AC-1: pausar/drenar exclusivamente BizuMiner; nenhum escritor antigo pode reiniciar. Provar cobertura de URLs públicas/imutáveis, cron/manual, filas/pools e extensão; manter acesso reservado viável aos smokes futuros.
- AC-2: obter backup final após drenagem, conferir cópia privada persistente e demonstrar restauração local desse ponto consistente.
- AC-3: congelar comparação administrativa das 28 tabelas/projeção original, referências, runtime legítimo e fingerprints dos outros apps/buckets. Todas as entradas de A ficam comprovadas.

## Leitura e contrato

- CF-01/02; resultado/evidência da OS-01.
- Snapshot35 e consulta original em `docs/implementation/evidencias/execucao-35-preservacao-preliminar.json`.
- Catálogo/escopo33 e inventário atualizado de writers.

## Escrita autorizada

Somente resultado e evidência sanitizada da ordem. Backup/restore/serviço/passfile privados e logs não publicáveis em `/tmp/bizuminer-finalizacao/os-02/`, com cópia persistente protegida definida na OS-01. Nenhuma mudança de código/SQL/contrato; nenhum overwrite das evidências35.

Resultado: `docs/implementation/contratos-finalizacao/resultados/02-manutencao-baseline.md` — novo, exclusivo do executor desta ordem.
Evidência: `docs/implementation/contratos-finalizacao/resultados/02-manutencao-baseline.json` — opcional, nova e sanitizada, limitada ao aceite desta ordem.
Protegidos: todo caminho fora da lista; contratos compartilhados, SQLs/manifestos selados, testes de aceite e evidências históricas não podem ser alterados. Nenhuma ordem autoriza limpar trabalho preexistente. Escrita remota tem escopo próprio abaixo e não decorre da lista de arquivos.

## Dependências e integração

O executor desta ordem é seu único escritor; não há execução paralela autorizada. Consumir o resultado anterior, conferir suas evidências e interromper a fase dependente se houver falha. CF-01 rege transição, CF-02 preservação/recuperação e CF-03 integração. OS-08 valida o conjunto e OS-10 é o único integrador dos registros centrais. Não avançar com estado desconhecido nem pedir nova autorização genérica quando a existente já cobre alvo/operação e suas condições estão satisfeitas.

## Verificações

1. Registrar estado anterior de pausa, workflows, `MONITORING_ENABLED`, refs, filas e dispositivos. Aplicar o mecanismo aprovado da OS-01, conferir encerramento de requests/transações e novos inícios impedidos. Zero transações em um SELECT isolado não prova drenagem.
2. Testar de modo controlado todos os endereços capazes de gravar; se a pausa Vercel não cobrir ou impedir acesso reservado, parar antes de A e delimitar solução. Não inventar flag existente ou abrir a produção inteira para testar.
3. Reexecutar consulta de projeção original35 em snapshot consistente; exportar/validar/restaurar backup final com os comandos efetivamente demonstrados na OS-01; reconciliar counts/digests/referências e inventário. Testar leitura runtime real read-only, sem bypass, sem usar o script35 que sobrescreve histórico.
4. Capturar fingerprints ordenados de owners/ACL/RLS/DDL/functions/triggers/constraints dos outros apps e metadata dos buckets preexistentes, sem seus dados/segredos.
5. `npm run rollout:verify --prefix tools/editorial-tests` e leitura remota de histórico/catálogo antes de liberar OS-03.

## Operações externas

Autorização anterior de finalização + parecer33: manutenção somente do projeto Vercel web e escritores BizuMiner nomeados em CF-01. Pausar/retomar via capacidade específica Vercel; desabilitar novos inícios e cancelar/drenar somente workflows capture-offers/monitor-prices; interromper captura dos dispositivos próprios. Sem Auth/Storage global, revogação compartilhada ou edição genérica de firewall.

Exportação read-only seletiva e restore SOMENTE local. Se não houver backup/manutenção válidos, não iniciar DDL; registrar o bloqueio e, se nenhuma alteração foi aplicada, devolver somente componentes comprovadamente compatíveis ao estado anterior, documentando essa recuperação.
