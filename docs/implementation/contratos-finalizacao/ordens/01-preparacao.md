# OS-01 — Candidata, publicação e recuperação preparadas

Estado: PRONTA
Papel: executor-blindado
Base verificada: main / 43700c59f4e24f68f3a2e32c20ee5147fa4816cd + alterações locais preexistentes; conferir novamente antes de executar.
Depende de: Nenhuma ordem; ler índice e CF-01/02/03.
Execução: sequencial

## Objetivo e aceite

Preparar a execução sem mudar produção ou código.
- AC-1: confirmar alvo, histórico anterior, hashes e candidata de 462 fontes, preservando todo trabalho preexistente; distinguir HEAD antigo de fontes novas.
- AC-2: inventariar escritores, refs, secrets necessários por nome, gatilhos automáticos e mecanismo de manutenção que permita smokes reservados; documentar como comprovar fechamento de URLs antigas/imutáveis e retomada. Nenhuma DDL fica liberada se o mecanismo não puder ser provado na OS-02.
- AC-3: prover ferramentas PostgreSQL17 e acesso legítimo de exportação; produzir backup seletivo de ensaio e restaurá-lo em cluster local novo. Identificar destino privado persistente, responsável e comando de recuperação real, sem segredos.
- AC-4: candidata compilável e testes pertinentes aprovados; provar viabilidade de publicação entre B e C e recuperação compatível. Não criar dívida de correção silenciosa.

## Leitura e contrato

- `docs/implementation/33-REAVALIACAO-DE-RISCO-E-ROLLOUT-DIRETO.md`, preservação35 e contratos CF-01/02/03.
- `docs/implementation/evidencias/execucao-31-release-fontes.json`, arquivo de fontes persistido e manifesto SQL.
- `packages/web/lib/commercial-rollout.ts`, `tenant-db.ts`, `public-offer-db.ts`, `capture-dispatch.ts`; workflows capture-offers e monitor-prices.
- `tools/editorial-tests/native-postgres-fixture.ts`, `replacement-rollout-flow.test.ts`, `operational-maintenance-flow.test.ts` e package.json dos quatro pacotes.

## Escrita autorizada

Somente resultado e evidência sanitizada abaixo; nenhuma edição de fontes, lockfiles, manifests ou contratos. Preparar cópia isolada sob `/tmp/bizuminer-finalizacao/os-01/`: fontes auditadas, ferramentas padrão, builds, testes e arquivos privados temporários; não copiar `.env` para pacote/publicação. Resultado não pode conter conteúdo do backup.
Artefatos de comandos: diretório temporário próprio, `.next`, `tsconfig.tsbuildinfo`, builds da extensão e node_modules apenas na cópia isolada; dump/passfile/serviço privados fora do Git, com destino persistente restrito definido antes da DDL.

Resultado: `docs/implementation/contratos-finalizacao/resultados/01-preparacao.md` — novo, exclusivo do executor desta ordem.
Evidência: `docs/implementation/contratos-finalizacao/resultados/01-preparacao.json` — opcional, nova e sanitizada, limitada ao aceite desta ordem.
Protegidos: todo caminho fora da lista; contratos compartilhados, SQLs/manifestos selados, testes de aceite e evidências históricas não podem ser alterados. Nenhuma ordem autoriza limpar trabalho preexistente. Escrita remota tem escopo próprio abaixo e não decorre da lista de arquivos.

## Dependências e integração

O executor desta ordem é seu único escritor; não há execução paralela autorizada. Consumir o resultado anterior, conferir suas evidências e interromper a fase dependente se houver falha. CF-01 rege transição, CF-02 preservação/recuperação e CF-03 integração. OS-08 valida o conjunto e OS-10 é o único integrador dos registros centrais. Não avançar com estado desconhecido nem pedir nova autorização genérica quando a existente já cobre alvo/operação e suas condições estão satisfeitas.

## Verificações

Na raiz da cópia isolada, executar os comandos de passagem do índice. `rollout:verify` deve usar o repositório completo com seus insumos, não apenas o tar. Instalar dependências somente por lockfiles existentes, sem reescrevê-los. Suites locais usam fixtures isoladas; nenhuma variável de conexão do ativo deve ser herdada implicitamente. Conferir efeitos do build e fornecer apenas configuração necessária, sem transformar a compilação em smoke de escrita remota.

Suites adicionais existentes: `npm run test:price-evidence --prefix tools/editorial-tests`, `test:rubric`, `test:opportunity`, `test:cockpit`, `test:financial`, `test:experiment`, `test:dispatch`, `test:onboarding`, `test:entitlement`, `test:auth-merge`, `test:secret-bootstrap`, `test:migration-integrity`, `test:verified-workflows`, `test:regressions`, `test:triage-price`, `test:capture-batch` no mesmo prefixo. Registrar reuso de evidência31 por bytes idênticos quando suficiente; não repetir testes sem mudança ou preocupação nova.

Se rerun nativo for necessário: prover `BIZUMINER_TEST_PG_BIN` com diretório realmente verificado contendo binários17 e dependências; executar `npm run test:replacement-rollout --prefix tools/editorial-tests` e `npm run test:operational-maintenance --prefix tools/editorial-tests`. Esses testes gravam JSONs31 em caminhos fixos: executar na cópia isolada, conservar originais e transcrever o resultado novo para a evidência desta ordem. `test:native-migrations` contém contraexemplos da cadeia rejeitada, não é ensaio positivo de A/B/C.

AC-2: leitura de metadados GitHub/Vercel, configuração de conexão e catálogo remoto; registrar todos os entrypoints, inclusive URL de deployment antigo, dispositivos e execuções em curso. AC-3: `pg_dump --version` / `pg_restore --version` depois de ferramentas efetivamente disponíveis; export/restore padrão com parâmetros escolhidos e registrados sem credenciais; comparar inventário/dados/DDL conforme CF-02. Não há runner de backup novo a chamar.

## Operações externas

Somente leituras autenticadas no projeto/equipe/repositório CF-01 e exportação read-only seletiva do BizuMiner. Sem pausa, push, deploy, alteração de env, DDL, convite, envio ou custo. Pode preparar ferramenta local em diretório temporário de origem verificada; se faltar conexão/permissão legítima de export, registrar impedimento concreto, sem pedir genericamente novo OAuth ou elevar o runtime.
