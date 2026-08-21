---
type: "query"
date: "2026-08-19T03:17:10.871533+00:00"
question: "Como configurar o root directory e demais informações no Vercel?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["web/package.json", "web/next.config.ts", "Schema garimpa no Supabase Postgres"]
---

# Q: Como configurar o root directory e demais informações no Vercel?

## Answer

Expanded from original query via graph vocab: [web, next, package, root, build, config, env, postgres, supabase, url]. A aplicação publicável é packages/web: Next.js com npm run build, saída automática e três variáveis de runtime DATABASE_URL, ML_TRACKING_ID e ML_TOOL_ID. O next.config.ts aponta o tracing para a raiz do repositório, portanto a opção de incluir arquivos fora do Root Directory deve permanecer habilitada. Para Vercel serverless, DATABASE_URL deve usar o Transaction pooler do Supabase.

## Outcome

- Signal: useful

## Source Nodes

- web/package.json
- web/next.config.ts
- Schema garimpa no Supabase Postgres