# Verificação nativa das migrations e impedimentos de implantação

15/10/2026. **Sequência atual REPROVADA para produção.** O usuário autorizou prosseguir quando tecnicamente seguro, mantendo a condição de aprovação independente. A conferência encontrou falhas reproduzíveis de transição; o auditor GPT-6.1 Sol / raciocínio Alto manteve o impedimento. Nenhuma migration, deploy ou alteração de dados de produção foi executada nesta rodada. Não há candidata substituta materializada ou aprovada.

## Resultado concreto

Foi implementada uma suíte reproduzível em PostgreSQL **17.6 nativo**, mesma versão principal/minor retornada pelo servidor ativo. Ela utiliza um cluster temporário em loopback e duas conexões independentes com a role `garimpa_app`, sem superuser/BYPASSRLS. Não usa credenciais remotas, não carrega `.env` e não altera dependências de produção. Os binários de teste foram obtidos em `/tmp`, pela distribuição fixa `@embedded-postgres/linux-x64@17.6.0-beta.15`; `postgres --version` confirmou 17.6.

Arquivos de implementação:

- `tools/editorial-tests/native-postgres-fixture.ts`: servidor local descartável, clientes separados, aplicação transacional por arquivo, timeouts e encerramento do cluster.
- `tools/editorial-tests/native-migration-flow.test.ts`: serviços reais, concorrência e contraexemplos.
- `tools/editorial-tests/observed-baseline.ts`: extração do instalador da baseline existente, reutilizado pelas fixtures nativa e PGlite. É reconstrução sintética de catálogo; não é backup completo de produção.
- `tools/editorial-tests/commercial-fixture.ts`: usa o instalador compartilhado, mantendo a mesma cadeia histórica.
- `tools/editorial-tests/package.json` e `README.md`: comando `test:native-migrations` e limites explícitos.

Nenhuma funcionalidade da aplicação ou migration SQL foi alterada nesta rodada. As modificações preexistentes do workspace foram preservadas.

## Provas executadas

| Verificação | Resultado observado |
|---|---|
| Baseline correspondente ao subconjunto instalado, com dados sintéticos | Leituras sem contexto devolvem os dois produtos sintéticos |
| Original2 aplicada antes das projeções públicas | Leituras legadas passam a zero; `public_catalog` ainda não existe — defeito confirmado |
| Cadeia local original completa | 14 SQLs executaram no PostgreSQL17.6; hashes registrados |
| Sessões de runtime | PIDs diferentes, sem superuser/BYPASSRLS |
| Transações reais de conta A/B/A | Cada conta lê somente seu produto; nenhum contexto residual após commit/rollback |
| Última quota de campanha em disputa, serviço real | Uma criação aceita, outra recusada; uma campanha e um evento de consumo persistidos |
| Mesmo convite aceito simultaneamente | Um aceite, uma recusa; uma membership e um evento de lifecycle |
| Lock timeout | Transação abortada; INSERT anterior revertido; nenhum contexto residual |
| Governança na configuração final original | Operador recusado pela proteção de owner |
| Original2 reaplicada tardiamente, dentro de transação revertida | `owner_write` desaparece, INSERT indevido de operador passa e platform_admin não consegue reativar conta suspensa; rollback restaura integralmente as policies, os dados de governança e a conta |

**10 verificações nativas passaram. PASS dos dois contraexemplos significa defeito reproduzido, não aceite de implantação.**

Após extrair a baseline compartilhada, **21 suítes SQL PGlite passaram novamente**, incluindo comercial, onboarding, dispatch, login/merge, FKs, segredos e instalação pública parcial. Os artefatos históricos19 escritos por duas suítes foram preservados e suas novas saídas copiadas com prefixo26. Web unit/typecheck/build não foram repetidos nesta rodada, pois não houve alteração no runtime web; seus resultados23 permanecem históricos.

A primeira execução nativa parou por um campo obrigatório omitido no dado sintético (`last_price_cents`); a fixture do teste foi corrigida e a execução integral passou. Não foi um erro de produção ou de migration. Houve também uma invocação inicial de npm no diretório raiz, que não possui package.json; o comando documentado usa o pacote correto.

Comando reproduzível:

```bash
BIZUMINER_TEST_PG_BIN=/caminho/para/postgresql/bin npm run test:native-migrations --prefix tools/editorial-tests
python3 docs/implementation/evidencias/execucao-26-checks.py
```

A execução desta rodada forneceu também `LD_LIBRARY_PATH` para as bibliotecas da distribuição temporária. O primeiro comando exige a versão17.6; o segundo testa apenas os ambientes SQL isolados, removendo variáveis de credenciais do processo filho.

## Conferência remota, somente leitura

MCP confirmou novamente `https://spbuwcwmxlycchuwhfir.supabase.co`, banco ativo compartilhado. Histórico continua contendo apenas as três instalações V2 já registradas:

| Unidade | Versão remota |
|---|---|
| Original1 / contexto e membership | `20261015034755` |
| Proteção complementar de segredos | `20261015035126` |
| Complemento de autoria | `20261015041540` |

SELECT final às 13:45:44UTC: 1.657 produtos, 9.146 observações, 1.494 publicações, 712 cliques, zero segredos, 29 policies e duas constraints autorais validadas. Role pública, `active_tenant` e projeção `public_catalog` seguem ausentes. As contagens de negócio coincidem com a leitura inicial desta rodada. Não são prova de backup ou de identidade integral dos dados; cliques legítimos continuam possíveis entre consultas.

Continuam **11 migrations originais pendentes**: original2 e originais3–12. Nenhuma foi marcada artificialmente como aplicada e nenhum timestamp remoto foi reparado para forçar o CLI.

## Impedimentos e responsabilidade da retomada

1. **Técnico implementável — sequência substituta ausente.** Materializar a entrega2 do plano24: fundação aditiva, escopo fechado dos laços de M11 e corte que substitua somente as 28 policies legadas verificadas. Preservar segredo, owner/operator, plataforma, revogação e reativação. Não mover original2 intacta para o fim, não fragmentá-la para contornar rejeição e não executar a pasta inteira por `db push`.
2. **Técnico implementável — controles durante expansão.** Novas escritas comerciais, inclusive da casa, provisionamento e convites precisam negar por padrão no backend/CLI durante S1/S2, preservando captura, telemetria pública e shortlinks legados. A suíte atual não implementa nem certifica esses controles.
3. **Infraestrutura — staging ainda indisponível.** `create_branch` foi tentado uma vez com o nome `bizuminer-v2-homologacao-26`. O MCP retornou que precisa de `get_cost`, aceite do custo e `confirm_cost`, ferramentas que não estão disponíveis nesta conexão. Nenhum branch foi criado e nenhum custo foi confirmado ou inventado. É necessário um staging identificável com acesso próprio ou disponibilizar o fluxo real de custo/confirmação. Os métodos SQL deste MCP estão fixos no projeto ativo; um branch_ref não os redireciona.
4. **Deployment/escritores — versão publicada ainda não comprovada.** O vínculo local com Vercel não identifica o artefato que atende produção. Os impedimentos de acesso registrados em23 continuam sem resolução comprovada; não houve login ou publicação nesta rodada. Todos os workers/CLIs/extensão precisam entrar na matriz de compatibilidade.
5. **Homologação — matriz S0–S3 e recuperação incompletas.** As provas nativas reduzem a lacuna de sessões reais somente para os casos enumerados. Não verificam Supavisor, Auth, Storage, navegador, versão legada publicada, transição revisada, restauração de backup ou latência no ambiente efetivo. T01–T18, jornadas e gates dos planos originais continuam normativos.

Os itens1/2 são trabalho técnico pendente, não decisões comerciais a delegar ao usuário. Os itens3/4 dependem de recursos/acessos verificáveis. A autorização humana geral já existe; a liberação técnica da cadeia atual **não existe**. Estes resultados não satisfazem a condição humana de aprovação do auditor e não permitem declarar a implementação encerrada.

## Rejeição automática preservada

Na rodada21, a avaliação automática recusou original2 por alterar amplamente policies, permissões, triggers e acesso no banco ativo, com risco de interrupção/exposição sem staging validado. A operação foi recusada antes de execução. Nesta rodada não houve reenvio, tentativa por CLI, SQL manual, fragmentação ou transporte alternativo ao banco ativo. O ensaio em servidor local descartável demonstra o risco sem produzir o efeito remoto rejeitado.

## Evidências

- [Provas nativas e hashes dos SQLs](evidencias/execucao-26-native-postgres.json).
- [21 suítes SQL: resultados e caminhos dos logs](evidencias/execucao-26-checks.json).
- [Baseline remoto desta rodada](evidencias/mcp-26-r26baseline.json).
- [SELECT final remoto](evidencias/mcp-26-r26finalSql.json) e [histórico final](evidencias/mcp-26-r26final1.json).
- [Parecer independente e adendos](22-AUDITORIA-INDEPENDENTE-MIGRATIONS.md).
- [Caminho de conclusão24](24-CAMINHO-SEGURO-PARA-CONCLUSAO.md) e [aderência ao plano original25](25-ADERENCIA-AO-PLANO-ORIGINAL.md).
