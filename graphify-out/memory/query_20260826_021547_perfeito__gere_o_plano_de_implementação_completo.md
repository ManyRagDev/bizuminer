---
type: "query"
date: "2026-08-26T02:15:47.495935+00:00"
question: "perfeito! Gere o plano de implementação completo, considerando que vou deixar uma outra sessão aqui no codex com o modelo Terra (médio) rodando fazendo a implementação."
contributor: "graphify"
outcome: "useful"
source_nodes: ["publication", "product", "affiliate-link.ts", "Schema garimpa no Supabase Postgres"]
---

# Q: perfeito! Gere o plano de implementação completo, considerando que vou deixar uma outra sessão aqui no codex com o modelo Terra (médio) rodando fazendo a implementação.

## Answer

Expanded from original query via vocab: [affiliate, capture, extension, token, publication, product, tenant, auth, link, supabase, schema]. O grafo confirmou que publication e product são o núcleo de persistência, affiliate-link.ts é a fronteira de atribuição, app_user/auth devem permanecer separados da conta de afiliado, e o schema garimpa/tenant_id precisa virar isolamento real antes da extensão. O plano foi registrado em docs/tecnico/plano-extensao-captura.md e o handoff Terra em docs/tecnico/handoff-extensao-captura-terra.md.

## Outcome

- Signal: useful

## Source Nodes

- publication
- product
- affiliate-link.ts
- Schema garimpa no Supabase Postgres