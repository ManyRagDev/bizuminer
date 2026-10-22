# Revisão da alegação de execução sequencial integral

Data: 14/10/2026. Skill: codex-investigador. Modo diagnóstico: nenhuma correção funcional, migration remota, deploy ou envio. O STATUS escrito pelo executor foi preservado e não foi alterado por esta revisão.

## 1. Problema e reprodução

O usuário trouxe a afirmação de que `STATUS-EXECUCAO.md` foi atualizado com todo o progresso, aceites e rastreabilidade. O arquivo agora afirma que **todas as entregas locais tecnicamente disponíveis foram concluídas**, marcando EP-10A, 02/03, 08B, 09, 10B, 11 e 12 como CONCLUÍDO.

**Esperado:** consumidores reais e jornadas verificáveis para todas as entregas independentes dos gates; contexto autorizado no legado; trabalho pendente identificado, conforme prompt 13. **Observado:** houve progresso real em wrappers de banco, PgStore, bootstrap de dispositivo, contratos de importação/disparo e testes. Entretanto, a conclusão integral é incompatível com consumidores ausentes e falhas reproduzidas sob RLS.

Alvo: working tree local, HEAD `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`, com modificações preexistentes e arquivos não rastreados. [Manifesto desta revisão](evidencias/manifesto-revisao-14.json), [STATUS recebido](evidencias/revisao-14-status-relatado.md). Hashes do manifesto anterior mostram, entre seus arquivos inventariados, alterações em STATUS, M-10A1 e tenant-db; outros módulos não cobertos por aquele manifesto também mudaram. Não interpretar essa comparação limitada como inventário completo do diff.

A reprodução usou dados sintéticos em PostgreSQL WASM/PGlite isolado, as onze migrations e roles garimpa_app/public_runtime. Não reproduziu incidente em produção nem login HTTP/browser. Antes dos contraexemplos, o harness precisou ajustar formato ESM e completar dois elementos do baseline omitidos pela fixture: UNIQUE(affiliate_id,marketplace), declarado em `20260826010000_garimpa_affiliates.sql:69`, e SELECT na view, declarado em `20260903200000_garimpa_editorial_context.sql:214`. Logs dessas preparações foram preservados; seus erros não foram classificados como bugs da aplicação.

## 2. Evidências e achados

### RV-01 — P1: contexto de tenant no legado não completa autorização nem compatibilidade

**Confirmado por SQL real e inspeção das entradas; HTTP/browser não executado.** `withTenantDb` (`tenant-db.ts:84–87`) define apenas tenant. Não resolve identidade/membership/papel. O layout administrativo verifica role global e chama `curationSummary("local")` (`app/admin/layout.tsx:17–21`); `admin/page.tsx` também usa serviços com defaults da casa. `checkAffiliateUser` (`api-auth.ts:48–54`) verifica role, sem a membership da conta. O helper `resolveAuthorizedAccount` existe, mas essas entradas não o usam.

Na fixture, uma pessoa tem role afiliado e membership somente em A. `withAccountDb` recusa um contexto forjado para a casa, como deveria. Porém, `curationSummary('local',factory)` lê a contagem privada da casa sem contexto de pessoa/membership. O caminho de layout é estabelecido estaticamente; não se afirma vazamento ocorrido em produção.

Também foram reproduzidos:

| Operação | Obtido | Controle positivo |
|---|---|---|
| `affiliate-db.ts::upsertMarketplaceConfig` por owner legítimo de A | 42501/RLS; `withTenantDb` não define membership_role=owner | Mesma gravação aceita com `withAccountDb` autorizado |
| `editorial-selection-db.ts::getEditorialSelectionDesk` | schemaReady=true, zero candidatos | A mesma view contém uma oferta aprovada acessível em contexto autorizado |
| `CaptureBatchStore.expire('a')` | Zero lotes encerrados | Existe um lote running vencido, visível no contexto correto |

`editorial-selection-db.ts:125` e `capture-batch-db.ts:83–101` continuam abrindo transações sem set_config/contexto. São consumidores citados no prompt e não encerrados. Além disso, `withTenantDb/withUserDb` introduziram um fallback sem begin, que pode mascarar mocks/clientes inadequados; isso não foi apresentado como falha do driver postgres.js normal, que possui begin.

**Cadeia:** acesso baseado só em role/tenant/default local → ausência de autorização de membership no consumidor ou ausência dos demais campos de contexto → leitura privada da casa sem autorização específica, escrita legítima recusada ou operação invisível sob RLS. **Consequência:** EP-10A permanece parcial e M-10A2 não pode ser ativada com alegação de compatibilidade encerrada.

### RV-02 — P1: revogar membership não revoga o bootstrap de extensão

**Confirmado em SQL.** `authenticate_extension_device` (`20261014100000...sql:123–132`) junta membership sem exigir `am.revoked_at is null`. A revalidação de `persistExtensionCapture` também não filtra a revogação da membership nesse join.

Dispositivo/conta/role ativos: role_active=true. Após revogar somente a membership: a função continua devolvendo role_active=true, enquanto `withAccountDb` corretamente nega o próximo comando da mesma pessoa. `extension-db.ts::authenticateDevice` usa esse booleano na decisão de autenticação.

Isso prova a falha do bootstrap/revalidação de vínculo. Não prova gravação completa de captura ou exposição real: a persistência ainda tem outros obstáculos de contexto/RLS descritos em RV-01. Corrigir apenas estes obstáculos sem corrigir a revogação preservaria a decisão de acesso incorreta.

### RV-03 — P1: entregas descritas como completas ainda não possuem jornadas integradas

**Confirmado por inspeção dos consumidores nas áreas ativas; não se presume deploy diferente.** Busca em packages/tools encontrou:

| Entrega | Código observado | Lacuna operacional |
|---|---|---|
| EP-02/03 | rubric-db, classifyOpportunity/rankOpportunities e testes | Writes de avaliação/review e ranking não ligados a serviços/telas da nova jornada; oportunidade manual existente não é radar contextual completo |
| EP-09 | experiment-contract e testes; tabela policy_experiment | Sem consulta/persistência/fluxo operacional de experimento e relatórios de coorte encontrados |
| EP-08B | Parser interno e três testes | Sem upload privado, preview em UI, confirmação/commit e conciliação ligados ao ledger encontrados |
| EP-11 | dispatch-db CRUD/lease, funções puras e adapter sintético | Sem consumidores do DAL, worker orquestrador, painel, revalidação factual ligada ao I/O, quotas atômicas e reconciliação persistida encontrados |
| EP-12 | Funções puras de onboarding/quota/convite e tabelas | Sem fluxo persistido de convite/provisionamento, consumo atômico de quota, suspensão/saída integrados encontrados |

O grep dos nomes das tabelas de entitlement/onboarding/uso/experimento/import encontra migrations/preflight e, para alguns domínios, apenas DAL não consumido. Não é evidência de uma jornada concluída. Os novos testes da matriz de segurança são mocks/objetos e funções puras; não exercitam lease SQL concorrente nem quotas reais. O ensaio comercial de 31 cenários permanece inalterado em relação ao manifesto anterior e não chama o DAL de dispatch/onboarding/importação.

O canal oficial e o relatório de fornecedor são bloqueios genuínos. Eles não explicam a ausência da infraestrutura funcional independente prevista no prompt. A conclusão correta dessas entregas é parcial/estrutural, com os resultados dependentes dos gates separados.

### RV-04 — P1: parser denominado rigoroso aceita dados inválidos e perde distinção de identidade

**Confirmado em runtime da função pura.** `commission-import-contract.ts:154–190` usa parseInt, defaults e casts sem verificar domínio completo. Contraexemplos:

- `100x` vira valor do pedido 100 e `12abc` vira comissão 12; estados `nonsense` são aceitos.
- Linha com apenas cinco campos recebe BRL e estados confirmed sem essa informação na fonte.
- Comissão negativa é aceita como linha válida.
- IDs distintos `order='a:b', item='c'` e `order='a', item='b:c'` produzem o mesmo canonicalDigest porque a serialização concatena campos com `:`. É colisão de representação, não colisão criptográfica.

A função ainda soma moedas distintas em totais únicos e não possui tratamento de CSV quoted/deduplicação operacional. Esses dois últimos pontos foram inspecionados, não usados como reprodução do formato de um fornecedor desconhecido. O arquivo real continua necessário. Reordenação invariante não demonstra idempotência de commit nem concorrência.

### RV-05 — P1: guards de validade não falham fechados

**Confirmado em runtime das funções puras.** `dispatch-contract.ts:142–147` só rejeita quando a data é finita e vencida; `validUntil='invalid'` passa com canDispatch=true. `saas-onboarding-contract.ts:160–165` aceita convite com expiresAt inválido. `validateEntitlementQuota` aceita entitlement active cujo endsAt terminou em 2020, pois examina status/contagens sem validar período.

O validator ainda escolhe limites 5/10 quando ausentes, sem política comercial aprovada. Como esses guards não estão ligados a serviços operacionais, não se afirma envio ou convite indevido ocorrido. Eles também não servem como prova de proteção backend/quotas atômicas.

### RV-06 — P2: rastreabilidade de migrations e estados financeiros incorreta

**Confirmado por inventário.** Cinco nomes da tabela de migrations do STATUS não existem no diretório:

- `20261014101000_garimpa_price_evidence_canonical.sql`
- `20261014102000_garimpa_rubric_and_comparison_shadow.sql`
- `20261014103000_garimpa_opportunity_pipeline.sql`
- `20261014104000_garimpa_domain_events_and_idempotency.sql`
- `20261014107000_garimpa_commission_import_batches.sql`

O arquivo real de 101000 é M-10A2/RLS e o de 107000 é atribuição de cliques/canais. Os onze arquivos reais foram executados pelo runner; o erro é da tabela de rastreabilidade, não uma falha reproduzida na cadeia SQL. O STATUS também descreve comissão settled/refunded, enquanto C-07/código usa received/reversed; refunded é estado de conversão, não de comissão.

### RV-07 — P1: testes aprovados não encerram EP-10B nem execução integral

**Confirmado pela cobertura e contraexemplos.** Os testes verdes são reais no escopo executado. Os novos casos unitários cobrem valores em objetos; não provam multi-sessão, worker integrado, Auth/Storage/browser, nem toda a superfície nova. EP-10B continua sem certificação completa. Não atribuir os contraexemplos à falta de staging: há falhas reproduzidas localmente com SQL, e os de parser/guards independem de banco remoto.

## 3. Conclusão e hipóteses

**Conclusão: houve progresso parcial; a execução integral alegada não está comprovada e contém falhas técnicas confirmadas.** Não encerrar os épicos nem recomendar ativação das policies restritivas ou convite externo com este STATUS.

| Hipótese | Experimento/evidência | Resultado |
|---|---|---|
| A contagem de 378 testes web é falsa | Runner nativo reexecutado | Descartada: 378 passaram |
| Os typechecks web/persistence ou build ainda falham | Reexecutados sem código funcional modificado | Descartada no snapshot atual: exit 0 |
| Só resta definir staging e dados comerciais | Serviços reais sob RLS e probes puros | Descartada: falhas locais e integrações ausentes |
| Wrappers de tenant garantem autorização de conta no legado | Serviço consulta a casa; contexto completo recusa não membro | Confirmada a insuficiência do wrapper; alcance HTTP ainda sem reprodução de browser |
| Revogação da membership é respeitada pelo bootstrap novo | Consulta antes/depois em PostgreSQL isolado | Refutada: role_active permaneceu true |
| Parser/guards rigorosos rejeitam entradas malformadas | Probes explícitos | Refutada: valores/estados/datas inválidos passaram |

Os achados são sobre working tree e ensaio isolado. Esta revisão não leu o schema remoto atual nem identificou commit implantado. A afirmação de preservação de produção não foi certificada aqui; não houve ação remota desta revisão.

## 4. Correção recomendada — não executada

1. Completar EP-10A nas fronteiras e consumidores: resolver conta autorizada, revalidar membership/role, propagar contexto correto; comprador e worker/dispositivo com identidade própria. Garantir acesso legítimo e recusa ao não membro, sem voltar a policies amplas. Cobrir mesa editorial, lotes, APIs/layout e configuração de loja.
2. Corrigir filtro de membership ativa no bootstrap e revalidações da extensão; demonstrar captura legítima antes da revogação e recusa depois.
3. Concluir integrações locais de rubrica/radar/relatórios/importação/distribuição/onboarding por entregas do prompt 13. Não criar novos fundamentos de domínio nem marcar helpers como produto pronto.
4. Parser: validação exata de números inteiros seguros/estados/moeda, dados ausentes sem confirmação inventada, encoding/CSV real conforme contrato; representação não ambígua para digest; deduplicação e commit transacionais com testes.
5. Prazos/configurações desconhecidos devem bloquear a ação dependente. Respeitar período e limites explicitamente aprovados; integrar quota atômica ao backend e não só ao validator.
6. Reconciliar nomes reais de migrations, estados e aceites no STATUS; manter bloqueios comerciais separados de pendências técnicas. Arquivo já aplicado em outro alvo exige evolução aditiva.

Não aplicar M-10A2 em produção nem convidar clientes para “testar se funciona”. Staging identificado/autorizado, consumidor adaptado, recuperação e pós-verificação seguem necessários.

## 5. Verificação executada e critérios de aceite

| Checagem desta revisão | Resultado | Evidência |
|---|---|---|
| Web nativo, DATABASE_URL/NODE_OPTIONS removidos | 378 testes, zero falhas | [Log](evidencias/revisao-14-web-tests.log) |
| Persistence nativo, mesmas remoções | 35 testes, zero falhas | [Log](evidencias/revisao-14-persistence-tests-native.log) |
| `npm run test:commercial --prefix tools/editorial-tests` | 31 cenários; onze migrations | [Log](evidencias/revisao-14-commercial-sql.log) |
| Typecheck web/persistence, incremental false | Exit 0 em ambos | [Web](evidencias/revisao-14-web-typecheck.log), [Persistence](evidencias/revisao-14-persistence-typecheck.log) |
| Build Next com URL local não conectada | Exit 0 | [Log](evidencias/revisao-14-build.log) |
| Harness diagnóstico | Sete grupos de contraexemplos confirmados; assertions descrevem o defeito observado | [Resultados](evidencias/revisao-14-contraexemplos.json), [Fonte](evidencias/revisao-14-probes.mts) |

Execução do harness, a partir da raiz:

```bash
node --import ./tools/editorial-tests/node_modules/tsx/dist/loader.mjs docs/implementation/evidencias/revisao-14-probes.mts
```

São contraexemplos, não testes de aceite do produto: seu exit 0 confirma que os defeitos observados se reproduziram. Os três logs de preparação estão em `evidencias/revisao-14-preparacao-*.log`. Toda escrita ocorreu somente no PGlite em memória; factory injetada impede conexão à URL fictícia. As correções de fixture estão somente no harness diagnóstico, nunca nas migrations/serviços da aplicação.

Critérios após reparo: owner grava configuração; não membro não lê a casa; mesa editorial e captura respeitam contexto; lote vencido encerra; revogação impede bootstrap e persistência; parser/guards rejeitam as entradas documentadas; consumidores reais completam as jornadas; quotas/leases concorrentes testados em sessões independentes; STATUS e rastreabilidade correspondem às provas. Reexecutar os cenários corretivos anteriores para preservar os caminhos já funcionando.

Capture/extension e os outros runners SQL não foram repetidos nesta revisão. Não extrapolar os resultados acima aos 556 testes/102 cenários do relato, nem a Auth/Storage/browser/produção.

## 6. Próximo passo

Executor deve fechar RV-01–05 e as integrações do prompt 13, revalidando hashes e instruções atuais. Depois repetir a auditoria completa e corrigir o STATUS com os estados verdadeiros. Homologação remota só com alvo e autorização confirmados; ela não substitui o trabalho local ainda disponível.

Foram criados somente este relatório, harness diagnóstico e evidências em docs/implementation. Código funcional e STATUS do executor permaneceram intactos para permitir reprodução independente.
