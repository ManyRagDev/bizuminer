# Auditoria arquitetural cruzada

Revisão integral do conjunto realizada em 14/10/2026 pelo mesmo agente após a redação das 13 specs. Não houve revisão independente por outro agente. Resultado: conjunto reconciliado para execução incremental; gates externos e limitações de runtime permanecem explícitos. Isso não certifica implementação ou segurança de produção.

## Achados de revisão e correções incorporadas

| ID | Inconsistência ou risco procurado | Decisão/correção final | Verificação de planejamento |
|---|---|---|---|
| AX-01 | Blueprint manda apenas um épico; pedido manda planejamento integral | Pedido atual prevalece, fonte preservada sem edição | 13 arquivos EP-00…12, cada um com formato da skill |
| AX-02 | Lowest false em web mas true em outras superfícies | EP-01 dono da fonte canônica; inclui view, membro, populares/composer e gráfico, não só helper | E-03 + C-02 + S-PRECO cobrem os consumidores encontrados |
| AX-03 | E3 definido como 3 obs/7 dias sem base estatística | Política de cobertura versionada; E3 off até G-PRICE | Nenhum executor precisa escolher threshold silenciosamente |
| AX-04 | Rubrica IA nova forçaria humano fictício em editorial_assessment | analysis_assessment separada, payload v2 comum; humano existente preservado | M-02 e C-03 usam autoria real |
| AX-05 | Oportunidade precisava de eventos antes do schema de campanha | domain_event nasce em M-03; M-04 reutiliza e acrescenta tipos | Corrigida ordem no registro de migrations e C-05 |
| AX-06 | EP-02 dependeria de FK de política criada por EP-03 | rubric_version textual em 02, policy 03 referencia versão aprovada | 02 não exige estruturas futuras para modo sombra |
| AX-07 | EP-06 precisa de link, mas EP-07 dependia de kit | Reserva/resolução básica do link em 04-C; 07 acrescenta atribuição/export/confirmação | DAG sem 06↔07; 04 entrega link funcional |
| AX-08 | Kit/publicação/link poderiam exigir FKs circulares no INSERT | Criar kit/revisão draft→publication planned→link→nova revisão materials; vínculo de revisão validado | 04-C e complemento de C-04/05/06 |
| AX-09 | Editar kit retargetaria versão já exportada | Após export, nova publication/link para nova revisão; confirmed imutável | T10/T13, histórico e links antigos preservados |
| AX-10 | Segurança adiada até depois dos objetos privados | 10A antes de novas escritas; policies scoped em cada migration; 10B certifica superfície final | 10A/10B na ordem sem ciclo com 04 |
| AX-11 | Copiar helper atual não garante contexto SQL | sql.begin real + handle tx; sem contexto nega; A/B/A no pooler | S-DB multi-conexão, não só PGlite/postgres |
| AX-12 | Migration gated local quebraria relações sem tenant e manteria policies amplas | Nova migration por família de tabela; remover permissivas sobrepostas | Inventário policies/constraints + M-10A2 |
| AX-13 | Uma pessoa em várias contas conflita com unique auth_user e FK de ator-tenant | Pessoa única, membership autoriza; autoria por membership, legado preservado | 10-A1/J2; revoked_at em membership evita apagar ator histórico |
| AX-14 | Resolver público receberia conta e poderia ler privado | Role pública sem grants privados; funções estreitas e projeção explícita | C-01 funções/roles definidas, T17 de argumentos adulterados |
| AX-15 | Slug global igual em duas contas e /go parser legado fixo | External webSlug com public_slug da conta, resolver por publication; writers de ingestão/extensão/links incluídos | 04-C/07-B e S-LINK, 4 caracteres legado vs 12 novo |
| AX-16 | Kanban, publication web e social duplicariam o mesmo estado | Marketing mantém planejamento; social ledger único C-05; referência opcional sem sync automática | T13, zero backfill de postagem sem evidência |
| AX-17 | Dedup 20h perde variante nova com mesmo preço | 01-A considera digest material; conserva idempotência run/device; não finge multi-SKU/run | S-PRECO, C-02 explicita fronteira |
| AX-18 | Snapshot por FK apenas pode mudar em upsert/cleanup | Fatos/digest copiados em revisão e proteção RESTRICT/retenção em 04 | Teste de purge e atualização mesmo run em S-KIT/04-C |
| AX-19 | EP-05 dependia de telas financeiras e kit ainda inexistentes | V1 integra campanha/draft e “não monitorado”; módulos 06/08/09 ampliam via contratos | Nenhum botão simulado; 05 entrega jornada útil sem aguardar tudo |
| AX-20 | Importação repetida ou estados financeiros gerariam receita duplicada | Chave por fato/revisão, ledger e projeção por obrigação; arquivo reordenado testado | T16/S-FIN; recebimento e estorno separados |
| AX-21 | Retry social após timeout poderia duplicar postagem | Unknown + reconciliação; retry só falha segura; leases e token de finalização | S-DISPATCH, sem garantia fictícia de exactly-once |
| AX-22 | Casa tratada como exceção estrutural; catálogo global vazaria dados | AccountContext comum, default privado e porta de fatos autorizados com lineage | J1/J2, sem duplicar motor e sem transferir dados privados |
| AX-23 | Financeiro do blueprint omitiria custos e receita SaaS | operational_cost/usage com fonte e custo desconhecido; revisão 1.1 separa saas_revenue_entry de custos | 08-C/09-A/12-C, REQ-MKT-03; ver AX-28 |
| AX-24 | Planejamento decidiria unilateralmente canal, preço, rights ou rubrica | Gates G-CHANNEL/PILOT/RIGHTS/RUBRIC explícitos e status adequados | 07-PRONTIDAO, resposta futura muda somente partes condicionadas |
| AX-25 | Rollback desligaria links já distribuídos ou restauraria claims/permissões inseguros | Resolução compatível permanece; segurança/guardas não retrocedem; suspender externo quando necessário | 04-EVOLUCAO e S-LINK/J3 |
| AX-26 | Ordem inicial fazia a contenção de claim falso esperar a migração estrutural 10A | Entrega 01-0 sem DDL e sem acesso externo após 00; 01-A/B mantém dependência de 10A | ADR-15; supressão também em ranking/filtros, view só corrigida depois |
| AX-27 | Sequência linear sugeria exigir 09 antes de 10B/12, e 08-C exigia parser até para resultado manual | DAG revisado: 08-A/C manual após 04; 10B sobre superfície instalada; 09/11 opcionais para primeiro piloto | 02/04/07 e specs 08/10/12 concordam; escopo financeiro prometido exige 08 |
| AX-28 | subscription_revenue figurava dentro de operational_cost | Despesas e receita SaaS em entidades/projeções separadas; receita pertence à conta operadora, não ao assinante | C-07, M-08, 08-C e S-FIN; nenhuma tabela real alterada |
| AX-29 | Assinatura principal de analysis_assessment ainda citava policy_version_id antes de EP-03, contrariando nota complementar | M-02 usa rubric_version; M-03 adiciona policy_version_id nullable após criar política, sem backfill inventado | C-03 e M-03 alinhados |
| AX-30 | Mapeamento HTTP por “respectivamente” tinha mais códigos que status | C-09 passa a mapear explicitamente cada grupo; evidence_stale é conflito 409 | Contrato sem correspondência implícita ambígua |
| AX-31 | Contrato de variante poderia ser confundido com capacidade de obter histórico real | G-EVIDENCE exige proveniência e observações comparáveis da fonte; E0/E1 mantém utilidade quando não houver | EP-01 e 07; não fabricar variantes para atingir KPI |

AX-26–31 foram identificados na segunda revisão, solicitada antes da implementação, em 14/10/2026. A primeira auditoria não havia eliminado essas inconsistências. O [parecer de viabilidade](09-REVISAO-DE-VIABILIDADE.md) documenta impacto e limites; revisão do mesmo agente, sem alegação de independência.

## Revisão dos requisitos solicitados

- **Contratos incompatíveis:** fonte única C-01…C-09 e autores definidos. Diferenças existentes registradas E-03/E-06, não legitimadas pelo plano.
- **Alterações concorrentes no mesmo componente:** tabela de propriedade em 02-ARQUITETURA; EP-01 domina preço, EP-03 integra pipeline, EP-10 domina autorização, 04/07 dividem link básico e atribuição. Integrar esses arquivos sequencialmente no executor.
- **Migrations fora de ordem:** M-03 precede consumidores de domain_event; parents precedem revisions/links; 02 não exige policy de 03; 10B é gate de verificação, não requisito impossível para criar 04.
- **Funcionalidades duplicadas:** sem segundo engine, segundo ledger social ou financeiro; reutilizar composer/Story, avaliações humanas e estrutura de accounts. Marketing não vira fonte de confirmação.
- **UI sobre estruturas ausentes:** toda ação tem entrega produtora definida; capability indisponível tem mensagem, não botão enganoso. 04 oferece UI mínima, 05 conecta, 06/08 enriquecem.
- **Compatibilidade:** slugs/códigos/IDs legados, DTO de preços por adapter, migrations aditivas e flags; nenhuma limpeza destrutiva como etapa de evolução.
- **Requisitos comerciais:** matriz 08 inclui 62 REQs, decisões/invariantes, 18 testes e 6 experimentos. Afiliado próprio e SaaS permanecem equivalentes em capacidade; prova de receita não é clique.
- **SaaS futuro:** identidade humana global e contexto por membership, catálogo privado por default, políticas/credenciais/campanhas por conta, capabilities e limites versionados. Não fixar nicho ou tag da casa.
- **Entregas sem resultado funcional:** cada passo tem comportamento para operador/consumidor ou segurança comprovável em jornada. DDL sempre integra serviço/fluxo no mesmo incremento; aplicação remota é passo operacional separado, não definição de pronto.

## Pendências que a auditoria não pode resolver por redação

G-ENV/G-BASE: runtime e testes afetados. G-PRICE/G-RUBRIC: calibração humana. G-RIGHTS/G-PROGRAM: permissões/capabilities reais. G-FIN: formato/documento. G-CHANNEL/G-PILOT/G-PRIVACY: decisões do responsável. G-SEC: implementação e testes reais futuros. Nenhuma delas foi marcada “resolvida” por existir um documento.

O plano integral está redigido e revisado. A liberação de implementação de cada entrega depende das entradas do índice e da autorização futura, com partes genuinamente bloqueadas identificadas. Não há autorização para modificar produção nesta tarefa.
