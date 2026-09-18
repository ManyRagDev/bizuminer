---
type: "query"
date: "2026-09-06T17:23:26.536694+00:00"
question: "Olhe como está o projeto agora e proponha o que fazer imediatamente; o agente já consegue limpar a base ou faltam recursos?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["product", "Vitrine()", "Schema garimpa no Supabase Postgres", "Saturação por espelhamento de ofertas", "Ranking por sinal de valor"]
---

# Q: Olhe como está o projeto agora e proponha o que fazer imediatamente; o agente já consegue limpar a base ou faltam recursos?

## Answer

Expanded via graph vocabulary: [curadoria, produto, produtos, decis, status, satura, snapshots, vitrine, supabase, postgres, base, audit]. Auditoria real em 2026-09-06: 744 produtos e estados íntegros; 72 approved, 6 rejected, 2 held, 165 pending e 499 legacy_visible. Há 195 legacy_visible vistos nos últimos 14 dias ainda elegíveis publicamente, portanto a promessa de curadoria não está estrita. 591 produtos não têm família, então a UX de grupos não resolve a maior parte. O código Gemini existente em packages/web/lib/curation.ts apenas reordena candidatos da pauta e não classifica product_curation, não aprende e não executa shadow mode. Chaves Gemini existem, mas Vertex AI ainda não está configurado e o SDK @google/generative-ai é legado. Recomendação imediata e reversível: gate público somente approved; não apagar produtos nem transformar saturação em rejeição; auditar os 72 aprovados; gerar uma classificação dry-run dos 664 pending+legacy com decisão, motivo e confiança; guardar sugestão separada da decisão humana; aplicar em lote apenas após revisão, começando por holds/rejeições óbvias. Recursos atuais bastam para iniciar uma triagem conservadora, mas faltam dataset derivado M4-F, registro separado de avaliação LLM, modo sombra M4-G e decisões explícitas para zonas cinzentas como suplementos, álcool, moda/piercing e itens médicos.

## Outcome

- Signal: useful

## Source Nodes

- product
- Vitrine()
- Schema garimpa no Supabase Postgres
- Saturação por espelhamento de ofertas
- Ranking por sinal de valor