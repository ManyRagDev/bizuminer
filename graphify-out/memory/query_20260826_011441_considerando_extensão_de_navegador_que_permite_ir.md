---
type: "query"
date: "2026-08-26T01:14:41.653230+00:00"
question: "Considerando extensão de navegador que permite ir adicionando os produtos. Melhor UX"
contributor: "graphify"
outcome: "useful"
source_nodes: ["product", "affiliate-link.ts", "affiliateLink()", "CaptureContext", "TokenBucket"]
---

# Q: Considerando extensão de navegador que permite ir adicionando os produtos. Melhor UX

## Answer

Expanded from original query via vocab: [extensions, capture, manual, product, offers, affiliate, afiliado, auth, token, link]. A extensão é a melhor casca de UX, mas depende primeiro de identidade e link por afiliado. Deve reutilizar o parser e persistência de captura, trocar CAPTURE_TOKEN global por token de dispositivo revogável associado ao afiliado, resolver tenant/affiliate no servidor e gerar links com a tag do dono da publicação sem fallback global. MVP: captura unitária após gesto explícito via activeTab, prévia e confirmação; sem varredura em background ou captura em lote.

## Outcome

- Signal: useful

## Source Nodes

- product
- affiliate-link.ts
- affiliateLink()
- CaptureContext
- TokenBucket