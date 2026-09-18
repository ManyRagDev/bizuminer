# PEDIDO DE CONFERÊNCIA — M4-D.1 (parcial)

## 0. Como usar este pedido

Não confie neste documento. Ele registra afirmações do implementador; a conferência deve rederivá-las a partir do código, dos testes e do banco.

## 1. Contexto mínimo

A correção endurece a trilha de curadoria sem iniciar a tela M4-E. Decidir deve consumir adiamentos, undo deve restaurar o estado editorial anterior, lotes e grupos devem falhar fechado, snapshots devem reproduzir a imagem exibida e o verificador não pode aprovar ausência de evidência.

## 2. Onde olhar

- `packages/web/lib/curation-db.ts`, `curation-transition.ts`, `curation-contract.ts`, `editorial-groups.ts` e `curation-snapshot.ts`: transições, validação e snapshot.
- `packages/persistence/supabase/migrations/20260904173316_harden_editorial_context.sql`: estado anterior persistido no evento.
- `packages/persistence/bin/verify-editorial-context.ts` e `src/editorial-context-verification.ts`: evidência e falha fechada.
- Testes `curation-*.test.mjs`, `editorial-groups.test.mjs` e `editorial-context-verification.test.ts`.

Contagem direcionada web ANTES: 17 · DEPOIS: 22. Persistence ANTES: 20 · DEPOIS: 22.

## 3. Afirmações a falsificar

| # | Afirmo que… | Como você rederiva | Evidência anexada |
|---|---|---|---|
| A1 | Aprovar/rejeitar/esperar grava `deferred_until=null` e preserva motivo/detalhe/adiamento anteriores no evento. | Inspecionar `applyDecision` e a migration corretiva; rodar `curation-transition.test.mjs`. | 22/22 testes direcionados web. |
| A2 | Undo restaura status, motivo, detalhe e adiamento; evento legado sem motivo obrigatório falha fechado. | Inspecionar `undoReview`/`stateRestoredByUndo`; rodar o teste direcionado. | Casos `held/family_saturation` e legado cobertos. |
| A3 | Um lote recusa IDs repetidos e um `group_id` só é aceito quando coincide com tenant+família+método+versão persistidos. | Rodar `curation-contract.test.mjs` e `editorial-groups.test.mjs`; seguir a chamada em `curation-db.ts`. | Testes de duplicata, tenant errado, id arbitrário e produto singular. |
| A4 | Snapshot v1 contém `imageUrl`; ausência total de snapshot produz `awaiting_snapshot_evidence` e `ok=false`; snapshot presente tem chaves/tipos mínimos verificados. | Rodar testes de snapshot e `editorial-context-verification`; inspecionar a consulta JSONB do verifier. | Web direcionado 22/22; persistence 22/22. |
| A5 | O banco tem a M4-D.1 e uma prova real decisão→undo preservou auditoria e restaurou o estado final. | Executar `npm run verify:editorial-context`, `npm run verify:curation` e consultar a versão `20260904173316` no histórico remoto; inspecionar os eventos 43/44. | `verified/ok=true`; 571/571 estados; versão presente; produto `00c6f380-9556-4a51-aad1-efe27599d60d` restaurado. |
| A6 | A mudança compila e gera build, sem criar nova regressão conhecida na suíte geral. | Rodar typecheck nos três pacotes, build web e suítes; comparar falhas web com o baseline. | capture 120/120; persistence 22/22; web 140/148, mesmas 8 falhas pré-existentes; build limpo. |

## 4. O que não entrou

- Tela de caixa por grupos e botão “Depois” persistente: pertencem à M4-E.
- Correção das oito falhas gerais preexistentes do pacote web: fora do escopo da curadoria.

## 5. Onde eu desconfio de mim mesmo

- A validação de grupo usa hash FNV-1a de 64 bits: colisão acidental é extremamente improvável, mas não matematicamente impossível.
- A prova real cobriu um estado anterior `legacy_visible`; resta ao conferente falsificar por leitura/testes a restauração de `held/rejected`, já que criar esses estados apenas para teste aumentaria a mutação no banco.
- O histórico remoto já tinha divergências de timestamp anteriores a esta entrega; somente a versão nova foi alinhada.

## 6. Degraus cumpridos

- Coerência: typechecks limpos e testes direcionados 22/22.
- Expectativa registrada: casos de regressão adicionados; documentação atualizada e retratação registrada.
- Build observável: Next.js gerou 17 páginas estáticas e a rota dinâmica `/admin/curadoria` sem erro.
- Fonte real: migration aplicada, versão registrada, prova decisão→undo aprovada e verificadores globais verdes.
- Conferência independente e julgamento humano: pendentes; por isso o status continua 🟡.
