---
type: "query"
date: "2026-08-19T02:11:59.680745+00:00"
question: "Como organizar produtos novos, preços atualizados, execuções de captura e histórico para auditoria no BizuMiner?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["product", "PriceObservationRecord", "capture_run", "price_observation por intervalos"]
---

# Q: Como organizar produtos novos, preços atualizados, execuções de captura e histórico para auditoria no BizuMiner?

## Answer

Expanded via graph vocab: [product, price, observation, capture, run, store, ingest, audit]. O projeto já separa product, price_observation e capture_run, mas falta ligar cada observação à execução, distinguir estado atual de snapshot histórico, registrar first_seen_at/last_seen_at e preservar o contexto exibido/publicado. Para a frequência diária atual, uma observação append-only por produto por execução é simples e auditável; intervalos ou particionamento só se justificam em escala muito maior.

## Outcome

- Signal: useful

## Source Nodes

- product
- PriceObservationRecord
- capture_run
- price_observation por intervalos