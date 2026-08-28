---
type: "query"
date: "2026-08-27T15:27:50.715587+00:00"
question: "Pensando do ponto de vista de branding das outras vitrines, eu havia considerado inicialmente serem vários domínios. Mas sendo o mesmo motor, trabalharíamos com um domínio e rotas pra cada tipo de loja?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Vitrine()", "BizuMiner Brand Wordmark", "[slug]/route.ts", "tenant_id em toda tabela com RLS", "store.ts"]
---

# Q: Pensando do ponto de vista de branding das outras vitrines, eu havia considerado inicialmente serem vários domínios. Mas sendo o mesmo motor, trabalharíamos com um domínio e rotas pra cada tipo de loja?

## Answer

Expansão usada: brand, route, site, slug, store, tenant, affiliate, vitrine. O mesmo motor não exige o mesmo domínio. Recomendação: começar com bizuminer.com.br/cafe e demais rotas para validar verticais e concentrar confiança, SEO e operação; modelar storefront com slug e hostname opcional para permitir que verticais vencedoras ganhem domínio e identidade próprios depois, atendidas pelo mesmo app, catálogo, captura e banco. Manter uma URL canônica por produto para evitar duplicação entre vitrines.

## Outcome

- Signal: useful

## Source Nodes

- Vitrine()
- BizuMiner Brand Wordmark
- [slug]/route.ts
- tenant_id em toda tabela com RLS
- store.ts