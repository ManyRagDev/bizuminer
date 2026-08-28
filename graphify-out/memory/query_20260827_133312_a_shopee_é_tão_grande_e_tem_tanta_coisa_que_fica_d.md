---
type: "query"
date: "2026-08-27T13:33:12.360004+00:00"
question: "A Shopee é tão grande e tem tanta coisa que fica difícil escolher. Capturar ofertas relâmpago, exibir até que dia e hora valem e usar as integrações para montar lojas específicas por área. O que você acha?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["ShopeeProductOfferResponse", "RawOffer", "mapProductNode()", "product", "price_observation por intervalos", "publication", "Vitrine()"]
---

# Q: A Shopee é tão grande e tem tanta coisa que fica difícil escolher. Capturar ofertas relâmpago, exibir até que dia e hora valem e usar as integrações para montar lojas específicas por área. O que você acha?

## Answer

Expansão usada: shopee, captura, ofertas, marketplace, api, produto, store, categoria, affiliate. A arquitetura suporta a direção: periodEndTime já é consultado e mapeado para RawOffer.endsAt, mas a persistência atual não leva esse campo ao banco/vitrine. Recomenda-se um único motor de oportunidades e várias vitrines temáticas configuráveis, com taxonomia muitos-para-muitos, curadoria e métricas por vertical; validar primeiro uma vertical como café antes de separar marcas ou domínios.

## Outcome

- Signal: useful

## Source Nodes

- ShopeeProductOfferResponse
- RawOffer
- mapProductNode()
- product
- price_observation por intervalos
- publication
- Vitrine()