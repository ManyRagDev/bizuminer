---
type: "query"
date: "2026-09-05T23:34:00.955086+00:00"
question: "Nas rodagens, agrupar as consultas da mesma execução em uma linha expansível"
contributor: "graphify"
outcome: "useful"
source_nodes: ["runCapturePlan()", "sweep()", "capture_run"]
---

# Q: Nas rodagens, agrupar as consultas da mesma execução em uma linha expansível

## Answer

Implementado captureExecutionId explícito nas novas consultas, fallback histórico estrito pelo collector_run_id e captureQueryId, leitura limitada por execuções completas, agregação de status e contadores e tabela expansível no AdminPanel. Banco real: 12 linhas da AliExpress viraram 3 execuções, maior com 10 consultas. Testes específicos 4/4, persistence 22/22 e typechecks limpos.

## Outcome

- Signal: useful

## Source Nodes

- runCapturePlan()
- sweep()
- capture_run