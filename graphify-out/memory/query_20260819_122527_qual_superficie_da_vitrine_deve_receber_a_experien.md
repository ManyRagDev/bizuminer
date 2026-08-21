---
type: "query"
date: "2026-08-19T12:25:27.034715+00:00"
question: "Qual superficie da vitrine deve receber a experiencia mobile-first e como o catalogo se conecta aos cards, categorias e detalhes?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Vitrine()", "vitrine.tsx", "VitrineProduct"]
---

# Q: Qual superficie da vitrine deve receber a experiencia mobile-first e como o catalogo se conecta aos cards, categorias e detalhes?

## Answer

A superficie canonica e packages/web/app/vitrine.tsx. Ela agora oferece fluxo mobile dedicado com grid de duas colunas, primeiro card destacado, navegacao inferior, paineis de categorias, filtros e salvos, carregamento progressivo e conexao com /bizu/[slug]. A pagina de detalhe ganhou favoritos, CTA fixo e relacionados por categoria real.

## Outcome

- Signal: useful

## Source Nodes

- Vitrine()
- vitrine.tsx
- VitrineProduct