# Roadmap de Tracks — BizuMiner

> **Registro de Execuções e Histórico de Evolução sob o Protocolo CONDUCTOR**

---

## Revisão operacional de 9 de novembro de 2026

Prioridade atual da conta local: fechar captura, catálogo, Pauta e link de afiliado para Shopee e AliExpress antes de retomar a track 015. A Pauta ainda exige confirmação manual para ofertas vindas só da API AliExpress. A captura assistida em teste pode usar o preço recente observado no navegador.

- [ ] **005-affiliate-redirect-and-lgpd** — Reaberta. Corrigir a contagem de cliques dos links assinados da Pauta. A atribuição ao afiliado foi validada para as 12 ofertas do WhatsApp, mas a saída assinada não alimenta `click_event`, usado pelo painel Resultados. [Plano para aprovação](./tracks/005-affiliate-redirect-and-lgpd/plan.md)
- [ ] **015-ga4-analytics-integration** — Reaberta para verificação do funil e do painel. A tag está em produção. A Data API retornou 3 eventos `affiliate_click` e 1 evento `share` no período de 30 dias até 9 de novembro, sem eventos `purchase` na consulta. O relatório no BizuMiner ainda está local. Restringir o acesso à propriedade global e distinguir ausência de dados de falha da API antes de publicar o painel. O registro de comissões no BizuMiner precisa ser validado com a fonte do programa de afiliados.
- [ ] **016-descoberta-departamentos-shopee-aliexpress** — Implementação local em revisão. Na última rodada publicada da Shopee, 5 das 10 consultas falharam. O modo por departamento ainda requer validar recortes, cotas e concorrência antes do piloto. [Plano existente](./tracks/016-descoberta-departamentos-shopee-aliexpress/plan.md)
- [ ] **014 — Cobertura de lojas na Pauta.** Corrigido o balanceamento em `composeLivePauta` (`pauta-policy.ts`), a classificação de famílias (`bolsas_mochilas`, `cameras_seguranca`, etc. em `product-family.ts`) e a hidratação do benefício da IA (`pauta-db.ts`). A Pauta WhatsApp passou a selecionar 6 Shopee + 6 Mercado Livre e Stories 4 Shopee + 4 Mercado Livre, distribuídos entre Casa, Tecnologia, Ferramentas, Fitness, Brinquedos e Beleza, com zero itens represados na triagem IA (`triage: 0`, `retry: 0`).
- [ ] **012 e 014 — Preço verificável do AliExpress na Pauta.** A seleção avaliou 187 candidatas do AliExpress. Todas exigiam confirmação de preço exato em reais e, entre elas, 81 também não tinham aprovação editorial. Validar como obter a evidência de uma opção antes de incluir essas ofertas.
- [ ] **004 e 016 — Cobertura de lojas na vitrine.** A página inicial abre a edição editorial, que exibiu 22 ofertas do AliExpress e 2 da Shopee, sem Mercado Livre. Os filtros públicos por loja retornaram 181 ofertas da Shopee, 106 do AliExpress e 41 do Mercado Livre. Validar a mistura da edição inicial separadamente do catálogo paginado e de seus filtros.
- [ ] **010 — Diagnóstico da extensão.** O Mercado Livre mostrou 54 produtos na página relatada e a extensão enviou 46. A importação e a triagem das ofertas novas foram verificadas. Falta registrar quais itens ficaram de fora e por quê.
- [x] **018-frescor-pauta-e-alerta-rodagens** — Concluída em 10/11/2026. Implementação do ciclo fechado de frescor: teto equilibrado multiloja (max 4 a 5 por loja no WhatsApp) com curva exponencial de frescor intra-loja em `pauta-policy.ts` (blindando contra o viés da última rodagem); semáforo visual de 3 tempos (🟢 fresco <3h, 🟡 atenção 3-10h, 🔴 expirando >10h ou virada de dia) com borda lateral e badges informativos nos cards da `/pauta`; e widget de telemetria "Saúde da Pauta & Próximas Rodagens" com semáforo por loja e ações rápidas no painel "Hoje" (`/admin`). [Plano](./tracks/018-frescor-pauta-e-alerta-rodagens/plan.md)
- [x] **020-enfileiramento-assincrono-extensao** — Concluída em 10/11/2026. Eliminação da espera manual do operador: enfileiramento local assíncrono na extensão (`queued: true`) quando o servidor estiver executando outro lote (ex: cron da Shopee), com retry automático em segundo plano via `chrome.alarms` silencioso a cada 30s, notificação amigável e badge com ampulheta âmbar (`⏳`) e sucesso verde (`✓`). Extensão v0.3.1 empacotada. [Plano](./tracks/020-enfileiramento-assincrono-extensao/plan.md)
- [ ] **019-cross-marketplace-matching-e-validacao-competitiva** — Backlog estratégico. Validação de piso competitivo cross-marketplace: cruzamento de modelos/EAN/família entre lojas monitoradas (Amazon vs ML vs Shopee) antes de publicar na Pauta, evitando indicar uma loja quando outra tiver o mesmo item mais barato; maturidade de histórico (distinção visual entre desconto com histórico de 30 dias consolidado vs recém-chegado com preço riscado de vitrine); e destaque obrigatório de benefícios logísticos (Prime/Full/Frete Grátis) na copy do WhatsApp para blindar a percepção de valor contra buscas externas com fretes abusivos.

---

- [ ] **017 — Captura em lote pela extensão.** Leitura de listagens reais confirmada no Vivaldi (32 ofertas do AliExpress e 69 da Amazon). O fluxo até a Pauta e o link afiliado passou em ambiente isolado. O piloto isolado importou 40 ofertas reais do AliExpress e 109 da Amazon. Para uma oferta por loja, validou o preço na Pauta e o destino afiliado. Pendente a liberação em produção. [Plano](./tracks/017-extensao-captura-amazon/plan.md)

## 📦 Histórico de Tracks Concluídas (Fundação do BizuMiner)

- [x] **001-core-schema-and-persistence** — Modelagem do schema `garimpa` no Supabase Postgres, tabelas de produto, observações append-only e auditoria de execução.
- [x] **002-mercadolivre-capture-adapter** — Implementação do adaptador de ofertas públicas do Mercado Livre com extração de evidências e integridade de tags de saída.
- [x] **003-price-history-engine** — Algoritmo de cálculo de piso histórico, mediana móvel e detecção de desconto real com proteção anti-falso desconto.
- [x] **004-web-vitrine-and-product-page** — Vitrine pública veloz em Next.js 15, filtros dinâmicos, paginação honesta e página de produto detalhada com histórico em gráfico.
- [x] **006-transit-pass-direct-link** — Modo de passagem direta (`?direto=1`) com contador de 3s para o marketplace, botão de retenção e proteção anti-loop no histórico do navegador.
- [x] **007-member-area-and-auth** — Área do cliente (`/minha-area`) com login social Google via Supabase Auth, fusão de identidade anônima e gestão de favoritos.
- [x] **008-admin-command-center** — Painel de telemetria e controle do dono (`/admin`) com status de rodagens, saúde do banco e disparo de coletas.
- [x] **009-composer-and-copy-generator** — Composer web para geração de copies de alta conversão prontas para cópia manual para o WhatsApp e Telegram.
- [x] **010-chrome-extension-capture** — Extensão Chrome Manifest V3 para captura assistida e ativação de catálogo no navegador.
- [x] **011-shopee-graphql-adapter** — Cliente oficial da Open API da Shopee com consultas GraphQL tipadas, retries e autenticação por chaves de afiliado.
- [x] **012-aliexpress-top-api-adapter** — Cliente oficial da Open API do AliExpress com conversão cambial garantida para BRL e identificação de subcategorias.
- [x] **013-ai-curation-engine-gemini** — Motor de triagem com Google Gemini para avaliação semântica de atratividade, conformidade de preço e pontuação editorial.
- [x] **014-pauta-and-editorial-selection** — Sistema de curadoria e seleção de pauta diária com rotatividade de ofertas, desempate por frescor e relevância.
- [x] **017-extensao-captura-amazon** — Concluída em 09/11/2026. Adaptação da extensão Chrome de retaguarda para captura assistida na Amazon Brasil (ASIN, preço, fotos), persistência de produto/observação, resolução monetizada canônica com tag de afiliado via `/go/[slug]`, registro de marketplace e disclaimer legal na vitrine. [Plano](./tracks/017-extensao-captura-amazon/plan.md)
