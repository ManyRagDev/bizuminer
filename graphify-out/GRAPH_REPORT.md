# Graph Report - .  (2026-08-18)

## Corpus Check
- 156 files · ~324,247 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 719 nodes · 961 edges · 69 communities (39 shown, 30 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Captura de ofertas
- Links afiliados Mercado Livre
- Estratégia do produto
- Ferramentas do Sites
- Persistência e ingestão
- Configuração TypeScript Sites
- Telemetria e banco
- Configuração TypeScript Web
- Dependências da vitrine
- Persistência do Sites
- Configuração TypeScript Persistence
- Rotas da vitrine
- Configuração TypeScript Capture
- Geração de apresentações
- Dependências de persistência
- Dependências de captura
- Planejamento do Garimpa
- Pesquisa de mercado
- Fonte pública Mercado Livre
- Autenticação ChatGPT Sites
- Banco D1 demonstrativo
- Pesquisa sobre GraphRAG
- Worker Cloudflare
- Protótipo estático Sites
- Preview social BizuMiner
- Hero BizuMiner Web
- Canais de distribuição
- Layout do Sites
- Hero BizuMiner Sites
- Engenharia reversa afiliada
- Identidade opcional ChatGPT
- Testes renderizados Sites
- Ícone BizuMiner Web
- Multi-tenancy e RLS
- Favicon do Sites
- Ícone de arquivo
- Ícone de globo
- Sistema visual BizuMiner
- Ícone de janela
- Layout da vitrine Web
- Separação captura afiliação
- Compliance de plataforma
- Viabilidade para clientes
- Snapshots da Shopee
- Aquisição e planos
- Regra do href real
- Telemetria de tokens
- Configuração ESLint Sites
- Configuração Next Sites
- Ambiente Next Sites
- Configuração PostCSS Sites
- Bindings D1 e R2
- Configuração Vite Sites
- Configuração Next Web
- Ambiente Next Web
- Migração de audiência
- Filas por marketplace
- Tenant por tabela
- Curadoria de origem
- Proibição de headless
- Modelo de dados
- Conversão em um clique
- Mapeamento defensivo
- Rate limit com jitter
- Dinheiro em centavos
- Refresh token Mercado Livre
- Erros de captura

## God Nodes (most connected - your core abstractions)
1. `CaptureContext` - 28 edges
2. `Credential` - 21 edges
3. `compilerOptions` - 15 edges
4. `compilerOptions` - 15 edges
5. `CaptureError` - 14 edges
6. `CaptureAdapter` - 14 edges
7. `MercadoLivreTokenManager` - 13 edges
8. `FetchParams` - 13 edges
9. `compilerOptions` - 13 edges
10. `compilerOptions` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Desconto verificado` --semantically_similar_to--> `Desconto verificado por histórico próprio`  [INFERRED] [semantically similar]
  docs/estrategia/plano-de-negocio-90-dias.md → README.md
- `Desconto declarado versus desconto verificado` --semantically_similar_to--> `Desconto verificado`  [INFERRED] [semantically similar]
  packages/capture/README.md → docs/apresentacoes/dashboard-executivo.html
- `Separação entre captura e afiliação` --semantically_similar_to--> `Módulo Afiliação`  [INFERRED] [semantically similar]
  packages/capture/README.md → docs/apresentacoes/dashboard-executivo.html
- `Captura de zero itens como erro` --semantically_similar_to--> `Alerta de captura zerada`  [INFERRED] [semantically similar]
  packages/persistence/README.md → docs/apresentacoes/dashboard-executivo.html
- `Desconto declarado versus desconto verificado` --shares_data_with--> `Histórico de preço em intervalos`  [INFERRED]
  packages/capture/README.md → docs/apresentacoes/dashboard-executivo.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Validação interna progressiva** — docs_estrategia_brief_produto_ofertas_tese_de_eficiencia, docs_estrategia_brief_produto_ofertas_tese_de_acessibilidade, docs_estrategia_brief_produto_ofertas_prova_social_dupla [EXTRACTED 1.00]
- **Canais oficiais e assistidos da Garimpa** — readme_telegram_bot_api, readme_whatsapp_compartilhamento_manual, readme_whatsapp_cloud_api [EXTRACTED 1.00]
- **Módulos integrados do produto** — docs_estrategia_plano_de_negocio_90_dias_garimpo, docs_estrategia_plano_de_negocio_90_dias_afiliacao, docs_estrategia_plano_de_negocio_90_dias_curadoria_e_disparo, docs_estrategia_plano_de_negocio_90_dias_migracao_de_audiencia [EXTRACTED 1.00]
- **Dependências centrais do motor de curadoria** — docs_tecnico_plano_motor_curadoria_m1_verdade_e_cron, docs_tecnico_plano_motor_curadoria_m2_categoria, docs_tecnico_plano_motor_curadoria_m3_alerta_preco, docs_tecnico_plano_motor_curadoria_m4_curadoria_editorial [EXTRACTED 1.00]
- **Vitrine dependente de contratos reais** — docs_tecnico_plano_ux_vitrine_contrato_motor_web, docs_tecnico_plano_ux_vitrine_ux2_pagina_produto, docs_tecnico_plano_ux_vitrine_ux3_mina_navegavel, docs_tecnico_plano_ux_vitrine_sem_dado_simulado [EXTRACTED 1.00]
- **Drift sem Git obrigatório** — newllm_base_manifest, newllm_drift_diff_json, newllm_estado_nao_atividade, newllm_reconciliacao_periodica [EXTRACTED 1.00]
- **Três frentes de valor** — docs_apresentacoes_dashboard_executivo_verified_discount, docs_apresentacoes_dashboard_executivo_source_curatorship, docs_apresentacoes_dashboard_executivo_compliant_operation [EXTRACTED 1.00]
- **Fundações não-retrofitáveis** — docs_apresentacoes_dashboard_executivo_multitenant_rls_foundation, docs_apresentacoes_dashboard_executivo_interval_price_history_foundation, docs_apresentacoes_dashboard_executivo_marketplace_queue_isolation, docs_apresentacoes_dashboard_executivo_zero_capture_alert [EXTRACTED 1.00]
- **Superfície de dados dos cards de oferta** — packages_capture_test_fixtures_ofertas_sample_offer_cards, packages_capture_test_fixtures_ofertas_sample_rating_sales_metadata, packages_capture_test_fixtures_ofertas_sample_offer_price_metadata, packages_capture_test_fixtures_ofertas_sample_shipping_metadata [EXTRACTED 1.00]
- **BizuMiner Hero Brand Expression** — packages_site_public_hero_bizuminer_bizuminer_brand_wordmark, packages_site_public_hero_bizuminer_good_tip_worth_gold_message, packages_site_public_hero_bizuminer_deep_curatorship_tagline, packages_site_public_hero_bizuminer_curated_lifestyle_products, packages_site_public_hero_bizuminer_editorial_collage_aesthetic, packages_site_public_hero_bizuminer_blue_lime_visual_system, packages_site_public_hero_bizuminer_serif_sans_typographic_contrast [INFERRED 0.85]
- **BizuMiner social brand message** — packages_site_public_og_bizuminer_wordmark, packages_site_public_og_um_bizu_bom_vale_ouro, packages_site_public_og_curadoria_em_profundidade, packages_site_public_og_produtos_de_rotina [INFERRED 0.85]
- **BizuMiner hero brand proposition** — packages_web_public_hero_bizuminer_bizuminer_wordmark, packages_web_public_hero_bizuminer_um_bizu_bom_vale_ouro, packages_web_public_hero_bizuminer_curadoria_em_profundidade, packages_web_public_hero_bizuminer_produtos_de_casa_e_rotina [INFERRED 0.85]

## Communities (69 total, 30 thin omitted)

### Community 0 - "Captura de ofertas"
Cohesion: 0.06
Nodes (56): cursorToPage(), MercadoLivreDealsAdapter, MercadoLivreDealsAdapterOptions, parseCard(), parseDealsHtml(), parseMoneyAria(), cursorToOffset(), mapSearchItem() (+48 more)

### Community 1 - "Links afiliados Mercado Livre"
Cohesion: 0.06
Nodes (31): arg(), main(), runTrace(), SearchResult, env(), main(), throwaway, buildAffiliateLink() (+23 more)

### Community 2 - "Estratégia do produto"
Cohesion: 0.04
Nodes (49): Cobertura de ponta a ponta, Histórico de preço por SKU, Multi-tenancy desde o início, MVP vertical: uma fonte e um canal, OfertaFlow, Prova social dupla, Tag do próprio cliente, Tese de acessibilidade (+41 more)

### Community 3 - "Ferramentas do Sites"
Cohesion: 0.04
Nodes (47): @cloudflare/vite-plugin, drizzle-kit, eslint, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-react, eslint-plugin-react-hooks, globals (+39 more)

### Community 4 - "Persistência e ingestão"
Cohesion: 0.07
Nodes (17): adapter, args, cred, ctx, pages, sweep(), SweepOptions, SweepSummary (+9 more)

### Community 5 - "Configuração TypeScript Sites"
Cohesion: 0.07
Nodes (27): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+19 more)

### Community 6 - "Telemetria e banco"
Cohesion: 0.08
Nodes (27): Contador de cliques em lotes, Telemetria própria de saída, capture_run, click_event, Desconto verificado, marketplace como tabela, offer, price_observation por intervalos (+19 more)

### Community 7 - "Configuração TypeScript Web"
Cohesion: 0.08
Nodes (25): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+17 more)

### Community 8 - "Dependências da vitrine"
Cohesion: 0.08
Nodes (24): next, dependencies, next, postgres, react, react-dom, devDependencies, @types/node (+16 more)

### Community 9 - "Persistência do Sites"
Cohesion: 0.10
Nodes (20): drizzle-orm, dependencies, drizzle-orm, react, react-dom, engines, node, react (+12 more)

### Community 10 - "Configuração TypeScript Persistence"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, exactOptionalPropertyTypes, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+12 more)

### Community 11 - "Rotas da vitrine"
Cohesion: 0.18
Nodes (16): POST(), GET(), Home(), blurbFor(), brl(), Chip, chips, discountLabel() (+8 more)

### Community 12 - "Configuração TypeScript Capture"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, exactOptionalPropertyTypes, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+11 more)

### Community 13 - "Geração de apresentações"
Cohesion: 0.11
Nodes (14): cen, cunha, dec, fases, fund, mods, next, planos (+6 more)

### Community 14 - "Dependências de persistência"
Cohesion: 0.11
Nodes (17): dependencies, postgres, @types/node, devDependencies, typescript, engines, node, postgres (+9 more)

### Community 15 - "Dependências de captura"
Cohesion: 0.12
Nodes (15): dependencies, @types/node, devDependencies, typescript, engines, node, @types/node, typescript (+7 more)

### Community 16 - "Planejamento do Garimpa"
Cohesion: 0.18
Nodes (12): Módulo Garimpo, Histórico de preço em intervalos, Fosso temporal de histórico de preço, Desconto verificado, Alerta de captura zerada, Contrato CaptureAdapter, Desconto declarado versus desconto verificado, Procedência auditável da captura (+4 more)

### Community 17 - "Pesquisa de mercado"
Cohesion: 0.20
Nodes (10): Agenda de pesquisa Perplexity, Pesquisa da capacidade das APIs oficiais, Pesquisa de compliance de plataformas, Pesquisa competitiva aprofundada, Pesquisa de estrutura de custos, Pesquisa de estrutura societária, Pesquisa de go-to-market de micro-SaaS, Pesquisa de mercado de afiliados (+2 more)

### Community 18 - "Fonte pública Mercado Livre"
Cohesion: 0.22
Nodes (9): Captura do Mercado Livre pela página pública /ofertas, Amostra de cards de ofertas do Mercado Livre, Metadados de preço e desconto da oferta, Metadados de nota e volume vendido, Metadados de envio e fulfillment, Metadados acessíveis de produto, Filtros públicos de ofertas, Página pública de ofertas do Mercado Livre (+1 more)

### Community 19 - "Autenticação ChatGPT Sites"
Cohesion: 0.39
Nodes (8): chatGPTSignInPath(), chatGPTSignOutPath(), ChatGPTUser, getChatGPTUser(), isReservedAuthPath(), requireChatGPTUser(), safeDecodeURIComponent(), safeRelativeReturnPath()

### Community 20 - "Banco D1 demonstrativo"
Cohesion: 0.39
Nodes (5): getDb(), GET(), POST(), toRouteErrorMessage(), notes

### Community 21 - "Pesquisa sobre GraphRAG"
Cohesion: 0.25
Nodes (8): Base manifest de S₀, D₀ global de drift, Delta search lexical, Conversa sobre drift de índice e economia de tokens, Drift diff JSON, Drift mede estado, não atividade, Reconciliação periódica do ledger, Status CLEAN DIRTY GHOST NEW RENAMED

### Community 22 - "Worker Cloudflare"
Cohesion: 0.29
Nodes (3): Env, ExecutionContext, worker

### Community 24 - "Protótipo estático Sites"
Cohesion: 0.33
Nodes (4): categories, heroProducts, Product, products

### Community 25 - "Preview social BizuMiner"
Cohesion: 0.40
Nodes (6): BizuMiner Social Preview, BizuMiner wordmark, Colagem editorial em azul e lima, Curadoria em profundidade, Produtos de rotina e casa, Um bizu bom vale ouro

### Community 26 - "Hero BizuMiner Web"
Cohesion: 0.40
Nodes (6): BizuMiner Hero Banner, BizuMiner wordmark, Curadoria em profundidade, Identidade editorial azul e lima, Produtos de casa e rotina, Um bizu bom vale ouro

### Community 27 - "Canais de distribuição"
Cohesion: 0.40
Nodes (5): Arquitetura de canais, Módulo Curadoria e disparo, Telegram como canal principal, Distribuição manual em grupos de WhatsApp, Alertas pessoais de preço via WhatsApp Cloud API

### Community 29 - "Hero BizuMiner Sites"
Cohesion: 0.50
Nodes (5): BizuMiner Brand Wordmark, BizuMiner Hero Banner, Curated Lifestyle Product Arrangement, Curadoria em profundidade, Um bizu bom vale ouro

### Community 30 - "Engenharia reversa afiliada"
Cohesion: 0.50
Nodes (4): Mercado Livre — Engenharia Reversa do Link de Afiliado, Link de afiliado programático do Mercado Livre, Estratégia matt_full, Subatribuição por publicação

### Community 31 - "Identidade opcional ChatGPT"
Cohesion: 0.50
Nodes (4): Renderização dinâmica de páginas protegidas, Optional ChatGPT Sign-In, Conteúdo público anônimo, Workspace authentication headers

### Community 33 - "Ícone BizuMiner Web"
Cohesion: 0.67
Nodes (4): BizuMiner App Icon, bm Monogram, High-Contrast Black and Acid-Lime Brand Palette, Rounded Dark Tile

### Community 34 - "Multi-tenancy e RLS"
Cohesion: 0.67
Nodes (3): membership, Multi-tenancy com Row Level Security, Princípios irreversíveis do schema

### Community 35 - "Favicon do Sites"
Cohesion: 0.67
Nodes (3): Blue Tile Favicon, Four-part geometric mark, Layered blue palette

### Community 36 - "Ícone de arquivo"
Cohesion: 0.67
Nodes (3): Document File Icon, Document Text Lines, Folded Page Corner

### Community 37 - "Ícone de globo"
Cohesion: 0.67
Nodes (3): Global or web context, Globe Icon, Neutral monochrome icon style

### Community 38 - "Sistema visual BizuMiner"
Cohesion: 0.67
Nodes (3): Blue and Lime Visual System, Editorial Collage Aesthetic, Serif and Sans Typographic Contrast

### Community 39 - "Ícone de janela"
Cohesion: 0.67
Nodes (3): Browser Window Icon, Three Window Controls, Window Frame

## Knowledge Gaps
- **297 isolated node(s):** `SearchResult`, `throwaway`, `name`, `version`, `private` (+292 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CaptureContext` connect `Captura de ofertas` to `Links afiliados Mercado Livre`, `Persistência e ingestão`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Ferramentas do Sites` to `Persistência do Sites`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `Credential` connect `Captura de ofertas` to `Links afiliados Mercado Livre`, `Persistência e ingestão`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `SearchResult`, `throwaway`, `name` to the rest of the system?**
  _297 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Captura de ofertas` be split into smaller, more focused modules?**
  _Cohesion score 0.055523199378761406 - nodes in this community are weakly interconnected._
- **Should `Links afiliados Mercado Livre` be split into smaller, more focused modules?**
  _Cohesion score 0.05925925925925926 - nodes in this community are weakly interconnected._
- **Should `Estratégia do produto` be split into smaller, more focused modules?**
  _Cohesion score 0.04251700680272109 - nodes in this community are weakly interconnected._