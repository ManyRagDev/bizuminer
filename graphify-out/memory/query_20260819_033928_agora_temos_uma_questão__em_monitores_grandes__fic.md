---
type: "query"
date: "2026-08-19T03:39:28.046613+00:00"
question: "Agora temos uma questão: em monitores grandes, ficou bom, mas em monitor menor, a hero está maior do que a tela comporta. E um detalhe: não da pra clicar nos cards de destaque. Tem o \"ver detalhes\" mas é pouco. Pode ter um link na propria imagem em si."
contributor: "graphify"
outcome: "useful"
source_nodes: ["Vitrine()", "vitrine.tsx"]
---

# Q: Agora temos uma questão: em monitores grandes, ficou bom, mas em monitor menor, a hero está maior do que a tela comporta. E um detalhe: não da pra clicar nos cards de destaque. Tem o "ver detalhes" mas é pouco. Pode ter um link na propria imagem em si.

## Answer

Expanded from original query via graph vocab: [hero, banner, vitrine, product, card, link, click]. Vitrine() e vitrine.tsx localizaram a superfície canônica. Implementado: altura do hero limitada pela altura útil do viewport em desktop, compactação interna para monitores baixos, preservação de 720 px em telas grandes e imagem dos destaques convertida em link acessível para /bizu/[slug], com hover, foco, telemetria e bloqueio de clique após gesto horizontal. Validação: 1280x720 e 1366x768 acomodam hero mais controles dentro do viewport; 1920x1080 preserva 720 px; clique na imagem navegou para o detalhe; typecheck, 7 testes e build passaram.

## Outcome

- Signal: useful

## Source Nodes

- Vitrine()
- vitrine.tsx