# Implementação corretiva e conferência final — rodada 19

15/10/2026, America/Sao_Paulo. Base: plano 17, achados da verificação 18 e pedido de concluir a implementação com checagens. Skill utilizada: `codex-executor`, com orientações Supabase/Postgres e checklist React.

**Resultado: núcleo local das correções implementado e integrado, candidato à homologação isolada. R13 está bloqueada por ambiente/alvo/autorização ausentes. Não há liberação de produção, piloto externo, E3 ou canal automático neste relatório.** O mesmo motor e os mesmos contratos atendem casa e SaaS; as configurações, direitos, evidências e resultados continuam separados por conta.

A árvore já continha extensa implementação não commitada. HEAD `43700c59f4e24f68f3a2e32c20ee5147fa4816cd` é somente o ponto Git de referência; o manifesto identifica os arquivos desta candidata. Nenhum commit/reset/deploy foi executado. Alterações preexistentes foram preservadas.

## 1. O que foi corrigido

O escopo de conta agora acompanha páginas/actions/APIs privadas, inclusive leitores e comandos legados, usando AsyncLocalStorage por requisição e revalidação no início das transações. A seleção persistida só aceita membership ativa. `withTenantDb` não pode trocar a conta de uma requisição autenticada. O fluxo antigo da casa permanece acessível ao seu operador autorizado. O gatilho de workflow de captura exclusivo da casa exige seu owner; não se transforma em captura SaaS por um tenant enviado pelo cliente. Rotas de dispositivo e projeções públicas mantêm suas autorizações próprias.

A revisão humana v2 possui persistência real, idempotência de conteúdo, autoria global com membership e snapshot/digest factual. Ela reabre no consumidor v2; o leitor v1 não interpreta esse payload como dimensões antigas nem transforma avaliação em publicação. A comparação em sombra recarrega fatos e vincula a avaliação humana/IA compatível; não promove rubrica automaticamente. Ratificação usa produtos distintos e versão exata, com decisão humana imutável e método explícito. E3 depende de calibração persistida sobre observações da conta e relatório privado; política antiga aprovada sem EXP-02 compatível recebe E3 desativado na view efetiva e nos consumidores TS/SQL.

O radar cria política e oportunidade contextual, usa a revisão/fatos atuais e alimenta a fila de monitoramento compartilhada. O cockpit permite imagem privada com declaração de direitos, revisão imutável, validação/aprovação, PNG 1080×1920, download e registro de exportação separado da confirmação de publicação. O download revalida revisão, fatos e autorização; não busca um preço novo para reescrever a arte congelada.

A importação salva o original privado, apresenta linhas/rejeições/revisões, usa seleção explícita e resolução humana de identidade/revisão quando necessária. Seleção vazia importa zero. Identidades financeiras são tuplas versionadas e distinguem conversão/obrigação/evento/revisão; quatro ajustes sucessivos no mesmo estado conservam o encadeamento. Fonte desconhecida não vira atribuição de campanha por aproximação ou subID não verificado. Ledger/custos e receita SaaS permanecem separados.

Experimentos começam draft, exigem método antes de medir, fatos congelados por assignment, outputs baseline/candidate válidos, contagem por pares, revisão e candidata existente aprovada. Aprovar a candidata não altera a política ativa; promover e reverter validam o ponteiro e gravam evento atomicamente. Dados históricos unilaterais não passam a representar pares completos.

O worker possui transações curtas de claim/preflight/marcador/finalização e executa transporte fora delas. Quotas/reservas/switch são persistidos. Modo assistido, credencial revogada, link inválido, revisão superada, conta suspensa ou plano vencido não autorizam I/O. A credencial é conferida novamente na transação final antes do marcador. Cancelamento, lease vencido, crash e timeout preservam incerteza; `unknown` exige reconciliação. Reconciliação comprovada atualiza job, publicação e reserva na mesma transação. A action operacional não utiliza mais adapter que inventa sucesso. O CLI aceita inspeção explícita e exige módulo de provedor revisado e aprovação correspondente para executar; a integração oficial depende de G-CHANNEL.

O convite usa e-mail confirmado da sessão, permite pessoa em várias contas e concede somente o papel do convite. `/plataforma` oferece provisionamento/estado sem exigir membership de cliente ativo; piloto exige termos, limites e fim de vigência explícitos. `/convite` e `/admin/onboarding` conduzem o ingresso e as sete etapas derivadas de fatos. Teste de link documentado é declaração humana rastreada, não confirmação de atribuição pelo marketplace. Suspensão/reativação revalidam papel de plataforma. Export da conta inclui registros comerciais e manifesto de artefatos sem segredos/tokens; bytes continuam em download privado. Upload interrompido só é recuperado após conferir tamanho e hash do objeto existente.

## 2. Matriz CF-01–18

“Corrigido localmente” encerra o defeito reproduzido no ambiente isolado; não certifica o mesmo fluxo no deployment. Os controles que já estavam corretos foram preservados e reexecutados. Não se declara equivalência de concorrência entre PGlite e PostgreSQL multi-sessão.

| CF | Entrega | Estado da correção | Implementação e limite | Prova local |
|---|---|---|---|---|
| CF-01 | R02 | CORRIGIDO LOCALMENTE | Policy sem contexto continua negando convites e planos; bootstrap limitado ao token válido. | cf-regressions, onboarding, entitlement |
| CF-02 | R01 | CORRIGIDO LOCALMENTE | Conta validada na entrada, escopo por requisição e revalidação em cada transação; defaults privados herdam conta autorizada. Trigger GitHub da casa exige owner da casa. | verified-workflows, commercial, regressions; inventário de entradas |
| CF-03 | R01 | CORRIGIDO LOCALMENTE | Captura mantém ator de dispositivo, revalida dispositivo/membership/role/conta e usa factory injetada. | cf-regressions, capture-batch, regressions; extension |
| CF-04 | R04 | CORRIGIDO LOCALMENTE | Humano v2 persiste sem IA, reabre pelo leitor v2; leitor editorial v1 filtra v2 e preserva avaliações/publicação antigas. | verified-workflows, rubric, verified-upgrade |
| CF-05 | R04 | CORRIGIDO LOCALMENTE | Autoria é pessoa global com membership ativa na conta; payload factual e comparação compatível são conferidos no servidor. | verified-workflows, rubric, cf-regressions |
| CF-06 | R05 | CORRIGIDO LOCALMENTE | Replay não amplia amostra; unidades distintas por versão; ratificação humana congela método/evidências. E3 exige EXP-02 válido, não sintético, vinculado à configuração. | verified-workflows, price-evidence, commercial, rubric |
| CF-07 | R09 | CORRIGIDO LOCALMENTE | Draft, método prévio, assignment com fatos congelados, pares elegíveis, revisão e candidata aprovada precedem promoção; rollback verifica ponteiro. | experiment |
| CF-08 | R08 | CORRIGIDO LOCALMENTE | Revisão financeira é evento distinto e encadeado; quatro revisões sucessivas, inclusive no mesmo estado, preservam predecessor. | verified-workflows, financial |
| CF-09 | R08 | CORRIGIDO LOCALMENTE | Identidades são tuplas estruturais versionadas; case/null/segmentos não colidem; ambiguidade histórica exige revisão. | cf-regressions, financial, verified-workflows |
| CF-10 | R08 | CORRIGIDO LOCALMENTE | Conversão mantém identidade entre lotes sobrepostos; commit confere fatos atuais, seleção e digest, conta inserts reais. | financial, cf-regressions, verified-workflows |
| CF-11 | R10 | CORRIGIDO LOCALMENTE | Worker usa fatos/links reais da conta, revalida segredo na transação final, entitlement/modo/revisão, quota e switch; nenhum adapter fictício na action operacional. | dispatch, verified-workflows, entitlement; transporte real bloqueado por G-CHANNEL |
| CF-12 | R10 | CORRIGIDO LOCALMENTE | Cancelamento e marcador condicionados por lock/token/lease; marker é confirmado antes do transporte; incerteza vira unknown, sem retry cego. | dispatch, verified-workflows; duas conexões independentes em R13 |
| CF-13 | R02 | CORRIGIDO LOCALMENTE | Aceite recebe identidade/e-mail confirmado da sessão no servidor; não exige membership prévia; e-mail digitado não autoriza. | verified-workflows, onboarding |
| CF-14 | R00/R02 | CORRIGIDO LOCALMENTE | Fixture aplica privilégios observados por tabela; app_user_role SELECT-only; convite usa rotina de concessão restrita. | baseline-grants.json, cf-regressions, onboarding |
| CF-15 | R03 | CORRIGIDO LOCALMENTE | Suspensão/reativação revalidam administrador e identidade; contexto de ator é definido antes da consulta; worker respeita vigência/suspensão. | verified-workflows, onboarding, entitlement |
| CF-16 | R11 | CORRIGIDO LOCALMENTE | Etapas derivam de configuração própria, teste documentado, política/campanha/kit/publicação existentes. Referência inventada não conclui etapa; revogação invalida fatos. | verified-workflows, onboarding |
| CF-17 | R04–R11 | INTEGRADO LOCALMENTE; R13 PENDENTE | Sete integrações possuem consumidor implementado, serviço e provas SQL locais. Browser autenticado com Storage/pooler reais ainda não homologado. | matriz de jornadas abaixo; R13 obrigatório |
| CF-18 | R14 | CORRIGIDO LOCALMENTE | Status, checklist, índice, checkpoint e matrizes reconciliados; provas históricas preservadas e limites separados por ambiente. | relatório 19, manifesto e checks finais |

## 3. Integrações de CF-17

| Entrega | Consumidor | Percurso implementado | Provas locais | Homologação/ativação pendente |
|---|---|---|---|---|
| D05/06 | /admin/curadoria; /admin/governanca | recordHumanRubricReviewAndComparison / runShadowRubricAssessmentAction / ratifyRubric / recordPriceCalibration | rubric, price-evidence, commercial, verified-workflows | G-PRICE/G-RUBRIC; IA real e amostra editorial |
| D07 | /admin/curadoria?aba=radar | política→oportunidade→prioridade humana; monitoring-candidates/monitoring-priority compartilham fila | opportunity, cockpit, persistence, verified-workflows | calibração/audiência aprovada e captura real em R13 |
| D08 | /admin/campanhas | reviseKit/validate/approve→private asset→PNG→download→export→confirmar publicação | commercial, cockpit, verified-workflows; execucao-19-story.png | direitos comerciais por imagem e percurso browser/Storage |
| D09 | /admin/financeiro | arquivo privado→parser interno v2→preview→seleção/resolução→commit→ledger/custos/receita SaaS | financial, verified-workflows, cf-regressions | G-FIN para parser de fornecedor e primeira venda real |
| D10 | /admin/experimentos; /admin/financeiro | draft→aprovar método→pares→aprovar candidata sem ativar→review→promote→rollback; export CSV | experiment, financial | G-EXPERIMENT para decisões reais; sem inferência causal |
| D11 | painel /admin; bin/run-dispatch.mts | agenda/reserva→claim commit→preflight→marker commit→I/O fora de SQL→finalize/reconciliar | dispatch, entitlement, verified-workflows; dispatch-help.log | G-CHANNEL/G-PROGRAM; concorrência/crash/pooler real em R13 |
| D12 | /plataforma; /convite; /admin/onboarding; /admin?aba=afiliados | platform provision/owner invitation→aceite→conta própria→fatos das etapas→suspensão/reativação/export | onboarding, verified-workflows, entitlement | G-PILOT/G-PRIVACY/G-SEC; usuários/convites externos não ativados |

Os consumidores de interface foram conectados e passaram por compilação/tipagem e revisão estática. As provas de persistência usam os serviços reais e SQL/RLS isolados. **Não foi executado o percurso completo de browser autenticado → Supabase Auth → actions → Storage privado real → pooler → UI.** Isso é aceite obrigatório de R13 e mantém CF-17 condicionado à homologação, sem esconder desenvolvimento local atrás desse gate.

## 4. Entregas e épicos

| R | Resultado | Estado | Saída/condição |
|---|---|---|---|
| R00 | Baseline/fixture | CONCLUÍDA LOCALMENTE | Metadados/grants observados, fixture sem GRANT ALL substitutivo. |
| R01 | Conta/dispositivo | CONCLUÍDA LOCALMENTE | Contexto por requisição e transação; casa/A/B e captura preservadas. |
| R02 | Convite/plataforma | CONCLUÍDA LOCALMENTE | Sessão verificada, bootstrap atômico, sem grants genéricos de roles. |
| R03 | Suspensão/quotas | CONCLUÍDA LOCALMENTE | Reativação e enforcement; planos de piloto têm vigência e quotas explícitas. |
| R04 | Revisão humana | CONCLUÍDA LOCALMENTE | Persistência/reabertura v2, legado v1 preservado, autoria e digest. |
| R05 | Ratificação/calibração | NÚCLEO LOCAL CONCLUÍDO; CONDICIONAL | G-RUBRIC/G-PRICE para homologação das evidências reais. |
| R06 | Radar/monitoramento | CONCLUÍDA LOCALMENTE | Políticas e fila contextual por conta/audiência/canal. |
| R07 | Cockpit/material | NÚCLEO LOCAL CONCLUÍDO; CONDICIONAL | PNG privado e fonte própria/licenciada; G-RIGHTS por material. |
| R08 | Financeiro/importação | NÚCLEO LOCAL CONCLUÍDO; CONDICIONAL | Parser interno v2 e revisão humana; G-FIN para fornecedor. |
| R09 | Experimentos | NÚCLEO LOCAL CONCLUÍDO; CONDICIONAL | Protocolo protegido; G-EXPERIMENT para promoção real. |
| R10 | Dispatch | NÚCLEO LOCAL CONCLUÍDO; CONDICIONAL | Sem envio simulado; adapter oficial e duas sessões dependem de gates. |
| R11 | Onboarding/saída | NÚCLEO LOCAL CONCLUÍDO; CONDICIONAL | UI e fatos, export privado; G-PILOT/PRIVACY/SEC para cliente real. |
| R12 | Auditoria local | CONCLUÍDA LOCALMENTE | Contratos/callers/migrations/diff e regressões examinados; limites explícitos. |
| R13 | Homologação isolada | BLOQUEADA | Falta projeto/branch de staging identificado e autorização de escrita. MCP autenticado não identifica staging. |
| R14 | Registro final | CONCLUÍDO NO ESCOPO LOCAL | Homologação e ativação permanecem abertas; sem confundir conclusão de código com operação. |

| D original | Épico | Correção | Resultado | Estado |
|---|---|---|---|---|
| D00 | EP-00 | R00/R12/R14 | Baseline, provas, migrações e rastreabilidade | IMPLEMENTADO LOCALMENTE; GATES CONFORME RELATÓRIO |
| D01 | EP-10A | R01 | Fronteiras de conta privadas | IMPLEMENTADO LOCALMENTE; GATES CONFORME RELATÓRIO |
| D02 | EP-10A | R01 | Extensão e revogação | IMPLEMENTADO LOCALMENTE; GATES CONFORME RELATÓRIO |
| D03 | EP-08B/11/12 | R02/R08/R10/R11 | Contratos estritos/parser/guards | IMPLEMENTADO LOCALMENTE; GATES CONFORME RELATÓRIO |
| D04 | EP-12-base/10 | R03 | Entitlements, suspensão e quotas | IMPLEMENTADO LOCALMENTE; GATES CONFORME RELATÓRIO |
| D05 | EP-01/05C | R05 | Evidência canônica/E3 | IMPLEMENTADO LOCALMENTE; GATES CONFORME RELATÓRIO |
| D06 | EP-02 | R04/R05 | Humano/IA em sombra/ratificação | IMPLEMENTADO LOCALMENTE; GATES CONFORME RELATÓRIO |
| D07 | EP-03 | R06 | Política, radar e monitoramento | IMPLEMENTADO LOCALMENTE; GATES CONFORME RELATÓRIO |
| D08 | EP-04/05/06/07 | R07 | Campanha, kit, material e links | IMPLEMENTADO LOCALMENTE; GATES CONFORME RELATÓRIO |
| D09 | EP-08A/B/C | R08 | Ledger, custos, receita SaaS/importação | IMPLEMENTADO LOCALMENTE; GATES CONFORME RELATÓRIO |
| D10 | EP-09 | R09 | Resultados e experimentos | IMPLEMENTADO LOCALMENTE; GATES CONFORME RELATÓRIO |
| D11 | EP-11 | R10 | Agenda e worker/reconciliação | IMPLEMENTADO LOCALMENTE; GATES CONFORME RELATÓRIO |
| D12 | EP-12 | R11 | Onboarding/convite/plataforma/saída | IMPLEMENTADO LOCALMENTE; GATES CONFORME RELATÓRIO |
| D13 | EP-10B | R12/R13 | Segurança local; homologação externa pendente | SEGURANÇA LOCAL VERIFICADA; R13 BLOQUEADA |
| D14 | EP-00/10B/todos | R14 | Fechamento de evidências | IMPLEMENTADO LOCALMENTE; GATES CONFORME RELATÓRIO |

Os treze épicos mantêm sua definição original nas specs. EP-00 e o núcleo de EP-01–10 foram implementados nas rodadas acumuladas, com os reparos acima; EP-10B possui segurança local testada e validação externa pendente. EP-11 possui orquestração/agenda/controles locais, sem adapter oficial habilitado. EP-12 possui infraestrutura e jornada preparada, sem piloto comercial autorizado. Parser específico EP-08B continua condicionado ao arquivo real; não é substituído pelo CSV interno. Matching destrutivo entre lojas, billing automático e vídeo IA não fazem parte da ativação inicial definida nas specs.

## 5. Checagens e evidências

- Bateria reproduzível: `python3 docs/implementation/evidencias/execucao-19-checks.py`. Quatro suítes unitárias (557 testes), quatro typechecks, dezessete suítes SQL e build web. O resultado final de cada comando e eventuais reexecuções está em `evidencias/execucao-19-checks.json`; os logs citados são a fonte do resultado, não contagem como substituto do aceite.
- `test:verified-workflows`: contraexemplos corrigidos em jornadas positivas/negativas, com armazenamento/transporte sintéticos, SQL real em memória, imagem, direitos, quatro revisões financeiras, convite entre contas, ratificação, calibração, marker confirmado antes do transporte, revogação entre validação e marker, upload interrompido e export privado. Resultados: `execucao-19-verified-workflows.json`.
- `test:verified-upgrade`: compatibilidade do operador autorizado no baseline anterior à V2 e upgrade 11→12 sobre avaliações v1, ledger com chave legada e experimento sem assignment; valores históricos preservados. Resultado: `execucao-19-upgrade.json`.
- Permissões de baseline: consulta somente leitura ao projeto já conectado, exclusivamente metadados de privilégios. `execucao-19-baseline-grants.json` registra 104 grants; fixture reproduz privilégios por tabela e nega escrita ampla em app_user_role.
- `execucao-19-story.png` inspecionado visualmente: resolução 1080×1920, preço/disclosure/acentos/contraste/QR e material sintético próprio. Esse arquivo não comprova licença de imagem comercial nem resultado de campanha.
- Ajuda do CLI sem banco/provedor: `execucao-19-dispatch-help.log`.
- `manifesto-execucao-19.json` contém hashes antes/depois e alterações desta rodada; `execucao-19-migrations.json` identifica ordem e hashes. Relatórios 16/18 e seus contraexemplos permanecem históricos; assertions diagnósticas de defeito não foram renomeadas como testes corretivos verdes.

Processos de teste removeram variáveis de banco/Supabase/IA; quando necessária, DATABASE_URL aponta a localhost:1 não conectável e a factory isolada é injetada. Nenhuma API de IA/canal, compra, convite externo ou cobrança foi executada. Advertência Node sobre módulos TypeScript sem package type explícito aparece nos unitários, sem falha; não foi alterada a configuração de módulos global para eliminar aviso cosmético.

## 6. Banco, compatibilidade e recuperação

Foi criada localmente a expansão `20261015021300_garimpa_verified_workflows.sql`, posterior às onze migrations V2 já existentes. Nenhuma dessas onze foi reescrita nesta rodada. Novas estruturas: decisão de governança, calibração com snapshot, artefato privado, controle/reserva de dispatch; chaves de revisão/commit; protocolo experimental; grants de atualização limitados; view de política efetiva que protege E3. FKs carregam tenant e novas tabelas têm isolamento e conta ativa. Aprovação de candidata altera somente colunas de aprovação, por owner; configuração permanece imutável por grants.

A expansão preserva comparações repetidas históricas: `canonical_write=false` nas antigas, `true` nas novas, índice único limitado às novas. Não apaga labels para instalar um índice. A FK de medições/assignment é NOT VALID para preservar medições antigas sem assignment; novos inserts são verificados. Elas continuam inelegíveis para a amostra pareada. Nenhum backfill inventa identidade financeira ou autor: ambiguidades e lotes antigos sem digest exigem revisão, em vez de reimportação cega. Aprovação E3 antiga não é alterada silenciosamente; nova versão calibrada deve substituir a anterior quando homologada.

A migration cria o bucket privado somente se Storage existir e falha se o bucket de mesmo nome for público. O adapter também confere essa propriedade em cada leitura/escrita. PGlite não possui o serviço Storage: o comportamento de bucket real ainda exige R13. Tokens e ciphertext não são retornados em exports.

Procedimento de staging: seguir `19-HOMOLOGACAO-E-RECUPERACAO.md`; não executar `db push` no projeto conectado por suposição. Validar baseline e grants, aplicar os arquivos em ordem numa branch/projeto isolado autorizado, conferir catálogo/RLS e executar jornadas. Usar lock/statement timeout controlados pelo operador e medir os índices sobre volume representativo; ensaio em memória não mede locks/latência de produção.

Recuperação conserva schema aditivo e dados: desligar automação/switch, retirar exposição das capacidades novas e retornar a código compatível com as colunas antigas. Não reativar o adapter fictício, grants permissivos ou fluxo privado fixo na casa. Não remover ledger, objetos ou revisões para “voltar”. Jobs com marcador continuam unknown até reconciliação; arquivos pending/orphaned não viram ready sem integridade. Restauração de backup é contingência de ambiente autorizado, não rollback automático destrutivo. Produção permanece no seu estado remoto anterior; nenhuma migration desta série foi aplicada remotamente por esta rodada.

## 7. Impedimentos externos e saída

| Gate | Falta concreta | Condição de liberação |
|---|---|---|
| G-ENV / R13 | Staging isolado identificado, baseline compatível e autorização de escrita | Revalidar alvo por MCP; aplicar e conferir somente nele; browser/Auth/Storage/pooler e duas sessões com crash/recuperação |
| G-SEC | Relatório da versão exata em runtime real, incluindo A/B/casa/Storage/exports/dispositivos | R13 e reauditoria de isolamento antes de cliente externo |
| G-PRICE / OPEN-03 | EXP-02 editorial real, dez casos e configuração calibrada | Registrar relatório privado, casos observados e aprovação da versão; fixtures não liberam E3 |
| G-RUBRIC / OPEN-01/02 | 30–50 avaliações humanas reais e método/coorte aprovados | Ratificação explícita, não volume de replay; IA real validada em sombra |
| G-FIN / OPEN-05 | Relatório sanitizado da primeira venda com semântica documental do fornecedor | Parser específico e teste de ajustes/idempotência/atribuição; manual e CSV interno já disponíveis |
| G-RIGHTS / OPEN-08 | Permissão/licença por imagem/canal/prazo | Evidência do responsável da conta; URL de produto não vale licença |
| G-PROGRAM / OPEN-09 | Capabilities/termos/credenciais e atribuição de cada programa | Teste autorizado de link próprio e fonte oficial vigente |
| G-CHANNEL / OPEN-04/06 | Primeiro canal, adapter oficial, destino controlado e autorização de envio | Homologar transporte, limites, deadline/reconciliação; WhatsApp mantém assistido |
| G-EXPERIMENT | Método, coorte, dados e limiar aprovados para uso real | Medir pares reais e revisão humana; sem alegação causal baseada em fixture |
| G-PILOT / OPEN-07 | Termos, preço/condição, duração, quotas, suporte e cliente autorizado | Plano versionado/vigência explícita e G-SEC/PRIVACY concluídos |
| G-PRIVACY | Política de retenção/uso/saída e dados pessoais autorizados | Aprovação antes de abrir SaaS ou importar dados pessoais desnecessários; não inventar expurgo |

Não há aprovação comercial presumida. Para a próxima etapa não é necessário redesenhar o núcleo: confirmar o manifesto, revalidar os contratos contra o ambiente atualizado e cumprir o roteiro de homologação. Mudança material de schema, contrato de fornecedor/canal ou decisão de negócio reabre somente a parte afetada.

## 8. Cobertura T/S/J e auditoria cruzada

Esta tabela delimita a prova local e o que precisa ser repetido no runtime. Não afirma que a bateria inteira de homologação foi executada.

| Caso | Prova local disponível | Condição/limite |
|---|---|---|
| T01 ticket alto/nicho | Unitários rubric/opportunity e radar SQL | Escolha real de política/audiência em G-RUBRIC/R13 |
| T02 ticket baixo | Unitários de classificação/valor e benchmark | Rubrica real ratificada ainda pendente |
| T03 preço histórico/decisão | Snapshot/revisão e preservação em commercial/upgrade | Comparar operação real da casa em R13 |
| T04 poucos reviews | Contratos/benchmark rubric com confiança explícita | Labels humanas reais em G-RUBRIC |
| T05 marca desconhecida | Rubric/opportunity e benchmark contextual | Não certifica recomendação de produto real |
| T06 desconto/reputação | Price/rubric/kit-validator | Alegação só com fonte/evidência válida |
| T07 variantes/moedas | canonical-price-evidence, triage-price e configuração canônica | Cobertura de fonte real depende G-PROGRAM/EVIDENCE |
| T08 gaps/cobertura | canonical-price-evidence, commercial e projeção conservadora | EXP-02 real para E3 |
| T09 valor/preço estável | Rubric/opportunity | Sem urgência automática; calibração editorial pendente |
| T10 mudança após aprovação | Commercial/cockpit/verified-workflows, validação antes/depois de render | Repetir alteração concorrente no browser/pooler |
| T11 link/credencial | Commercial/dispatch e revogação antes do marcador | Credencial/link oficial controlado em G-PROGRAM/R13 |
| T12 urgência inventada | Kit-validator e assertions de claims/validade | IA real em sombra não foi chamada |
| T13 export sem postagem | Commercial/cockpit e fluxo assistido | Download/browser e confirmação real em R13 |
| T14 dois canais | Commercial/campaign-attribution/short-link | Canais reais e telemetria do deployment em R13 |
| T15 venda sem origem | Financial/commercial e verified-workflows | Nenhuma venda real fabricada; G-FIN |
| T16 CSV/revisão/replay | Financial/verified-workflows/CF | Corrida de duas sessões e relatório fornecedor em R13/G-FIN |
| T17 isolamento | Contexto A/B/casa, SQL/RLS, device, convite e artefatos por adapter | Auth/Storage/pooler/URL reais e duas sessões ainda bloqueados |
| T18 continuidade | Unitários quatro pacotes, SQL legado/publicação/links e upgrade | Smoke do deployment e callbacks reais ainda não executados |

| Suíte/jornada | Resultado local | Parte não homologada |
|---|---|---|
| S-PRECO | Motor TS/SQL conservador e equivalência/gaps testados | Fontes e calibração reais |
| S-RUBRICA | Persistência, replay, versão, amostra distinta e ratificação testados | 30–50 labels reais e IA em runtime |
| S-KIT | Revisionamento, revalidação, arquivo privado e PNG inspecionado | Browser/Storage real, licenças comerciais e corrida multi-sessão |
| S-LINK | Projeção pública, código/slug/origem/preview e links legados testados | Provedores e deployment autorizado |
| S-DB | SQL/RLS com grants observados, baseline e upgrade 11→12 | PostgreSQL/pooler independente, volume, locks e restauração |
| S-FIN | Manual/CSV interno, seleção, identidade, quatro revisões e origem desconhecida | Relatório fornecedor e commit concorrente real |
| S-DISPATCH | Claim/marker/transport separados, cancelamento, revogação e incerteza testados | Adapter oficial, duas sessões, interrupção de processo/rede real |
| J1 | Serviços comerciais/financeiros e consumidores conectados | Percurso contínuo browser/Auth/Storage/pooler |
| J2 | Isolamento e ciclo de conta sintéticos; plataforma/convite/onboarding/export | Duas contas externas em runtime; piloto não autorizado |
| J3 | Preservação e continuidade por fixtures/contratos/upgrade | Smoke de produção exige rodada/alvo/autorização próprios |

Auditoria cruzada efetuada: revisão v2 não é consumida como v1 nem publica automaticamente; radar e kit compartilham fatos/preço; seleção de importação é explícita; revisão financeira não depende de batch/linha como identidade global; experimento não promove candidata inexistente ou sem aprovação; worker não envolve transporte numa transação aberta e não usa o adapter operacional fictício; convite não usa tenant/e-mail do cliente como autoridade; etapas de onboarding não aceitam referência livre; privilégios mínimos e tenant composto permanecem. A migration aditiva preserva dados antigos, inclusive comparações repetidas e medições unilaterais. Aprovação comercial, integração oficial e uso externo continuam nos gates da seção 7.

`git diff --check` dos arquivos rastreados alterados nesta rodada passou. O diff total tem três avisos de linha vazia final em arquivos preexistentes (`monitoring-policy.test.ts`, `globals.css`, `offer-history.ts`), cujos hashes são iguais ao inventário inicial; foram preservados. Registro em `evidencias/execucao-19-final-audit.json`. Esses avisos não foram ocultados nem usados para mudar arquivos fora da correção.
