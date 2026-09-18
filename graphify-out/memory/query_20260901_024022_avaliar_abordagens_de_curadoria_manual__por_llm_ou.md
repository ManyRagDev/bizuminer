---
type: "query"
date: "2026-09-01T02:40:22.900857+00:00"
question: "Avaliar abordagens de curadoria manual, por LLM ou híbrida e recomendar uma solução técnica e prática para o Garimpa."
contributor: "graphify"
outcome: "useful"
source_nodes: ["product", "offer", "publication", "Composer", "topDeals"]
---

# Q: Avaliar abordagens de curadoria manual, por LLM ou híbrida e recomendar uma solução técnica e prática para o Garimpa.

## Answer

Expanded from original query via vocab: [product, products, curated, deal, offer, ingest, publication, status, source]. O projeto já separa product, histórico de preço e publication, mas a vitrine topDeals lê diretamente produtos ativos/recentes sem um gate editorial. O painel admin e o Composer já oferecem busca e seleção de produtos. Recomendação: curadoria híbrida fail-closed para novos itens, com regras determinísticas, LLM apenas como triagem estruturada e decisão humana auditável; separar adequação do produto, elegibilidade temporária da oferta e prioridade editorial; persistir estado atual mais eventos append-only, motivos, versões de política/modelo e confiança; usar decisões humanas como exemplos de contexto e conjunto de avaliação antes de qualquer fine-tuning.

## Outcome

- Signal: useful

## Source Nodes

- product
- offer
- publication
- Composer
- topDeals