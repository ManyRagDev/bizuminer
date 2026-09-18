---
type: "query"
date: "2026-09-01T02:47:34.285194+00:00"
question: "Como projetar a notificação e a tela específica para avaliação prática e séria dos produtos?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["product", "Curadoria em profundidade", "AdminTabs", "Composer"]
---

# Q: Como projetar a notificação e a tela específica para avaliação prática e séria dos produtos?

## Answer

Expanded via graph vocab: [product, products, curated, status, badge, preview, tabela, alerta]. Proposta UX: adicionar no painel um callout acionável e badge na aba Curadoria com a frase N produtos aguardam avaliação; abrir uma tela dedicada /admin/curadoria com fila rápida, produto em foco, evidências essenciais e ações Aprovar, Não publicar agora, Rejeitar e Revisar depois. Não usar questionário: aprovação em um clique; motivo estruturado obrigatório apenas para rejeitar ou adiar; detalhes em painel sob demanda; atalhos de teclado, undo e sessões de 20 itens. Em shadow mode, esconder o veredito da LLM até a decisão humana para evitar viés de ancoragem. Reaproveitar tokens visuais e estrutura de AdminTabs e Composer.

## Outcome

- Signal: useful

## Source Nodes

- product
- Curadoria em profundidade
- AdminTabs
- Composer