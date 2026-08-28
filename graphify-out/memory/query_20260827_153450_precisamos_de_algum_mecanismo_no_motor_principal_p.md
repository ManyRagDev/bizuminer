---
type: "query"
date: "2026-08-27T15:34:50.057569+00:00"
question: "Precisamos de algum mecanismo no motor principal para evitar produtos ruins, por exemplo computador da Shopee; o sufixo da Shopee pressupõe qualidade duvidosa."
contributor: "graphify"
outcome: "useful"
source_nodes: ["Ranking por sinal de valor", "Curadoria de origem", "Desconto declarado versus desconto verificado", "Plano de Implementação — Motor de Curadoria", "Metadados acessíveis de produto"]
---

# Q: Precisamos de algum mecanismo no motor principal para evitar produtos ruins, por exemplo computador da Shopee; o sufixo da Shopee pressupõe qualidade duvidosa.

## Answer

Expansão usada: curadoria, ranking, risco, title, produto, filtros, desconto. Criar uma camada de elegibilidade e risco antes do ranking: hard blocks determinísticos, risk_score com reason codes e três saídas publish, review e reject. Sinais incluem higiene e spam de título, plausibilidade de preço na categoria, histórico próprio, nota, vendidos, clareza de marca/modelo e rigor diferente por vertical. A expressão da Shopee é sinal de keyword spam, não prova isolada de baixa qualidade. Persistir decisão, versão da regra e motivos, mantendo título bruto e título de exibição separados.

## Outcome

- Signal: useful

## Source Nodes

- Ranking por sinal de valor
- Curadoria de origem
- Desconto declarado versus desconto verificado
- Plano de Implementação — Motor de Curadoria
- Metadados acessíveis de produto