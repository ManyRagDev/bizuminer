---
type: "query"
date: "2026-09-06T18:33:32.417975+00:00"
question: "acho que os produtos antigos, a gente tá mantendo à toa. Acho que podemos tranquilamente passar a régua em 7 dias de algum produto. Ou seja, se atingir essa idade, não vamos exibir mais, a não ser que haja atualização de preço. Outra forma de pensar é você corrigir sem dó o que pode claramente ficar de fora e manter somente os produtos que realmente são vantajosos."
contributor: "graphify"
outcome: "useful"
source_nodes: ["product", "Vitrine()", "price_observation por intervalos", "publication"]
---

# Q: acho que os produtos antigos, a gente tá mantendo à toa. Acho que podemos tranquilamente passar a régua em 7 dias de algum produto. Ou seja, se atingir essa idade, não vamos exibir mais, a não ser que haja atualização de preço. Outra forma de pensar é você corrigir sem dó o que pode claramente ficar de fora e manter somente os produtos que realmente são vantajosos.

## Answer

Expanded from original query via vocab: [produto, produtos, curadoria, vitrine, price, observation, publication, status, satura, postgres]. Implementada validade global derivada de 7 dias por last_seen_at, renovada por qualquer reobservação; vitrine, detalhes, redirects, área do comprador e curadoria operacional filtram itens vencidos. A publicação passou a exigir somente approved; legacy_visible não é mais público. Histórico e eventos são preservados. Medição real: vitrine projetada em 64 aprovados vigentes e fila em 259 pendências vigentes.

## Outcome

- Signal: useful

## Source Nodes

- product
- Vitrine()
- price_observation por intervalos
- publication