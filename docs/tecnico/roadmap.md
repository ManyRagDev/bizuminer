# Roadmap de Implementação

> **Régua de 20/08/2026:** o documento mestre do projeto passou a ser [`docs/estado-do-projeto.md`](../estado-do-projeto.md). Este roadmap continua sendo o registro de fases e de execução; o estado consolidado e o modelo de distribuição vivem lá.

**Documento vivo — decidido em 18/08/2026.** Detalha as fases até a página web pública, mantendo o horizonte sem pular etapas de validação.

Contexto: ML affiliation 🟢 provado em campo (4 cliques no painel), captura /ofertas 🟢 (`MercadoLivreDealsAdapter`, 70/70), Shopee 🟡 (bloqueio externo), persistência/worker/publicação 🔴.

---

## Phase 2 — Persistência mínima + ingestão (atual)

**Objetivo:** cada varredura de `/ofertas` vira dado permanente: produto, preço observado, execução.

- Novo `packages/persistence`:
  - Schema no **Supabase (Postgres), schema `garimpa`** no projeto Brincar/PostSpark — sem Prisma, migrations SQL puras via `supabase db push`: `product`, `price_observation`, `capture_run`, e já `publication` + `click_event` (a página web da Phase 3 grava nelas; criar depois seria refatorar o banco com a página no ar)
  - `tenant_id` presente desde o início em toda tabela de negócio (princípio do modelo-de-dados.md — irreversível depois)
  - Interface `OfferStore` + `InMemoryStore` (testes e CLI rodam sem banco; implementação Postgres entra via connection string)
- Serviço de ingestão `sweep()`: consome `adapter.streamOffers`, faz upsert de produto, insere `price_observation`, detecta mudança de preço, registra `capture_run` com contadores — inclusive o alerta de "zero itens" (scraper quebra em silêncio)
- CLI `bin/sweep.ts`: varredura ao vivo via `MercadoLivreDealsAdapter`; usa `PostgresStore` quando `DATABASE_URL` existe (senão memória) + resumo no console
- **Banco real: ✅ em produção (18/08/2026)** — migration inicial aplicada; role dedicado `garimpa_app` (privilégio mínimo, só o schema `garimpa`, connection string no `.env` via session pooler `aws-1`); `PostgresStore` validado ao vivo: 3 varreduras, 177 produtos, 529 observações, 176 produtos com histórico ≥ 2 preços, Top 10 por desconto lido do banco. Detalhe técnico: upsert atômico em CTE (uma viagem ao pooler), `(xmax = 0)` detecta insert novo, `left join` com snapshot anterior captura o preço previamente observado.

**Critério de saída:** ingestão testada ponta a ponta (fixture → store), `capture_run` detectando página vazia.

## Phase 3 — Página web pública de promoções (atual)

**Objetivo:** vitrine pública com as melhores ofertas, atualizada dinamicamente, com telemetria própria de cliques.

- Stack: ✅ **Next.js (App Router)** — decidido 18/08/2026 (ver tabela de decisões)
- Página `/` : 🟡 `packages/web` — ofertas de `product` × `price_observation` (lateral joins: última observação + menor preço histórico). **Correções de registro (17/08 — auditoria de UX):** a página roda `force-dynamic` (não ISR 15 min como registrado antes; consulta ao banco a cada request); e o badge "menor preço já observado" tem bug de semântica — o mínimo inclui a observação atual, então todo produto novo exibe o selo (24/24 na vitrine). Correção planejada em `plano-motor-curadoria.md` (M1-B)
- Endpoint `/go/[slug]` : ✅ route handler — upserta `publication` (slug determinístico `ml-<external_id>`, canal `web`), grava `click_event` (IP só como hash SHA-256 salado — LGPD), 302 para link afiliado `matt_full` com `subId = slug`. **Validado ponta a ponta em 18/08**: publication criada, click_event gravado, redirect com `matt_word=juem4482159_ml-MLB55868679&matt_tool=99838509&forceInApp=true`
- Identidade visual: 🟡 **registro desatualizado.** O que está no código (17/08) é a identidade **BizuMiner** (papel `#f3f0e8`, azul `#3347ff`, verde-ácido `#dfff70`, Arial + Georgia do sistema), não o "garimpo de ouro" escuro/dourado registrado antes. A decisão de tipografia via `next/font` auto-hospedada (Sora + Plus Jakarta, zero requisição externa) se perdeu no redesign — decidir se volta como parte da identidade BizuMiner (ver `plano-ux-vitrine.md`, fase UX-3)
- Env: `ML_TRACKING_ID` + `ML_TOOL_ID` no `.env` (valores provados em campo)
- Pendências: deploy público (Vercel/host próprio), revalidate on-demand no hook da varredura, sitemap/robots, unescape de entidades HTML nos títulos
- **Planos de continuação (17/08/2026, pós-diagnóstico de UX)** — duas instâncias separadas, cada uma com fases, contratos e verificação próprios:
  - `plano-ux-vitrine.md` — interface (`packages/web`): contrato editorial B2C, evidência do Mercado Livre, conversão em 1 clique, página `/bizu/[slug]`, navegação e retenção
  - `plano-motor-curadoria.md` — dados/backend: **M1-A** captura e persiste nota/rótulo de vendidos e corrige entidades HTML; **M1-B** torna preço/ranking honestos; **M1-C** agenda varredura, entrega detalhe e revalidação. Depois vêm categoria, alerta e curadoria própria
  - Ordem fechada de início: **M1-A → M1-B → UX-0/UX-1**. Nota do Mercado Livre e score BizuMiner são fontes diferentes e nunca compartilham rótulo ou escala visual
- Incidente registrado: corrupção de encoding por edição via PowerShell (ver "Regras de operação") — corrigido, validado no HTML renderizado

### Atualização de execução — 18/08/2026 (🟡 aguardando conferência)

- M1-A: evidências de nota e rótulo de vendidos já chegam do Mercado Livre à vitrine; campos ausentes ficam ocultos.
- M1-B: regra de menor preço corrigida e verificada contra o banco; nenhum produto novo recebe mais selo indevido. A interface informa quantidade de registros e período monitorado sem rotular um estado abstrato de “formação”.
- M2: categoria foi adicionada e tem 75,9% de cobertura real (220/290), usando heurística auditável e mantendo incerteza como nula.
- UX-1/UX-3: primeiro viewport, cards de decisão, CTA afiliado em um clique, filtros separados, ordenação e carregamento progressivo foram implementados em `packages/web`.
- UX-2 parcial: rota `/bizu/[slug]` com histórico real/CTA está disponível; OG, sitemap/robots e ISR seguem pendentes com M1-C.
- Bloqueios que não foram simulados: cron de varredura, revalidação on-demand, alerta de preço/e-mail e score editorial dependem de infraestrutura, provedor e/ou dados ainda não definidos.
- **Segurança antes do deploy público:** auditoria do Supabase em 18/08 confirmou RLS desabilitada em `garimpa.product`, `price_observation`, `capture_run`, `publication` e `click_event`. Não habilitar RLS sem desenhar e testar políticas, pois a app atual conecta com role de servidor. Decidir se o schema sai da exposição Data API ou se recebe RLS/políticas de mínimo privilégio antes do deploy.

### Atualização: carrossel, linguagem e captura auditável — 18/08/2026 (🟡 aguardando conferência)

- O hero rasterizado foi substituído por carrossel editorial em HTML/CSS, de largura integral, com composição de produtos reais, texto selecionável e imagens sem corte (`object-fit: contain`).
- A linguagem pública abandonou “sinal”, “sinal em formação” e “Explore a mina”. A navegação e o histórico agora usam termos literais: ofertas monitoradas, registros de preço, período monitorado, categorias e destaques selecionados.
- Cada varredura cria primeiro um `capture_run`; cada produto encontrado recebe exatamente uma `price_observation` ligada à execução, inclusive quando o preço não muda. A coleta real de 18/08 gravou 183 produtos e 183 observações vinculadas.
- A home lê a execução bem-sucedida mais recente que tenha observações vinculadas, preservando as linhas antigas para auditoria e mantendo fallback para o legado sem proveniência reconstruível.
- Busca e paginação continuam server-side: 24 produtos por página, 183 ofertas atuais e 8 páginas na execução verificada.
- Ainda ficam fora desta entrega: agendamento recorrente, prazo de retenção `X`, inferência de indisponibilidade, revalidação on-demand e decisão de RLS antes do deploy público.

### Atualização: área do comprador + painel administrativo — 19/08/2026 (🟡 aguardando conferência)

Plano próprio criado: `plano-area-logada.md` (decisão do dono: sem autenticação nesta fase; identidade pré-auth por cookie `bm_uid` + `app_user.auth_user_id` nulo para o merge futuro).

- **Reparo:** `garimpa.subscriber` não existia no banco (migration de 17/08 nunca aplicada) — `/api/newsletter` respondia 500 em silêncio. Migration aplicada e endpoint validado ao vivo (`ok:true`).
- **AL-0/AL-1/AL-2:** tabelas `app_user`, `favorite`, `price_watch`, `buyer_profile` criadas (migrations versionadas + aplicadas via MCP); `/minha-area` com salvos sincronizados (coração da vitrine e do detalhe agora espelham no servidor; botão de migração do localStorage), acompanhamento de preço com baseline e ticker de movimento derivado, recomendações v1 com o porquê declarado por item e perfil do comprador validado contra categorias reais.
- **AD-1:** `/admin` com telemetria (produtos, observações, cliques 7d, publicações, assinantes, área do comprador), tabela de rodagens com destaque para vazia/erro e acionamento de rodagem real por `spawn` do `sweep.ts` (trava de execução simultânea; o registro continua nascendo no próprio robô).
- **Validação real 19/08:** favorito → banco (user `b4685925…`), watch com baseline `R$ 437,46` = observação real, perfil gravado, rodagem acionada pelo painel completou `ok` (38 itens, 11 novos, 12 mudanças, 38 observações vinculadas). `verify:member-area`: todos os checks. Web: typecheck, 23 testes, build ok; mobile 375px sem overflow.
- **Fora desta entrega:** autenticação (AL-3), alerta por e-mail (AL-4/M3), gate do admin. **Admin sem autenticação e RLS desabilitada continuam bloqueios duros pré-deploy público.**

**Depende de:** Phase 2 (sem histórico de preço a página é volátil e sem diferencial).

## Phase 4 — Distribuição e validação final

- Bot Telegram consumindo a mesma curadoria (subId próprio por canal)
- Teste de comissão real (compra via link gerado) — destrava a afirmação "ciclo completo"
- Shopee: retomar quando o bloqueio externo mudar

## Sequenciamento consolidado — revisão UX de 18/08/2026

As fases abaixo são executadas **uma por vez**. Estimativas são faixas para um implementador com o repositório já configurado; não são promessa de calendário e não incluem espera de 48h da captura agendada.

| Ordem | Entrega fechada | Tamanho | Dependência dura | Resultado verificável |
|---|---|---:|---|---|
| D0 | UX-0: contrato editorial + `packages/web` canônico | 0,5–1 dia | decisão dos sócios sobre B2C × B2B | mapa de copy aprovado, sem promessa inexistente |
| D1 | M1-A: nota/vendidos do ML + decode de títulos 🟡 | 1–2 dias | nenhuma | fonte → banco comprovada por script |
| D2 | M1-B: menor preço honesto + ranking | 1–2 dias | D1 | produto novo sem selo falso; ranking deixa de ser desconto declarado |
| D3 | UX-1: primeiro viewport + cards + 1 clique | 2–3 dias | D1–D2 | proposta clara, evidência rotulada, CTA visível, mobile/a11y verificados |
| D4 | M1-C: cron + `dealDetail` + revalidação | 1–2 dias + 48h | D2 | histórico cresce sozinho e detalhe tem contrato estável |
| D5 | UX-2: `/bizu/[slug]`, histórico e OG | 2–4 dias | D4 | URL compartilhável, indexável e com clique afiliado |
| D6 | M2: categoria honesta | 1–2 dias | D1 | cobertura de categoria medida; incerteza permanece nula |
| D7 | UX-3: filtros, ordenação e densidade | 2–3 dias | D5–D6 | navegação preserva estado e reduz fadiga da grade |
| D8 | M3: alerta de preço | 2–3 dias | D4 | inscrição → queda → e-mail → descadastro, provados no banco |
| D9 | UX-4A: favoritos, alerta, newsletter e transparência | 1–2 dias | D8 | retenção funcional sem misturar dados e opinião |
| D10 | M4: curadoria editorial + score explicável | 2–3 dias | D2 | blurbs únicos e score separado da nota do ML |
| D11 | UX-4B: camadas, “não compre se” e área B2B | 2–3 dias | D9–D10 | metodologia vira interação e passa em teste humano de compreensão |

**Faixa total:** aproximadamente 18–30 dias úteis de implementação, mais os períodos de observação real. Se for preciso lançar antes, o corte honesto é D0–D5; D6–D11 formam a evolução pós-lançamento.

### Métricas de produto desde D3

- Taxa de saída afiliada por impressão de produto, não apenas total de cliques.
- Tempo até a primeira ação útil: busca, filtro, favorito ou clique em oferta.
- Busca sem resultado e recuperação após estado vazio.
- Uso de filtro/ordenação e retorno à lista sem perda de contexto.
- Conversão de favorito/alerta/newsletter sem armazenar PII em evento analítico.
- Cobertura e frescor de `rating_star`/`sales_label`; incidência de título com entidade crua deve ser zero.
- Guardrails: LCP mobile, CLS, acessibilidade, erro no `/go`, captura vazia e descadastro.

Não existe baseline público confiável enquanto o deploy estiver pendente. Portanto D3 instala a medição; decisões de otimização posteriores usam janelas de 14 dias ou volume mínimo acordado, não impressão subjetiva de um único dia.

## Decisões registradas

| Decisão | Valor | Motivo |
|---|---|---|
| Rotação de credenciais ML | só antes da produção | testes rodam apenas na máquina local |
| Puppeteer/headless | nunca | ToS; risco recai sobre conta do cliente |
| Fonte de descoberta ML | `/ofertas` público (`http_html`) | API de busca 403 p/ não certificadas |
| Link afiliado | href real do card + `matt_*` (regra de ouro §4) | provado em campo 17–18/08 |
| Métricas de clique | telemetria própria (`click_event` + subId) | painel ML é batchado/atrasado |
| Stack web (Phase 3) | **Next.js (App Router)** | ISR madura p/ regenerar a vitrine a cada varredura; `/go/:slug` como route handler na mesma app; escala p/ dashboard Fase 4; SEO/GEO equivalente a Astro com SSG/ISR bem configurado |

## Regras de operação do repositório

- **Edição de arquivos sempre via editor de arquivo (UTF-8), nunca via PowerShell.** `Get-Content`/`Set-Content` no Windows PowerShell 5.1 lê/grava em encoding errado e corrompe acentuação (`preço` → `preÃ§o`) — incidente real em `packages/web/app/page.tsx` (18/08/2026). Shell fica para executar comandos, npm, builds e queries — não para reescrever conteúdo de arquivo.
