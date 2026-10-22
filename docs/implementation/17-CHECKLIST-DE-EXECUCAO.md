# Checklist atualizado — correções CF-01–18

> Atualização 23: original 1 e dois complementos independentes aplicados; migration2 permanece reprovada para o ativo, demais originais pendentes condicionais. Reparos auditados e conferências em [relatório 23](23-CORRECOES-AUDITADAS-E-APLICACAO-SEGURA.md) e [parecer 22](22-AUDITORIA-INDEPENDENTE-MIGRATIONS.md). Estados locais abaixo não significam instalação remota completa.

15/10/2026. Substitui os estados do checklist recebido; sua cópia histórica permanece em `evidencias/revisao-18-recebido-17-CHECKLIST-DE-EXECUCAO.md`. Evidência atual: [relatório 19](19-IMPLEMENTACAO-E-CONFERENCIA-FINAL.md). “Local” não significa homologado.

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

| Entrega | Consumidor | Percurso implementado | Provas locais | Homologação/ativação pendente |
|---|---|---|---|---|
| D05/06 | /admin/curadoria; /admin/governanca | recordHumanRubricReviewAndComparison / runShadowRubricAssessmentAction / ratifyRubric / recordPriceCalibration | rubric, price-evidence, commercial, verified-workflows | G-PRICE/G-RUBRIC; IA real e amostra editorial |
| D07 | /admin/curadoria?aba=radar | política→oportunidade→prioridade humana; monitoring-candidates/monitoring-priority compartilham fila | opportunity, cockpit, persistence, verified-workflows | calibração/audiência aprovada e captura real em R13 |
| D08 | /admin/campanhas | reviseKit/validate/approve→private asset→PNG→download→export→confirmar publicação | commercial, cockpit, verified-workflows; execucao-19-story.png | direitos comerciais por imagem e percurso browser/Storage |
| D09 | /admin/financeiro | arquivo privado→parser interno v2→preview→seleção/resolução→commit→ledger/custos/receita SaaS | financial, verified-workflows, cf-regressions | G-FIN para parser de fornecedor e primeira venda real |
| D10 | /admin/experimentos; /admin/financeiro | draft→aprovar método→pares→aprovar candidata sem ativar→review→promote→rollback; export CSV | experiment, financial | G-EXPERIMENT para decisões reais; sem inferência causal |
| D11 | painel /admin; bin/run-dispatch.mts | agenda/reserva→claim commit→preflight→marker commit→I/O fora de SQL→finalize/reconciliar | dispatch, entitlement, verified-workflows; dispatch-help.log | G-CHANNEL/G-PROGRAM; concorrência/crash/pooler real em R13 |
| D12 | /plataforma; /convite; /admin/onboarding; /admin?aba=afiliados | platform provision/owner invitation→aceite→conta própria→fatos das etapas→suspensão/reativação/export | onboarding, verified-workflows, entitlement | G-PILOT/G-PRIVACY/G-SEC; usuários/convites externos não ativados |
