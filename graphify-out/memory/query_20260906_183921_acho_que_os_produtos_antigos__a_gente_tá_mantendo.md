---
type: "query"
date: "2026-09-06T18:39:21.509915+00:00"
question: "acho que os produtos antigos, a gente tá mantendo à toa. Acho que podemos tranquilamente passar a régua em 7 dias de algum produto. Ou seja, se atingir essa idade, não vamos exibir mais, a não ser que haja atualização de preço. Outra forma de pensar é você corrigir sem dó o que pode claramente ficar de fora e manter somente os produtos que realmente são vantajosos."
contributor: "graphify"
outcome: "corrected"
correction: "A limpeza foi efetivamente aplicada: 20 produtos públicos vigentes após 44 reclassificações auditáveis, não apenas 64 projetados."
source_nodes: ["product", "Vitrine()", "price_observation por intervalos", "publication"]
---

# Q: acho que os produtos antigos, a gente tá mantendo à toa. Acho que podemos tranquilamente passar a régua em 7 dias de algum produto. Ou seja, se atingir essa idade, não vamos exibir mais, a não ser que haja atualização de preço. Outra forma de pensar é você corrigir sem dó o que pode claramente ficar de fora e manter somente os produtos que realmente são vantajosos.

## Answer

Expanded from original query via vocab: [produto, produtos, curadoria, vitrine, price, observation, publication, status, satura, postgres]. A resposta anterior ficou incompleta ao parar na projeção de 64 itens. A regra global de 7 dias e approved-only foi implementada; depois, 44 decisões auditáveis actor_type=llm foram aplicadas no Supabase, sendo 32 holds e 12 rejects. O resultado real é 20 produtos públicos vigentes, 259 pendências vigentes e histórico integral preservado.

## Outcome

- Signal: corrected
- Correction: A limpeza foi efetivamente aplicada: 20 produtos públicos vigentes após 44 reclassificações auditáveis, não apenas 64 projetados.

## Source Nodes

- product
- Vitrine()
- price_observation por intervalos
- publication