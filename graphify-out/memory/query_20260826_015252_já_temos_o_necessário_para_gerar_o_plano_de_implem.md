---
type: "query"
date: "2026-08-26T01:52:52.088632+00:00"
question: "Já temos o necessário para gerar o plano de implementação?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["publication", "product", "Schema garimpa no Supabase Postgres", "Roadmap de Implementação", "CaptureContext"]
---

# Q: Já temos o necessário para gerar o plano de implementação?

## Answer

Expanded from original query via vocab: [plano, roadmap, affiliate, extensions, capture, auth, token, product, link, publication, schema, tenant]. Sim. Estão definidos o fluxo catalog-first, gesto explícito por produto, parser reutilizável, API BizuMiner como fronteira, token de dispositivo revogável, fila local temporária, banco como fonte de verdade, isolamento por afiliado, link server-side e ausência de fallback global. O plano pode assumir tabelas próprias affiliate_account, affiliate_marketplace_config e extension_device, preservando app_user como identidade. Cobrança e publicação na Chrome Web Store não bloqueiam o plano técnico.

## Outcome

- Signal: useful

## Source Nodes

- publication
- product
- Schema garimpa no Supabase Postgres
- Roadmap de Implementação
- CaptureContext