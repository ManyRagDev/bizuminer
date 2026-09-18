---
type: "query"
date: "2026-09-05T02:25:08.399957+00:00"
question: "como eu faço para usar a curadoria? como ficou a arquitetura?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["product", "Curadoria em profundidade"]
---

# Q: como eu faço para usar a curadoria? como ficou a arquitetura?

## Answer

Expanded from original query via graph vocab: [curated, editorial, product, products]. O grafo existente estava desatualizado para a mesa de curadoria; a resposta foi corroborada no código atual. Uso: login administrativo, /admin, aviso de pendências, /admin/curadoria, sessão de 20 itens, aprovar/reter/rejeitar com motivo e undo. Arquitetura: captura cria product; trigger cria product_curation pending; curation_queue_facts reúne evidências; server actions validam admin e contrato; transação atualiza estado e grava curation_event com snapshot; leituras públicas aceitam approved e legacy_visible. Grupos, lote e adiamento persistente existem como fundação, mas a UI de grupos e a IA editorial ainda não estão conectadas. O botão Depois apenas reordena localmente a sessão atual.

## Outcome

- Signal: useful

## Source Nodes

- product
- Curadoria em profundidade