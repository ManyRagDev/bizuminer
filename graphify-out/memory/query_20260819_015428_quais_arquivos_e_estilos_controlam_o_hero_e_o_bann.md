---
type: "query"
date: "2026-08-19T01:54:28.735282+00:00"
question: "Quais arquivos e estilos controlam o hero e o banner de produto da home do BizuMiner?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Vitrine()", "VitrineProduct", "BizuMiner Hero Banner"]
---

# Q: Quais arquivos e estilos controlam o hero e o banner de produto da home do BizuMiner?

## Answer

Expanded from original query via graph vocab: [hero, banner, vitrine, product, products, style, home]. O grafo liga Vitrine() e VitrineProduct a packages/web/app/vitrine.tsx e o banner de marca a packages/web/public/hero-bizuminer.png. A inspeção do código confirma que o markup do carrossel está em vitrine.tsx e proporção, largura, recorte e breakpoints em packages/web/app/globals.css; o redesenho não exige banco nem API.

## Outcome

- Signal: useful

## Source Nodes

- Vitrine()
- VitrineProduct
- BizuMiner Hero Banner