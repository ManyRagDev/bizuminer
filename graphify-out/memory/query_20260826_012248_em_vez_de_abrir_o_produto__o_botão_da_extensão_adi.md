---
type: "query"
date: "2026-08-26T01:22:48.700770+00:00"
question: "em vez de abrir o produto, o botão da extensão adicionar ao BizuMiner pode ser exibido no proprio catálogo? isso aceleraria os resultados para o usuário"
contributor: "graphify"
outcome: "useful"
source_nodes: ["product", "Amostra de cards de ofertas do Mercado Livre", "deals.ts", "CaptureContext"]
---

# Q: em vez de abrir o produto, o botão da extensão adicionar ao BizuMiner pode ser exibido no proprio catálogo? isso aceleraria os resultados para o usuário

## Answer

Expanded from original query via vocab: [extensions, capture, manual, card, cards, offers, product, mercadolivre, price, link]. Sim. O catálogo já expõe no DOM de cada card o href real, externalId via wid/path, título, preço atual em aria-label, preço anterior e imagem; a extensão pode injetar um botão por card e extrair/enviar apenas o card explicitamente clicado. MVP recomendado: usuário ativa o BizuMiner uma vez na aba via activeTab, a extensão decora os cards existentes e futuros com MutationObserver, e cada botão tem estados Adicionar, Salvando e Adicionado. Não fazer varredura automática, POST em lote ou captura de todos os cards.

## Outcome

- Signal: useful

## Source Nodes

- product
- Amostra de cards de ofertas do Mercado Livre
- deals.ts
- CaptureContext