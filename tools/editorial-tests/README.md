# Verificação da seleção editorial

**Rodada31 vigente:** as fixtures comerciais completas reproduzem o default real `garimpa_app=arwd` para objetos futuros, FORCE RLS em `app_user_role`, os grants legados de `service_role` e as três sequences observadas. A candidata normaliza permissões somente das novas tabelas/view. `test:replacement-rollout` passou 33 verificações + seis aplicações locais; `test:operational-maintenance`, 21 verificações. As evidências atuais são `execucao-31-replacement-native.json`, `execucao-31-operational-native.json` e `rollout-31-expansion-catalog.json`. Os registros27/28 abaixo são históricos. O parecer31 autoriza somente ensaio isolado.

Este pacote executa a migration e os serviços reais em PostgreSQL isolado via PGlite. Não usa `DATABASE_URL` real nem acessa o banco remoto.

```bash
npm ci --prefix tools/editorial-tests
npm test --prefix tools/editorial-tests
```

A fixture contém o contrato mínimo das tabelas, view e roles anteriores à migration. O adaptador traduz a interface de consultas de `postgres.js` para PGlite; os comandos SQL são executados, sem respostas simuladas. A própria migration adiciona tabelas, constraints, políticas e privilégios.

Os cenários verificam ausência da migration, isolamento de tenant, constraints, projeções públicas, revisões superadas, preço, identidade da configuração, validade, conflitos otimistas, rollback de falha real em trigger e preservação da aprovação. Também verificam prioridade editorial global, paginação e ordenações explícitas. Os 29 cenários incluem ranking relativo e a seleção inicial compartilhada entre home/pauta, com até 24 produtos na pauta e três na hero, prazos independentes e atualização de itens fora da hero. Não fabricam avaliações/edições nem contornam uma edição vazia, vencida ou retirada.

PGlite tem uma única sessão: este verificador cobre transações e conflitos de versão sequenciais, mas não comprova concorrência entre conexões nem o comportamento do pooler remoto. A fixture não substitui aplicar a migration e verificar permissões no ambiente de destino.

Para a regra de valor habitual da triagem, sem acessar marketplaces ou chamar a IA:

```bash
npm run test:triage-price --prefix tools/editorial-tests
```

Esse verificador executa a consulta real de candidatos, a política de preço e a aplicação das decisões contra PostgreSQL isolado. Os 21 cenários incluem promoção de R$ 100 por R$ 11, referência ausente ou insuficiente, variante/quantidade/conteúdo, histórico vencido, mínimo anterior, isolamento por tenant, retenções automáticas recuperáveis e preservação de decisões humanas. Também conferem a invalidação do resultado quando preço, evidência ou decisão mudam durante a avaliação, a gravação dos fatos, a ausência de duplicação e a transição de retido para pendente com o piloto desligado. Os cinco cenários de curadoria verificam filas disjuntas e recentes, decisão humana de retidos/adiados, amostra recente da IA e confirmação/correção vinculadas ao evento exibido, sem repetir a auditoria nem sobrescrever uma decisão humana posterior.
### Execução persistida de captura

`npm run test:capture-batch --prefix tools/editorial-tests` executa o SQL real da operação em PostgreSQL isolado, aplicando a migration existente de lotes. Cobre exclusão de operações concorrentes, claim único, ausência de conclusão prematura entre consultas, falha antes da primeira consulta, captura parcial, encadeamento da IA, timeout com fechamento de filhos, reconciliação de órfãos legados, isolamento de tenant, preservação de operação já iniciada e bloqueio de decisões de um executor vencido. Não consulta lojas, banco real ou IA paga.

### Jornada comercial e cadeia de migrations V2

`npm run test:commercial --prefix tools/editorial-tests` recria as 27 tabelas observadas, suas policies legadas e as chaves necessárias, aplica a cadeia local de 14 arquivos (12 originais V2 e dois complementos) em ordem e executa os serviços comerciais e o handler HTTP de redirecionamento como `garimpa_app`/`garimpa_public_runtime`. Inclui escrita positiva, idempotência, rollback, revisão/aprovação/exportação/confirmação, preço alterado, links de quatro e doze caracteres, atribuição, custos, ledger, credenciais, revogação e suspensão. A fixture conserva evidências do schema em `docs/implementation/evidencias/`; não é um dump completo de triggers, Auth ou Storage da produção.

Também compara predicados de preço TS/SQL e comprova que o preflight falha sem alvo e com objetos obrigatórios ausentes. Os testes web chamados `commercial-flow-contract` e `security-isolation-matrix` são unitários com mocks; não substituem este ensaio SQL. A execução local não certifica navegador autenticado, conexões simultâneas, Supavisor, workers reais nem URLs de Storage. Essas provas continuam exigidas em staging.

### Reparos auditados de isolamento e login (rodada23)

- `npm run test:auth-merge --prefix tools/editorial-tests`: SQL real do bootstrap e merge sob RLS, contas existentes/novas, conflito de dados pessoais, homes diferentes, rollback e ausência de contexto residual.
- `npm run test:migration-integrity --prefix tools/editorial-tests`: FKs compostas dos quatro filhos SaaS, aceite de conta suspensa sem consumo do token, autoria cross-home, serviços reais de assessment/edição e revogação, repetição segura do complemento de autoria.
- `npm run test:public-readiness --prefix tools/editorial-tests`: instalação parcial M1/M6/M8 e função ausente; probes só consultam catálogo e não geram shortlinks/cliques.

A suíte dispatch contém INSERT negativo real da role app para tentativa de B com job A. Essas provas isoladas não autorizam a ordem M2 antes das projeções no banco ativo. O parecer independente22 e a execução23, em `docs/implementation/`, distinguem aprovação local, aplicação restrita e homologação pendente.

### PostgreSQL nativo e sessões independentes (rodada26)

Com PostgreSQL **17.6** já disponível fora do repositório:

```bash
BIZUMINER_TEST_PG_BIN=/caminho/para/postgresql/bin npm run test:native-migrations --prefix tools/editorial-tests
```

Se a distribuição incluir bibliotecas privadas, configure também `LD_LIBRARY_PATH` apontando para seu diretório `lib`. O teste não baixa dependências, não aceita uma URL de banco e nunca lê `.env`: cria um servidor descartável em `127.0.0.1`, porta própria, diretório privado temporário e dados sintéticos. A autenticação `trust` fica limitada a esse servidor de teste. Ao terminar, fecha os clientes, para o servidor e remove o diretório. Não execute como root (`initdb` recusa).

`observed-baseline.ts` conserva a reconstrução da baseline antes contida na fixture PGlite. A nova suíte usa essa mesma baseline e os serviços reais com dois clientes `garimpa_app`, sem superuser/BYPASSRLS. Verifica A/B/A, limpeza de contexto após commit/rollback, disputa pela última quota, aceite simultâneo de convite e timeout de lock com rollback integral. Reproduz e exige os dois contraexemplos do rollout: M2 antes das projeções esvazia leituras legadas; M2 reaplicada no fim remove a restrição de owner e bloqueia reativação de conta. O segundo contraexemplo roda dentro de transação integralmente revertida.

O resultado fica em `docs/implementation/evidencias/execucao-26-native-postgres.json`, com hashes dos 14 SQLs executados. **PASS de um contraexemplo confirma o defeito da candidata; não a libera.** Não há teste de Supavisor, Auth, Storage, navegador ou versão publicada nesta suíte. As 21 suítes PGlite continuam complementares.

### Cadeia substituta A/B/C (rodada27)

`npm run rollout:verify --prefix tools/editorial-tests` confere hashes/ordem sem conexão. `test:replacement-rollout` executa as três unidades novas em PostgreSQL17.6 nativo, com a mesma configuração de binários descrita acima. Verifica expansão compatível, bloqueios de backend/SQL/definer, corte exato, preservação de policies específicas, grants por tabela/coluna/view, alteração de views, concorrência e recuperação. Não aplica nada remotamente.

As fixtures comerciais completas agora usam `supabase/rollouts/v2/manifest.json` (três instalações prévias + três novas). Casos com `migrationCount` continuam sendo diagnósticos históricos da cadeia anterior. O diagnóstico `test:native-migrations` mantém os contraexemplos antigos, exercita o DAL transacional abaixo do novo guard e grava resultado27 separado; a prova positiva do serviço comercial com guard pertence à nova suíte. Nenhum fixture instala um controle falso de aprovação para fazer o código passar.

O fechamento27 inclui 23 verificações em PostgreSQL17.6 com duas conexões reais, seis aplicações locais e contraprovas de catálogo/privilégios, além de monitoramento agregado, suspensão/skips, quotas/convites concorrentes e recuperação. As 21 suítes SQL do fechamento usam a candidata onde a fixture é completa; estados históricos continuam explicitamente separados. Fixtures reconstruídas não homologam triggers legados reais, Auth/Storage/Supavisor ou deployment publicado. Ver `docs/implementation/27-MIGRATIONS-SUBSTITUTAS-E-VERIFICACAO.md`.

## Fechamento operacional28

`test:operational-maintenance` também exige `BIZUMINER_TEST_PG_BIN` e cria somente PostgreSQL descartável próprio, sem aceitar URL remota. São 21 verificações de backfill, bootstrap/config administrativo, captura manual/navegador/extensão, pareamento concorrente, revogação, sanitização de erros e retirada dos CLIs legados. Usa o trigger original de seed de curadoria. `test:replacement-rollout` grava agora evidência28 e contém 26 verificações mais seis aplicações locais.

O catálogo selado daquela rodada era `docs/implementation/evidencias/rollout-28-expansion-catalog.json`. Os SQLs/manifesto/catálogo27/28 foram preservados em suas respectivas pastas de evidências; não confundir seus hashes com a candidata31. As suítes são ensaio local, não homologação Supabase.
