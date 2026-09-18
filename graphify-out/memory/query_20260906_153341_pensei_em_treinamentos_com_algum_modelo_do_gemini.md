---
type: "query"
date: "2026-09-06T15:33:41.541728+00:00"
question: "Pensei em treinamentos com algum modelo do Gemini usando o Vertex Studio"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Modelo de Dados", "Ranking por sinal de valor", "Saturação por espelhamento de ofertas", "CaptureContext", "Vitrine()"]
---

# Q: Pensei em treinamentos com algum modelo do Gemini usando o Vertex Studio

## Answer

Expanded from original query via graph vocab: [curadoria, decis, modelo, produto, ranking, satura, snapshots, vitrine, capture]. O Vertex AI torna o ajuste do Gemini viável, inclusive por supervised fine-tuning e preference tuning. Para o BizuMiner, a arquitetura recomendada é manter RAG e avaliações como fundação, coletar decisões humanas limpas em modo sombra e então testar dois objetivos separados: SFT para classificar elegibilidade, motivo e necessidade de revisão; preference tuning para ordenar produtos comparáveis e escolher representantes. Approved, rejected e held/family_saturation devem continuar distintos; um item não selecionado por saturação não é exemplo negativo global. Treinos devem ocorrer em lotes versionados, com conjunto de teste temporal separado e promoção somente se superar o Gemini base mais RAG, especialmente em falso positivo de aprovação. Vertex AI Studio serve para prototipar; produção deve usar jobs reproduzíveis via API/SDK e datasets versionados. Fine-tuning complementa, não substitui, a memória RAG.

## Outcome

- Signal: useful

## Source Nodes

- Modelo de Dados
- Ranking por sinal de valor
- Saturação por espelhamento de ofertas
- CaptureContext
- Vitrine()