# Handoff — curadoria editorial v1

**Estado:** 🟡 implementada e aplicada no banco em 01/09/2026; verificação técnica passou e julgamento humano ainda está pendente.

## 1. O que foi entregue

- Notificação no painel: “Você tem XX produtos para avaliação”.
- Mesa dedicada em `/admin/curadoria`, em sessões de até 20 produtos.
- Decisões rápidas: aprovar, não publicar agora, rejeitar, deixar para depois e desfazer a última decisão.
- Motivos por chips, sem questionário. “Outro” abre texto livre obrigatório, preservado para análise de padrões e contexto de IA futuro.
- Estado atual separado de um log append-only de eventos.
- Gate em todas as superfícies públicas de produto, inclusive `/go`: produto novo fica oculto até aprovação.

## 2. Regra de rollout

1. A migration marca o catálogo já existente como `legacy_visible`: ele continua público e entra na fila.
2. Um trigger cria `pending` para todo produto novo, independentemente de entrar por sweep, captura manual ou extensão.
3. `approved` e `legacy_visible` podem aparecer ao público. `pending`, `held` e `rejected` não podem.
4. A migration foi aplicada antes do deploy do código web, pois as consultas passam a depender das novas tabelas.

## 3. Fonte de verdade e arquivos

- Migration: `packages/persistence/supabase/migrations/20260901025640_garimpa_curation.sql`
- Contrato e validação: `packages/web/lib/curation-contract.ts`
- Consultas e transações: `packages/web/lib/curation-db.ts`
- Tela: `packages/web/app/admin/curadoria/`
- Gate público: `packages/web/lib/db.ts`, `packages/web/lib/member-db.ts` e `packages/web/app/go/[slug]/route.ts`
- Verificador pós-migration: `packages/persistence/bin/verify-curation.ts`

## 4. Evidências locais

- Testes novos do contrato: 6/6.
- Testes do pacote persistence: 11/11.
- Typecheck: web e persistence limpos.
- Build de produção web: limpo, 17/17 páginas geradas.
- Suíte web completa no working tree atual: 123/131 na execução anterior à adição do sexto teste de curadoria. As 8 falhas já existentes estão fora desta entrega (`deal-signal`, expectativas antigas de query e logo de marketplace); os 6 testes de curadoria passam isoladamente.
- Migration aplicada no projeto `spbuwcwmxlycchuwhfir` e registrada como `20260901025640` no histórico remoto.
- Verificação real: 571 produtos / 571 estados, zero produtos ou estados órfãos, zero “Outro” malformado e trigger `product_seed_curation` presente. A página inicial respondeu HTTP 200 após a aplicação.
- Advisors de segurança: execução sem erros; avisos encontrados pertencem a outros schemas compartilhados no mesmo projeto, não à função/tabelas desta entrega.

## 5. PEDIDO DE CONFERÊNCIA

Conferente: derive a resposta da fonte de verdade, não deste relato.

1. ✅ Migration aplicada e `npm run verify:curation` executado: zero produtos sem estado, zero estados sem produto e zero “Outro” malformado.
2. Inserir um produto de teste pela borda autorizada e confirmar que ele nasce `pending` e não aparece na vitrine, no detalhe nem em `/go`.
3. Em `/admin`, confirmar a notificação com contagem e abrir `/admin/curadoria`.
4. Avaliar um produto com cada fluxo: aprovar; rejeitar com motivo; reter com motivo; “Outro” com texto; Depois; desfazer.
5. Conferir no banco que cada decisão criou um `curation_event`, que “Outro” preservou o texto e que desfazer só funciona sobre a última decisão do mesmo revisor.
6. Julgamento do dono: a sessão de 20 é prática, as evidências são suficientes e os motivos não induzem uma decisão errada.

## 6. Fora desta entrega

LLM, regras automáticas, fine-tuning, sugestões de decisão, aprovação em lote e narrativa/blurb. Os dados já ficam estruturados para medir padrões antes de automatizar.
