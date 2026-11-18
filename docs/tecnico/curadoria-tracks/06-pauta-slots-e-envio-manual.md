# T06 Pauta por slots e confirmação de envio manual

Parte do [plano integrado de curadoria](../plano-integracao-captura-curadoria-vitrine-pauta.md#16-etapas-de-implementação-e-dependências). Corresponde a **F6**; os IDs de tarefa localizam trabalho deste mesmo objetivo, sem criar novas OS.

**Dependências:** [T03](03-selecao-promocao-e-validade-publica.md), [T04](04-recaptura-planner-e-listagens.md)

**Situação de entrada:** Já existem pauta, cooldown/exposições e edição/cache por canal. Slots e confirmação ligada à preparação histórica precisam ser integrados sem perder rascunhos ou registros de envio.

## Resultado observável

Ao preparar o slot, o operador recebe produtos elegíveis e atuais; o envio continua manual e sua confirmação permanece íntegra após mudança de preço ou edição.

## Decisões a consultar

- [Seção 2: Invariantes que orientam todas as etapas](../plano-integracao-captura-curadoria-vitrine-pauta.md#2-invariantes-que-orientam-todas-as-etapas).
- [Seção 10: Pauta por slots e confirmação manual](../plano-integracao-captura-curadoria-vitrine-pauta.md#10-pauta-por-slots-e-confirmação-manual).
- [Seção 14: Interfaces e apresentação da promessa](../plano-integracao-captura-curadoria-vitrine-pauta.md#14-interfaces-e-apresentação-da-promessa).
- [Seção 15: Parâmetros iniciais e decisões configuráveis](../plano-integracao-captura-curadoria-vitrine-pauta.md#15-parâmetros-iniciais-e-decisões-configuráveis).

As regras e os valores iniciais permanecem no plano central. Esta spec organiza tarefas e aceites; divergência descoberta na implementação deve ser reconciliada ali, sem manter dois critérios diferentes.

## Pontos de partida no código

- [pauta-db.ts](../../../packages/web/lib/pauta-db.ts) — `packages/web/lib/pauta-db.ts`.
- [pauta-policy.ts](../../../packages/web/lib/pauta-policy.ts) — `packages/web/lib/pauta-policy.ts`.
- [recommendation-policy.ts](../../../packages/web/lib/recommendation-policy.ts) — `packages/web/lib/recommendation-policy.ts`.
- [recommendation-db.ts](../../../packages/web/lib/recommendation-db.ts) — `packages/web/lib/recommendation-db.ts`.
- [route.ts](../../../packages/web/app/api/pauta/route.ts) — `packages/web/app/api/pauta/route.ts`.
- [pauta-client.tsx](../../../packages/web/app/pauta/pauta-client.tsx) — `packages/web/app/pauta/pauta-client.tsx`.
- [marketing-pauta.ts](../../../packages/web/lib/marketing-pauta.ts) — `packages/web/lib/marketing-pauta.ts`.
- [kit-renderer.ts](../../../packages/web/lib/kit-renderer.ts) — `packages/web/lib/kit-renderer.ts`.
- [pauta-live-flow.test.ts](../../../tools/editorial-tests/pauta-live-flow.test.ts) — `tools/editorial-tests/pauta-live-flow.test.ts`.

Esses caminhos indicam onde continuar; não obrigam a criar outra implementação em paralelo. Alterações locais corretas devem ser integradas e verificadas.

## Tarefas

- [x] **T06.01** — Persistir configuração/ocorrências de slots por conta/canal/fuso, com unicidade de horário e estado. Preservar política legada e manter agenda sem horário válido desativada. *(Verificado via `pauta-live-flow.test.ts` e `curation-journey-t03-t08-v2.test.ts`.)*
- [x] **T06.02** — Gerar previsão limitada de candidatos para o próximo slot e repassar prioridades ao planner; previsão não congela produto/preço nem inicia cooldown. *(Verificado em `curation-journey-t03-t08-v2.test.ts`.)*
- [x] **T06.03** — Preparar seleção final no horário/uso, usando gates compartilhados, conferência Shopee e filas DOM quando necessário. Sem evidência suficiente, oferecer menos produtos ou aguardar. *(Verificado em `curation-journey-t03-t08-v2.test.ts` e `browser-marketplace-pauta-flow.test.ts`.)*
- [x] **T06.04** — Aplicar cooldown, equivalência, rotação por categorias realmente enviadas e teto opcional de impulso conforme a política. Nunca exigir desconto percentual mínimo. *(Verificado em PGlite com `garimpa_app`.)*
- [x] **T06.05** — Guardar preparação com fatos, política/revisão, produtos, mensagem e validade; gerar os links/arte de forma fiel a preço exato, faixa e condições. *(Verificado em PGlite e suíte `packages/web/test`.)*
- [x] **T06.06** — Preservar rascunho e texto já copiado quando chegar nova evidência; sinalizar mudança/vencimento e permitir nova preparação para uso. *(Verificado em `curation-journey-t03-t08-v2.test.ts`.)*
- [x] **T06.07** — Confirmar idempotentemente o snapshot que o humano declara ter enviado, mesmo após mudar a edição. Registrar aviso de vencimento quando aplicável; rejeitar preparação/conta forjada. *(Verificado em `curation-journey-t03-t08-v2.test.ts`, inclusive envio atrasado `preparation_expired` e isolamento entre contas.)*
- [x] **T06.08** — Iniciar exposição/cooldown somente na confirmação humana. Copiar/abrir não grava envio; nunca implementar disparo automático no WhatsApp. *(Verificado em PGlite e contratos de pauta.)*
- [x] **T06.09** — Tratar restart, slot perdido, canal pausado e preparação concorrente sem duplicar ocorrência nem acumular envios atrasados; manter confirmação e arquivo histórico permanentes. *(Verificado em PGlite e `pauta-live-flow.test.ts`.)*
- [ ] **T06.10** — Integrar UI de agenda/preparação/pendência/envio e testar a jornada nos canais existentes, sem alterar as autorizações ou produtos de publicação. *(UI `app/pauta` e rotas `/api/pauta/*` compilam em `next build` e APIs/DB foram verificados em PGlite; ensaio interativo na UI do navegador pendente.)*

## Como demonstrar a conclusão

- Preço muda entre previsão e preparação: o texto pronto usa a nova condição ou aguarda conferência.
- Copiar sem enviar não cria exposição; confirmar duas vezes cria um único registro.
- Envio manual ocorrido pode ser declarado contra o snapshot autêntico depois da troca de edição, sem reescrever a mensagem.
- Cooldown e rotação consideram confirmações reais; restart não repete slot nem mensagem.
- Para resíduo DOM que exige PDP, a conclusão operacional depende de T05; até lá a interface deixa a condição pendente.

Marcar uma tarefa somente depois de conferir o comportamento ou artefato correspondente. Registrar evidência junto da tarefa ou no registro existente de verificação; não criar relatório separado para cada checkbox. Evidência simulada, local e de destino tem escopos distintos.

## Integração com as demais tracks

Entrega à T07 exposições/preparações auditáveis e ao operador uma pauta utilizável. Reutiliza os executores T04/T05 e os gates T03, sem nova fila paralela.
