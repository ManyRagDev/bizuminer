# 31 — Reconciliação real, correção de privilégios e pacote de homologação

15/10/2026, horário de São Paulo; evidências técnicas incluem timestamps UTC de 16/10. **Correções locais conferidas; implantação de produção ainda CONDICIONAL.** A autorização humana anterior permanece válida, condicionada à liberação técnica independente. Não houve nova migration remota, deploy, push, alteração de secret, envio ou contratação de recurso pago nesta rodada.

## Resultado

Supabase MCP e Vercel MCP/CLI estão autenticados e foram usados em leituras reais. A reconciliação identificou três omissões na fixture28 e um defeito relevante de permissões herdadas nas migrations substitutas. A candidata foi corrigida e novamente ensaiada. Não foi alterada a produção para fazê-la combinar com a fixture.

O auditor GPT-6.1 Sol, raciocínio Alto, solicitado pelo usuário, executou revisão independente e testes negativos. Ver [parecer31](31-AUDITORIA-INDEPENDENTE-RECONCILIACAO.md). A aprovação continua limitada ao ensaio isolado; não autoriza promover A/B/C no banco ativo.

## Estado remoto confirmado

| Item | Evidência atual |
|---|---|
| Supabase | Projeto `spbuwcwmxlycchuwhfir`, PostgreSQL17.6; três instalações V2 anteriores preservadas; A/B/C ausentes |
| Inventário inicial | 28 tabelas e 29 policies; preflight inicial compatível com os objetos reais |
| Segurança legada | `app_user_role` com FORCE RLS; grants `service_role=arw` em `capture_batch` e `triage_run`; sem USAGE de `service_role` no schema |
| Defaults reais | Objetos de relação criados por `postgres` em `garimpa` herdam `garimpa_app=arwd`, inclusive views novas |
| Integridade | 51 FKs reais compatíveis estruturalmente; 149 constraints reais validadas; quatro funções legadas comparadas integralmente; três sequences com grants observados |
| Advisor | Nenhum finding de segurança referente a `garimpa` retornado; informações dos demais produtos foram omitidas |
| Vercel | Projeto `web`, `prj_fhslrWGdYJG5rdKnE8vkGmFSh3Ym`; equipe `team_CdqNeIvhoe03YClNYUpP6C1w`; Next.js, diretório `packages/web`, Node24.x |
| Produção publicada | `dpl_FtFtkK1C91T6Z38H5985mYe2RGRL`, READY; commit `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`, branch `main` |
| Staging | `list_branches` retornou lista vazia. Não foi identificada aplicação com banco isolado para homologação |

A produção Vercel está no mesmo commit antigo observado no cron GitHub da rodada28. As alterações locais posteriores não estão publicadas. O histórico GitHub anterior é evidência daquela rodada, não nova prova de execução dos workers nesta rodada.

As variáveis Vercel foram lidas **somente como metadados**, sem descriptografar valores. `DATABASE_URL` tem targets production/preview e não apresenta seleção de branch nesse inventário. Isso não prova igualdade dos valores, mas também não comprova isolamento de preview: não publicar um preview presumindo que seu banco seja independente.

Fontes: [comparação independente](evidencias/auditoria-31-comparacao.json), evidências `auditoria-31-{identity,security,structure,defaults,counts,migrations}.json`, [deployment](evidencias/execucao-31-vercel-producao.json), [metadados de ambiente](evidencias/execucao-31-vercel-env-metadata.json) e [advisor filtrado](evidencias/execucao-31-advisor-garimpa.json). Contagens de registros são snapshots; não constituem backup nem demonstram identidade integral dos dados.

## Defeito encontrado e correção

A fixture anterior omitia FORCE RLS, dois grants legados e, principalmente, os defaults de privilégios reais. No banco ativo, conceder apenas SELECT/INSERT a uma tabela nova não remove UPDATE/DELETE herdados. Um ensaio contrafactual isolado demonstrou UPDATE e DELETE de um evento de domínio pelo runtime. C28 recusaria o catálogo divergente; recapturar seu selo sem corrigir B perpetuaria o defeito.

Correções implementadas:

1. `observed-baseline.ts` reproduz os controles/grants observados e instala o default real depois de reconstruir os objetos legados, para não inventar novos privilégios neles.
2. A e C recusam defaults diferentes dos reconciliados, antes de avançar. Não alteram `ALTER DEFAULT PRIVILEGES` no banco alvo.
3. B normaliza somente as 37 tabelas comerciais novas por [matriz explícita](../../tools/editorial-tests/rollout-privilege-matrix.json): 20 com SELECT/INSERT/UPDATE e 17 com SELECT/INSERT. Nenhuma recebe DELETE, TRUNCATE, REFERENCES, TRIGGER ou MAINTAIN do runtime. São preservados UPDATE de `audience_policy_version.approved_by`, `approved_at` e `private_artifact.status`; conteúdo e identidade desses registros permanecem protegidos.
4. A nova view `effective_price_evidence_policy` recebe somente SELECT. A view legada conserva seus grants/opções; sua definição é substituída deliberadamente pelo contrato canônico de B.
5. C confere também o inventário de ACLs de coluna. Grants extras provocam abort antes de remover policies. ACL vazia e ausência de ACL representam igualmente nenhuma concessão adicional.

Nenhum default global, grant legado, FORCE RLS ou policy de produção foi retirado. As quatorze migrations históricas permaneceram intactas. As substitutas continuam fora da pasta de aplicação automática. Não executar `db push` na pasta histórica.

## Candidata congelada

Os nomes das três unidades continuam os gerados pelo CLI; elas nunca foram aplicadas remotamente. Os bytes28 completos foram preservados em [rollout-28-aprovado](evidencias/rollout-28-aprovado/). A recaptura31 foi feita em PostgreSQL17.6 descartável com o baseline corrigido, seguida de selo e verificação de hashes.

| Unidade | SHA256 vigente |
|---|---|
| A — foundation | `33e03729f9e058169844fc353cba083cb3d5fe270b98ea890dafd0fb0a87c40c` |
| B — expansion | `02810325f1eecc16dfc05121f44b75a64c5ce0655b9329f2662ffb0d74cbecaa` |
| C — scoped_cutover | `1114987e4108745492af6c3457ec6850a999ed16be79d815d001c4b156669a21` |

[Manifesto](../../packages/persistence/supabase/rollouts/v2/manifest.json): selado, 59 fontes de compatibilidade, `productionApproved=false`. Catálogo: [rollout-31-expansion-catalog.json](evidencias/rollout-31-expansion-catalog.json). O [verificador](evidencias/execucao-31-rollout-verify.json) passou. Qualquer mudança nesses bytes exige nova revisão correspondente.

## Verificações executadas

| Verificação | Resultado e limite |
|---|---|
| PostgreSQL17.6, duas conexões runtime | 33 verificações + seis aplicações locais = **39 PASS**; default real, permissões, coluna/view, imutabilidade, preflight, isolamento, concorrência e recuperação |
| Operação e manutenção | **21 PASS** com os hashes finais; captura manual/navegador/extensão, pareamento, revogação, bootstrap e CLIs |
| Suítes SQL | **21 PASS**; fixtures isoladas, incluindo diagnósticos históricos explicitamente separados |
| Web | **379 PASS**, após rerun fora do sandbox |
| Persistência, captura e extensão | Scripts de teste e typecheck passaram nos três pacotes; typecheck web passou |
| Build web | PASS local com Node22 e PASS do pacote copiado com **Node24.11.0**, mesma versão principal da Vercel |
| Pacote de fontes | Arquivo revisável, hashes de todos os arquivos, sem `.env`, credenciais, dependências instaladas ou outputs de build |

O runner amplo preserva sua falha web original. Diagnósticos diretos mostraram `uv_interface_addresses` bloqueado e stdout de subprocesso vazio no sandbox; o rerun autorizado fora do sandbox passou sem alterar código. O primeiro build Node24 no sandbox também falhou sem diagnóstico de worker; o rerun fora dele concluiu. Não se reescreveram resultados anteriores como verdes. A evidência consolidada distingue cada execução e o hash testado.

Fontes: [nativo](evidencias/execucao-31-replacement-native.json), [operacional](evidencias/execucao-31-operational-native.json), [runner amplo](evidencias/execucao-31-final-checks.json), [rerun web](evidencias/execucao-31-web-unsandboxed.log), [captura/extensão](evidencias/execucao-31-capture-extension-checks.json), [build Node24](evidencias/execucao-31-build-node24-unsandboxed.log) e [consolidação](evidencias/execucao-31-verificacao-final.json). Tentativas intermediárias e erros de teste estão preservados, identificados como tais.

## Pacote preparado para revisão e homologação

[Manifesto de fontes](evidencias/execucao-31-release-fontes.json) e arquivo `.tar.gz` indicado nele, salvo nesta pasta de evidências. É um **pacote de fontes**, não um deployment pré-compilado nem um commit publicado. Inclui aplicação, public/assets, persistência, captura, extensão, configurações/lockfiles e workflows; contém somente as três migrations já instaladas e as substitutas como artefatos de referência, sem aplicação automática das onze originais pendentes.

O build Node24 usou cópia isolada do pacote, sem arquivos `.env`, com URL fictícia não conectável, e dependências locais existentes ligadas à cópia. Não é comprovação de `npm ci` em infraestrutura limpa ou de serviços Supabase. A comparação dos dois manifestos confirma que a revisão final do pacote alterou apenas a instrução README e retirou um HTML temporário: os fontes de runtime são idênticos aos usados nesse build.

O tar contém as fontes de runtime e SQL de referência; não é o repositório completo nem um kit autônomo de regeneração/verificação do selo. A matriz e os três fragmentos de geração continuam disponíveis no repositório e no manifesto geral desta rodada. Executar `rollout:verify` na cópia completa do repositório, que também contém catálogo, ferramentas e originais históricos preservados.

## Impedimento concreto e retomada

`create_branch(name="bizuminer-v2-homologacao")` não criou recurso. O servidor Supabase respondeu que este cliente precisa obter custo por `get_cost`, receber concordância do usuário, chamar `confirm_cost` e enviar seu `confirmation_id`. **Essas duas ferramentas de custo não estão expostas nesta conexão.** Não há ID válido que possa ser inventado, nem autorização informada de um custo ainda não apresentado. Não é uma nova rejeição de segurança do Codex e não justifica trocar o transporte para contornar o requisito.

A ação externa necessária é disponibilizar um **projeto/branch Supabase de staging isolado**, aceitando no dashboard o custo informado pelo provedor, ou habilitar uma conexão que exponha as ferramentas de custo exigidas. Informar o project ref do staging e disponibilizar a conexão correspondente; credenciais devem ser configuradas por mecanismo seguro, sem colá-las no chat/documentos. Não criar outro projeto Vercel de produção nem promover o preview atual para compensar essa falta.

Após a identificação inequívoca do staging, executar sequencialmente:

1. Confirmar projeto diferente do ativo, catálogo/grants compatíveis, banco/pooler/Auth/Storage e callbacks próprios. Configurar variáveis exclusivas de preview e desligar envios, cobranças, jobs externos e credenciais de produção. Baseline reconstruído de teste não substitui catálogo/recuperação reais.
2. Obter e restaurar backup/snapshot autorizado do escopo BizuMiner em ambiente separado; verificar objetos privados e dependências sem copiar indiscriminadamente outros produtos ou dados pessoais.
3. Reproduzir S0/S1 com a versão publicada `43700c59`; aplicar A/B em transações integrais; conferir catálogo, monetização, login e captura. Novas escritas comerciais continuam bloqueadas.
4. Publicar o pacote compatível apenas no staging, atualizar os writers e provar S2. Conferir artefatos exatos, Auth/Storage, latência/locks, dados representativos e recuperação. Não disparar workflows atuais que apontem ao banco ativo.
5. Aplicar C no staging e provar S3, incluindo as jornadas T01–T18 e as provas originais do plano24/25; registrar NÃO EXECUTADO quando depender de gate comercial real. Encerrar instâncias/escritores legados antes de qualquer corte equivalente em produção.
6. Auditor independente libera os hashes e evidências de produção; só então executar expansão → publicação compatível/writers → corte, com os SELECTs e verificações funcionais entre etapas. Conservar dados/schema no rollback e nunca reinstalar policies globais permissivas.

## Prontidão por entrega do plano24

| Entrega | Estado atual | Critério de saída ainda necessário |
|---|---|---|
| E1 — candidata e baseline | CONDICIONAL | Banco/deployment identificados e pacote congelado; falta confirmar todos os escritores publicados e recuperação operacional |
| E2 — sequência revisada | CONCLUÍDA LOCALMENTE | A/B/C corrigidas e ensaiadas; revalidar hashes e baseline antes de homologar |
| E3 — staging/recuperação | BLOQUEADA | Recurso isolado e custo/acesso resolvidos; Auth/Storage/pooler e restauração conferidos |
| E4 — matriz completa | CONDICIONAL | Provas nativas aprovadas; faltam jornadas dos deployments e serviços reais em staging |
| E5 — promoção | CONDICIONAL | E3/E4 aprovadas e decisão técnica por hash; nenhuma promoção efetuada |
| E6 — encerramento técnico/comercial | NÃO CONCLUÍDA | Produção e writers verificados; fechamento dos 62 requisitos/13 épicos com evidência por ambiente; gates por capacidade |

O plano24, a aderência25 e os contratos C-01–C-09 continuam normativos. Operação própria e SaaS permanecem negócios permanentes sobre o mesmo motor. E3/preço, rubrica humana, relatório de comissões, direitos/fontes, canal oficial, experimentos e piloto continuam sujeitos aos respectivos gates; nenhuma aprovação, venda ou integração foi fabricada. Captura automática multicliente continua bloqueada sem resolução validada de credenciais por conta. Presença de código e resultados locais não equivalem a implantação concluída ou liberação comercial.
