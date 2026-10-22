# Encerramento atual da OS-01

Estado: CONCLUIDO

**Limitação operacional posterior:** a OS-05 demonstrou que novos builds são bloqueados pela pausa do projeto Vercel. A preparação e o restore continuam comprovados; a publicação sob o mecanismo de manutenção proposto depende da reconciliação documentada em [OS-05](05-publicacao.md). O acesso reservado a deployment antigo não certifica publicação nova.

Destino persistente explicitamente autorizado pelo proprietário: `/home/many/.local/share/bizuminer/backups/`. Cópia idêntica conferida em `20261016-os01-preparacao.dump`, 6.281.275 bytes, diretório0700 e arquivo0600, fora do Git. Os bloqueios de exportação e destino foram resolvidos por autorização humana, sem contorno de rejeição.

Aceites: candidata/alvo/histórico conferidos; inventário e estratégia de manutenção preparados; exportação real e restore local das28 tabelas com counts/digests íntegros,29 policies/51 FKs válidas; testes/builds/tipagem aprovados. Conferência da serialização decimal e bytes IEEE754 registrada no JSON. A prova operacional de pausa e acesso reservado pertence à OS-02 e continua exigida antes da DDL.

Nenhuma migration/deploy/DML/pausa foi realizada nesta ordem. A instrução humana mais recente autoriza continuar autonomamente pela sequência; próxima ordem: OS-02. Registros anteriores abaixo permanecem como histórico, com seus bloqueios superados.

## Histórico preservado da preparação

# Retomada da OS-01 — 2026-10-16T18:43:18.084537+00:00

Estado atual: BLOQUEADO — somente retenção permanente do backup.

O proprietário autorizou explicitamente a exportação das28 tabelas para o destino temporário indicado e a restauração local, e determinou execução autônoma das ordens até o encerramento. Isso supera a orientação anterior de aguardar nova solicitação entre ordens; dependências e fronteiras técnicas continuam obrigatórias.

## Trabalho efetivamente concluído nesta retomada

- Dump real criado em `/tmp/bizuminer-finalizacao/os-01/private/garimpa-ensaio.dump`, 6.281.275 bytes, diretório0700/arquivo0600. Exportação somente leitura pelo runtime `garimpa_app`, sem superuser/BYPASS, usando snapshot compartilhado com pg_dump17.11. Nenhuma credencial ou registro bruto foi gravado no Git.
- Restauração integral do dump em cluster local descartável17.11, com senha temporária/SCRAM e loopback; cluster encerrado após o teste. **28/28 contagens e digests conferem;29 policies,51 FKs e zero constraints inválidas.**
- A primeira comparação sinalizou `price_observation`: fonte usa `extra_float_digits=0`, local usa1. Após diagnóstico por coluna, as mesmas configurações produziram o digest original; prova adicional por ID e bytes IEEE754 de `claimed_discount_rate` também conferiu. Não alterei os dados nem atualizei a referência para ocultar diferença; a primeira tentativa continua preservada na evidência.
- Conferência administrativa posterior encontrou as mesmas contagens das28 tabelas do dump. A única policy de SELECT restrita é de `affiliate_secret`, cuja contagem administrativa é zero. Isso comprova a completude deste ensaio, sem atribuir ao runtime bypass inexistente. A inspeção posterior não é snapshot compartilhado nem baseline de manutenção.
- Projeto e histórico Supabase reconfirmados: A/B/C ausentes. Web continua no deployment antigo; nenhuma pausa, migration, DML, publicação ou alteração de Auth/Storage foi feita. Os testes aprovados da rodada anterior continuam válidos e não foram repetidos sem necessidade.

## Impedimento remanescente

A revisão automática **rejeitou antes de executar** a cópia idêntica para `/home/many/.local/share/bizuminer/backups/20261016-os01-preparacao.dump`, com a justificativa de que o destino persistente difere de `/tmp` explicitamente autorizado. Não tentei outro destino ou transporte. Foi solicitada aprovação humana exata para esse diretório/arquivo; ainda não há resposta registrada nesta retomada.

```text
[BLOQUEIO DE FRONTEIRA]
Ordem: OS-01 — docs/implementation/contratos-finalizacao/ordens/01-preparacao.md
Evidência: exportação/restore real PASS; revisão automática rejeitou a cópia permanente por destino adicional não especificado.
Necessidade: autorizar destino privado persistente e verificar cópia idêntica do mesmo dump.
Fronteira: /home/many/.local/share/bizuminer/backups/20261016-os01-preparacao.dump.
Preservado: dump autorizado, dados restaurados/conferidos localmente, fontes e banco remoto intactos.
Retomada: copiar somente após aprovação exata; fechar OS-01 e continuar OS-02 em diante autonomamente.
```

A CF-02 exige cópia privada persistente antes da DDL e afirma que `/tmp` sozinho não atende a retenção. Por isso não abri manutenção que deixaria o site parado aguardando essa aprovação. Não existe impedimento de autorização genérica para migrations nem falha do MCP; falta liberar apenas a retenção neste destino concreto. O JSON desta ordem registra as provas novas e mantém o bloqueio anterior como histórico.

## Histórico anterior — exportação antes não autorizada, agora resolvida

# Resultado OS-01 — Preparação

Estado: BLOQUEADO
Data: 2026-10-16T18:18:30.106694+00:00
Base/ambiente: main / 43700c59f4e24f68f3a2e32c20ee5147fa4816cd; alterações anteriores preservadas, zero staged. Execução conforme skill executor-blindado; nenhum contrato, SQL ou comportamento editado.

## Aceite → evidência

| Aceite | Resultado observado |
|---|---|
| AC-1 | 462 fontes exatas, tar e hashes A/B/C conferidos; alvo MCP confirmado. Histórico continua com M1 e dois complementos, sem A/B/C. Inspeção remota: PostgreSQL17.6, 28 tabelas,29 policies, controle e bucket próprio ausentes. O preflight completo de cada unidade continua exigido na fase correspondente. |
| AC-2 | Inventário e estratégia preparados; web/workers publicados continuam antigos. Manutenção não foi aberta, cobertura de todos os endereços e acesso reservado não foram demonstrados. Essas provas pertencem à OS-02. |
| AC-3 | **Não cumprido.** pg_dump/pg_restore/PostgreSQL17.11 preparados em /tmp, origem oficial e checksums conferidos; exportação foi rejeitada antes de executar. Não há dump real, restauração de dados reais ou cópia persistente protegida comprovados. |
| AC-4 | 16 comandos locais aprovados após correção dos insumos da cópia e repetição fora das restrições do sandbox; ambas suites nativas aprovadas. Build web/extensão e tipagem dos quatro pacotes passam. Nenhuma publicação realizada. |

[Evidência estruturada](01-preparacao.json). Diretório de comandos: `/tmp/bizuminer-finalizacao/os-01/source`; logs temporários em `/tmp/bizuminer-finalizacao/os-01/checks/`. Esses logs são locais/efêmeros; os resultados e limites relevantes estão neste relatório e no JSON.

## Verificações executadas

Todos os comandos abaixo foram executados na raiz da cópia isolada indicada acima. Quando houve repetição, a evidência preserva tentativa original e nova execução.

| Comando | Exit code final |
|---|---|
| `npm run rollout:verify --prefix tools/editorial-tests` | 0 |
| `npm test --prefix packages/web` | 0 |
| `npm test --prefix packages/persistence` | 0 |
| `npm test --prefix packages/capture` | 0 |
| `npm test --prefix packages/extension` | 0 |
| `npm run typecheck --prefix packages/web` | 0 |
| `npm run typecheck --prefix packages/persistence` | 0 |
| `npm run typecheck --prefix packages/capture` | 0 |
| `npm run typecheck --prefix packages/extension` | 0 |
| `npm run build --prefix packages/web` | 0 |
| `npm run build --prefix packages/extension` | 0 |
| `npm test --prefix tools/editorial-tests` | 0 |
| `npm run test:commercial --prefix tools/editorial-tests` | 0 |
| `npm run test:public-readiness --prefix tools/editorial-tests` | 0 |
| `npm run test:verified-upgrade --prefix tools/editorial-tests` | 0 |
| `npm run test:cf-regressions --prefix tools/editorial-tests` | 0 |

- Pacotes: web379, persistence8, capture8, extension4 testes aprovados; quatro typechecks, dois builds.
- `npm run test:replacement-rollout --prefix tools/editorial-tests`: exit0,39 resultados; `npm run test:operational-maintenance --prefix tools/editorial-tests`: exit0,21 resultados. Engine nativa17.11, clusters descartáveis/loopback com dados sintéticos. Outputs31 foram gravados **apenas na cópia**, sem substituir os históricos do repositório.
- Editorial PGlite:29 cenários; comercial:31 cenários. Outras suites SQL31 e build Node24.11.0 são **reuso histórico**, sem alegação de nova execução;36 fontes de testes editoriais conferem com manifesto31. O build novo desta ordem usou Node22.23.2; Vercel está em Node24.x.
- Verificador falhou inicialmente por catálogo não copiado; suites comerciais por três fixtures originais ausentes na cópia. Foram copiados os insumos inalterados; não se modificaram assertions ou código. Web/QR/capture-process/build falharam sob restrições do sandbox; diagnóstico observou `uv_interface_addresses` bloqueado e stdout vazio. Rerun autorizado fora dele passou sem patch. Não houve duas tentativas de correção de lógica.

## Operação observada e manutenção preparada

| Escritor / entrada | Estado observado | Tratamento requerido antes da DDL |
|---|---|---|
| Web/Server Actions/APIs/callback, catálogo, `/bizu`, `/p`, `/go` | Vercel web na equipe prevista, root packages/web, Node24.x; deployment `dpl_FtFtkK1C91T6Z38H5985mYe2RGRL`, main43700c59, diferente da candidata local | Pausa apenas do projeto; drenar requests/pools. Comprovar cobertura das URLs canônicas e de deployments, mantendo smokes reservados viáveis. |
| URLs imutáveis/preview | SSO `all_except_custom_domains`; custom domains públicos bizuminer.com.br/www e alias web-khaki-beta-l29v7h3o33.vercel.app | Enumerar também deployments antigos e conferir proteção/negação. Pausa da produção, isoladamente, não prova bloqueio de todos. Não abrir endpoint antigo para testar C. |
| Monitoramento GitHub | Workflow366364369 ativo, `MONITORING_ENABLED=true`; runs recentes no SHA43700c59, incluindo38911462095 concluído em16/10 às13:54UTC | Desabilitar novos inícios e drenar/cancelar somente este workflow durante OS-02. Manter a variável original; publicar refs compatíveis antes de C. |
| Captura em lote/triagem | `.github/workflows/capture-offers.yml` existe só localmente; API GitHub retornou apenas workflow de monitoramento | Publicar arquivo/ref compatível em OS-05, manter parado até smoke; `GITHUB_CAPTURE_REF` ausente na metadata Vercel observada implica fallback main no código. |
| Dispatch/envio | Worker/código local não é prova de job oficial ativo; canal/adapter continuam condicionados | Não disparar mensagem nem habilitar canal por esta ordem. |
| Captura manual/navegador/extensão | Três dispositivos na base; rotas usam web e runtime; execução automática multicliente é recusada no código | Proprietário deve parar captura e drenar requisições/dispositivos; antigos permanecem desativados se sem prova. |
| CLIs locais/maintainers | Backfill/bootstrap/config têm caminhos administrativos delimitados; quatro CLIs antigos abortam antes de conectar | Identificar e suspender qualquer processo em uso, sem conceder permissões novas ou rodar seed/purge como teste. Inventário do repositório não prova ausência de consumidor externo de credencial. |

A metadata Vercel foi lida sem decriptar valores: DATABASE_URL também existe em preview, que não é ambiente isolado; SUPABASE_SERVICE_ROLE_KEY e token GitHub são server-only. AFFILIATE_SECRETS_MASTER_KEY/KEY_V1 não apareceram na lista consultada: não habilitar gravação de novos segredos sem confirmar/prover chave válida na ordem própria. A tabela de segredos atualmente tem zero registros; não foi gerada chave nem alterado ambiente.

Repositório GitHub confirmado, default main. Leituras iniciais do token de dispatch retornaram403 para variables/hooks; GitHub CLI já autenticado conseguiu leitura: monitoramento habilitado e zero repository webhooks. Isso não prova ausência de GitHub App/integração Supabase: checar associação antes de push conforme CF-01/OS-05. Os dois workflows locais não contêm aplicação de migration. Nenhum push foi feito.

A estratégia a comprovar é pausa da produção BizuMiner, proteção já existente nas URLs de deployment, jobs/dispositivos drenados e acesso reservado à candidata compatível entre B e C. A [API oficial de pausa](https://vercel.com/docs/rest-api/projects/pause-a-project) descreve bloqueio da produção ativa; não amplia essa garantia para toda URL histórica. Se os testes OS-02 não demonstrarem cobertura e acesso reservado, há bloqueio de fronteira antes de A, sem editar firewall/OAuth global por iniciativa própria.

## Bloqueio de fronteira

```text
[BLOQUEIO DE FRONTEIRA]
Ordem: OS-01 — docs/implementation/contratos-finalizacao/ordens/01-preparacao.md
Evidência: revisão automática rejeitou o comando de exportação seletiva antes de sua execução.
Necessidade: autorização explícita do payload e destino do dump; depois export/restore real e proteção persistente conforme CF-02.
Fronteira: exportação das 28 tabelas garimpa, contendo dados potencialmente sensíveis, para /tmp/bizuminer-finalizacao/os-01/private/garimpa-ensaio.dump.
Preservado: fontes, SQLs, dados remotos, contratos e históricos; verificações locais e ferramentas prontas.
Retomada: resposta humana à aprovação específica solicitada; retomar AC-3, sem contornar a rejeição ou iniciar OS-02.
```

Motivo informado pela revisão automática: “A ação exporta dados potencialmente sensíveis de todo o schema garimpa para um dump local em /tmp, mas a autorização do usuário não especifica esse payload nem esse destino.” A solicitação assíncrona explica o conteúdo, destino privado fora do Git e restore exclusivamente local descartável. **Sem resposta ainda registrada nesta execução.** Não reenviei a ação por outro transporte; o script de export não chegou a ser criado, não há dump e não foi executado restore real.

A ferramenta PostgreSQL foi baixada do repositório oficial PGDG e extraída somente em `/tmp/bizuminer-finalizacao/os-01/pg-tools/`, sem instalar pacote, serviço ou dependência da aplicação. Um cluster sintético passar não satisfaz o restore dos dados reais. A cópia privada persistente continua necessária antes da primeira DDL; `/tmp` sozinho não satisfaz essa proteção. A [documentação oficial](https://supabase.com/docs/guides/platform/backups) distingue metadata SQL dos arquivos Storage, que precisarão de preservação própria quando existirem.

## Alterações próprias e conferência final

Somente dois arquivos novos no repositório: este resultado e `01-preparacao.json`. Cópia isolada, dependências previamente instaladas copiadas, ferramentas e logs temporários ficaram no diretório autorizado. Zero migrations, DML, pausa, alteração de role/policy, env, Auth, Storage, push/deploy, convite, envio ou custo realizados.

HEAD, branch, diff tracked e staged anteriores conferem com o início; as462 fontes não mudaram. Contagens remotas observadas (1.657 produtos,9.300 observações,1.495 publicações,172 links) são preliminares com escritores ativos, não baseline congelada nem backup. Não há prova nova de login, Storage/pooler gerenciados ou runtime publicado atualizado.

Próxima etapa: **resolver AC-3 e encerrar a própria OS-01**. OS-02 depende desse resultado concluído e não foi acionada. Contratos/ordens permanecem somente leitura, como determina a [skill executor-blindado](/home/many/.codex/skills/executor-blindado/SKILL.md): “Quando faltar campo, arquivo, dependência, decisão ou autorização, pare a unidade afetada.”
