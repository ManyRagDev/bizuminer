---
type: "query"
date: "2026-08-26T01:29:08.234669+00:00"
question: "E com relação ao comportamento esperado ao clicar, ele vai direto via token para o supabase, ou os links capturados ficam na extensão?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["product", "Schema garimpa no Supabase Postgres", "store.ts", "CaptureContext"]
---

# Q: E com relação ao comportamento esperado ao clicar, ele vai direto via token para o supabase, ou os links capturados ficam na extensão?

## Answer

Expanded from original query via vocab: [extensions, capture, manual, api, route, auth, token, supabase, persist, store, product]. O clique deve fazer POST imediato para uma API do BizuMiner, autenticada por token de dispositivo revogável ou JWT de usuário; a extensão nunca recebe chave secret/service_role nem grava diretamente no Supabase. O backend valida a identidade, resolve affiliate_id/tenant_id e chama a persistência existente via DATABASE_URL. A extensão mantém apenas cache visual e uma outbox temporária para falhas de rede, removida após confirmação do servidor. O banco é a fonte de verdade.

## Outcome

- Signal: useful

## Source Nodes

- product
- Schema garimpa no Supabase Postgres
- store.ts
- CaptureContext