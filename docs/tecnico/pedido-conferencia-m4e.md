# PEDIDO DE CONFERÊNCIA — M4-E

## 0. Como usar este pedido

Não confie neste documento. Ele registra afirmações do implementador; a conferência independente deve rederivá-las a partir do código, dos testes automatizados e do banco de dados.

## 1. Contexto mínimo

A entrega **M4-E (Caixa de entrada por grupos e sessão prática)** substitui a obrigação de avaliar centenas de produtos soltos por uma caixa de entrada estruturada em grupos de semelhantes (ex.: 30 manoplas resolvidas com no máximo 5–6 decisões individuais), mantendo a mesa individual como segunda etapa para finalistas, singulares e itens ambíguos.

A notificação do painel e o cabeçalho da curadoria agora expressam **carga de decisão** em vez de contagem bruta; a navegação foi organizada em 4 abas operacionais (`Hoje`, `Grupos repetitivos`, `Em espera`, `Aprendizados`); ações atômicas de grupo retêm itens não selecionados como `held/family_saturation` (nunca `rejected/low_utility`); desfazimento em lote atômico (`undoBulkReview`); botão "Rever em 7 dias" (`deferred_until`) com antecipação; resumo de encerramento de sessão com dados auditáveis e textos livres de "Outro"; e isolamento estrito da vitrine pública.

## 2. Onde olhar

- `packages/web/app/admin/curadoria/page.tsx`: Abas operacionais, banner de carga de decisão e renderização condicional.
- `packages/web/app/admin/curadoria/group-reviewer.tsx`: Interface de cards de grupos, representantes, seleção, combo de aprovação + retenção por saturação, expansão de todos os membros e desfazer em lote.
- `packages/web/app/admin/curadoria/curation-reviewer.tsx`: Mesa individual preservada com botão "Rever em 7 dias", "Encerrar sessão" e resumo.
- `packages/web/app/admin/curadoria/held-queue-view.tsx`: Fila em espera/adiados com antecipação imediata.
- `packages/web/app/admin/curadoria/learnings-view.tsx`: Painel de aprendizados com taxa de compressão e padrões livres de "Outro".
- `packages/web/app/admin/curadoria/actions.ts`: Server Actions (`submitGroupAction`, `undoGroupAction`, `fetchGroupMembers`, `deferCurationProduct`, `clearDeferredCurationProduct`).
- `packages/web/app/admin/page.tsx`: Notificação do painel com `formatDecisionLoad`.
- `packages/web/lib/curation-db.ts`: Consultas otimizadas (`curationDecisionLoad`, `curationGroupCards`, `groupMembers`, `deferredQueue`, `curationLearnings`) e transações atômicas (`actOnGroup`, `undoBulkReview`).
- `packages/web/lib/curation-contract.ts`: Contrato de carga decisória (`formatDecisionLoad`), validação de ação de grupo (`validateGroupAction`), constante `DEFAULT_DEFER_DAYS = 7` e resumo de sessão.
- `packages/web/lib/editorial-groups.ts`: Seleção de representantes balanceando evidência com diversidade de marketplaces (`selectRepresentatives`), dados agregados de grupo (`marketplaceDistribution`, `priceRange`, `groupingReason`).
- Testes:
  - `packages/web/test/curation-bulk-group.test.mjs` (cenário de 30 itens, combo de saturação, snapshot compartilhado, bulk undo, validações).
  - `packages/web/test/curation-vitrine-regression.test.mjs` (isolamento de vitrine para pending, held e rejected).
  - `packages/web/test/editorial-groups.test.mjs` (representantes com diversidade de loja, faixas de preço e motivos).
  - `packages/web/test/curation-*.test.mjs` (contrato, transições e snapshots).

Contagem direcionada de testes de curadoria e grupos:
- ANTES de M4-E: 22 testes.
- DEPOIS de M4-E: 31 testes (todos passando com sucesso).
- Pacote persistence: 22/22 testes passando.

## 3. Afirmações a falsificar

| # | Afirmo que… | Como você rederiva | Evidência anexada |
|---|---|---|---|
| A1 | O painel (`/admin`) e o topo da curadoria expressam carga real de decisão humana: *"X grupos e Y produtos singulares aguardam avaliação — Z produtos capturados"*. | Inspecionar `packages/web/app/admin/page.tsx`, `curadoria/page.tsx`, `curation-contract.ts` (`formatDecisionLoad`) e `curation-db.ts` (`curationDecisionLoad`). | `curation-bulk-group.test.mjs` (testes de formatação singular e plural). |
| A2 | Cenário de 30 itens na mesma família é resolvido com no máximo 5–6 decisões (até 5 representantes exibidos), aprovando representantes e retendo não-selecionados como `held/family_saturation` (nunca `rejected`). | Inspecionar `editorial-groups.ts` (`selectRepresentatives`), `curation-db.ts` (`actOnGroup`) e rodar `curation-bulk-group.test.mjs`. | Teste de cenário prático com 30 itens: 2 aprovados, 28 retidos por saturação, 0 rejeitados por low_utility. |
| A3 | `actOnGroup` não confia no cliente: recalcula o hash canônico `grp_<hash64>` no servidor contra o tenant e família do banco; falha fechado se houver divergência ou produtos duplicados. | Inspecionar `curation-db.ts` (`actOnGroup`) e `curation-contract.ts` (`validateGroupAction`); rodar testes de contrato. | Rejeição comprovada para hash divergente (`invalid_group_id`) e duplicatas (`bulk_duplicate_product`). |
| A4 | Ação em lote é atômica e possui desfazimento atômico (`undoBulkReview`), restaurando status, motivo, detalhe e adiamento anteriores de todos os itens afetados. | Inspecionar `actOnGroup` e `undoBulkReview` em `curation-db.ts`; verificar uso de `sql.begin` e `stateRestoredByUndo`. | Teste automatizado de reversão de lote em `curation-bulk-group.test.mjs`. |
| A5 | O botão "Depois" persiste por 7 dias (`DEFAULT_DEFER_DAYS = 7`, `deferred_until`) e a aba "Em espera" permite antecipar a avaliação imediatamente limpando o prazo. | Inspecionar `curation-reviewer.tsx`, `actions.ts` (`deferCurationProduct`, `clearDeferredCurationProduct`) e `held-queue-view.tsx`. | Transições comprovadas em `curation-transition.test.mjs` e `curation-reviewer.tsx`. |
| A6 | O encerramento de sessão consolida aprovados, rejeitados, retidos por saturação, retidos por evidência e lista os motivos "Outro" com texto livre (3–1000 caracteres). | Inspecionar `curation-reviewer.tsx` (resumo de sessão) e `learnings-view.tsx`. | Validação de tamanho em `curation-contract.ts` e renderização de resumo testada. |
| A7 | A vitrine pública permanece estritamente isolada de produtos não decididos: apenas `approved` e `legacy_visible` são consultados; `pending`, `held` (saturação/evidência) e `rejected` nunca aparecem ao público. | Inspecionar predicados SQL em `packages/web/lib/db.ts` (`pc.status in ('approved', 'legacy_visible')`) e rodar `curation-vitrine-regression.test.mjs`. | 3/3 testes de regressão de vitrine passando. |
| A8 | A mudança compila sem erros, passa no build de produção do Next.js e preserva integridade do banco (571 produtos/571 estados, 0 órfãos). | Rodar `npm run typecheck` em `packages/web` e `packages/persistence`; rodar `npm run build` em `packages/web`; rodar `verify:editorial-context` e `verify:curation`. | Build web concluído (17 rotas estáticas + rotas dinâmicas); `verified/ok=true` em editorial-context; 571/571 estados íntegros. |

## 4. O que não entrou (preservado conscientemente)

- Sugestão por LLM, embeddings ou automação de seleção da home (permanecem reservados para M4-F a M4-H).
- Cota artificial para "balancear" marketplaces aprovando ofertas fracas.
- Reescrita ou migração destrutiva no banco (M4-E reutilizou integralmente o schema e views estabelecidos em M4-D).

## 5. Onde eu desconfio de mim mesmo

- A consulta de `curationGroupCards` limita a exibição inicial a 20 grupos com até 5 representantes cada para preservar a performance de carregamento e memória do cliente SSR; grupos além de 20 tornam-se visíveis à medida que os primeiros são decididos ou via busca direta.
- A expansão de "todos os produtos do grupo" (`fetchGroupMembers`) é executada sob demanda por Server Action para evitar carregar dezenas de imagens desnecessárias no primeiro render.
- Como M4-D.1 ainda aguarda aprovação formal independente, M4-E não pode e não deve ser marcada como concluída (✅), permanecendo em 🟡.

## 6. Degraus cumpridos

- **Coerência:** `tsc --noEmit` limpo em `packages/web` e `packages/persistence`; 31/31 testes de curadoria e grupos passando; 22/22 testes de persistence passando.
- **Build observável:** Next.js compilou com sucesso em produção (`npm run build`).
- **Integridade no banco:** `npm run verify:editorial-context` (`verified/ok=true`) e `npm run verify:curation` (571 estados íntegros, 0 órfãos).
- **Status:** 🟡 implementada e pronta para conferência independente.
