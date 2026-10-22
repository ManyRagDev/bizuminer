# 29 — Configuração Vercel

Guia oficial solicitado e consultado: https://vercel.com/get-started.md. A configuração é global para o agente; não cria outro projeto nem promove a candidata de aplicação.

- CLI Vercel 64.3.1 instalado globalmente e verificado.
- Login CLI concluído; `vercel whoami` confirmou `manyragdev`.
- Inspeção autenticada confirmou projeto `prj_fhslrWGdYJG5rdKnE8vkGmFSh3Ym`, nome `web`, equipe `emanuels-projects-aa92a126`, diretório `packages/web`, Next.js e Node24.x. O impedimento403 anterior foi superado no CLI; isso não comprova a versão da aplicação publicada.
- Plugin Vercel0.54.1 e suas orientações/comando `status` já disponíveis na sessão; reutilizados, sem instalar um segundo pacote de skills.
- `codex mcp add vercel --url https://mcp.vercel.com` adicionou o endpoint oficial compartilhado em `/home/many/.codex/config.toml`. O servidor Supabase existente foi preservado.
- OAuth do MCP concluído: uma tentativa anterior expirou sem callback; um novo `codex mcp login vercel` retornou sucesso. `codex mcp list` confirmou Vercel e Supabase habilitados com Auth OAuth. A tentativa adicional de entrada manual foi cancelada sem revogar o login concluído. Não armazenar/reutilizar códigos antigos.
- Atualização31: o novo servidor MCP Vercel carregou suas ferramentas e confirmou a equipe/projeto corretos por chamadas reais. O deployment de produção foi identificado em READY no commit43700c59. [Evidência31](evidencias/execucao-31-vercel-producao.json). O conector antigo continua sendo uma conexão distinta. Não é necessário repetir o login.

Nenhum deploy, migration, envio ou alteração comercial nesta etapa. A homologação e a condição técnica de produção do parecer28 continuam vigentes. Não registrar tokens ou parâmetros temporários de OAuth nos artefatos.

## Verificação posterior do Supabase

O login que o usuário já havia feito foi confirmado: `codex mcp list` informa OAuth, e chamadas reais MCP `get_project_url` e `list_migrations` concluíram com sucesso para `spbuwcwmxlycchuwhfir`. As três instalações V2 conhecidas permanecem no histórico; A/B/C substitutas não aparecem. Evidência: [execucao-30-supabase-autenticacao.json](evidencias/execucao-30-supabase-autenticacao.json). Nenhuma escrita remota. O impedimento anterior de acesso ao Supabase está resolvido; isso não substitui a reconciliação completa do catálogo/staging nem concede a aprovação de produção pendente.
