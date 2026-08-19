# Plano de Implementação — UX da Vitrine (instância web)

**Documento vivo — criado em 17/08/2026, a partir do diagnóstico de UX da vitrine BizuMiner.**
Escopo: `packages/web` (Next.js App Router). A instância motor (dados/curadoria) tem plano próprio: `plano-motor-curadoria.md`. Este plano **consome** os contratos definidos lá; nunca os implementa.

Status: ✅ feito e conferido · 🟡 parcial (com o que falta explícito) · ⬜ não iniciado

---

## Achados da leitura do código (17/08/2026)

Fatos observados, não inferências:

1. **`page.tsx` usa `force-dynamic`** — cada request abre conexão no pooler Supabase e roda 2 lateral joins. O roadmap afirma "ISR 15 min, HTML estático"; a realidade diverge. Precisa reconciliar (ver M1-C no plano do motor + fase UX-2 aqui).
2. **Identidade real ≠ roadmap.** O site em produção local é BizuMiner (papel `#f3f0e8`, azul `#3347ff`, ácido `#dfff70`, Arial + Georgia do sistema). O roadmap descreve "garimpo de ouro" escuro com Sora/Plus Jakarta via `next/font`. A decisão "zero requisição externa de fonte (LGPD/perf)" se perdeu no redesign — Arial é do sistema (ok), mas a identidade tipográfica planejada não existe mais.
3. **Todos os 24 blurbs são idênticos** ("Está no menor preço desde que a gente começou a monitorar") porque `isLowest()` compara com um mínimo que **inclui a observação atual** — é trivialmente verdadeiro para produto novo. Correção é do motor (M1-B); a UI só deve exibir o selo quando o contrato disser que ele é válido.
4. **Fluxo de conversão tem 2 cliques** (card → modal → `/go/[slug]`), e a seta ↗ no card sinaliza saída externa que não acontece.
5. **Produto não tem URL** — modal não altera rota; zero compartilhamento e zero indexação de long-tail.
6. **Acessibilidade já boa** (focus-visible, aria-pressed, aria-live, reduced-motion, pausa de carrossel) — preservar. Gaps: modal sem `Esc`/focus-trap, nav some no mobile <820px sem hambúrguer, fontes de 8–10px em meta/disclosure/contador.
7. **`<img>` cru, sem `next/image`** — 24 imagens do ML sem lazy/srcset; hero é PNG com texto rasterizado.
8. **Botão "mandar um bizu" só mostra toast "em breve"** — CTA de seção inteira sem função.
9. **Existem duas superfícies visuais com objetivos diferentes.** `packages/web` é a vitrine ligada ao Supabase e ao redirect afiliado; `packages/site` ainda contém um protótipo estático do starter. Toda entrega visual precisa declarar `packages/web` como alvo e manter `packages/site` fora, salvo decisão explícita de migração.
10. **A avaliação do Mercado Livre está na fonte, mas não chega à UI.** Até M1-A, a frase “comparamos ... avaliação” está à frente da capacidade real e deve ser tratada como promessa pendente, não como fato implementado.
11. **Filtros misturam conceitos.** “Menor preço” é um estado/ordenação, enquanto “até R$100” e outras opções são faixas; a mesma linha faz papéis diferentes sem explicá-los.
12. **A direção editorial tem dois públicos.** “Não perca tempo procurando ofertas” resolve a dor do comprador e pertence ao primeiro viewport. “Automação de ofertas ... público qualificado” fala com marcas/afiliados e deve ficar na área de vendedores ou em rota própria; no hero ela confundiria a vitrine B2C.

---

## Contrato com o motor (fronteira entre instâncias)

A web consome, o motor entrega. Esboço de contrato **é** contrato — campo esquecido aqui vira campo perdido depois:

| Contrato | Entrega do motor | Fase web que consome |
|---|---|---|
| Evidência ML: `rating_star`, `sales_label`, `evidence_observed_at` | M1-A | UX-1 (prova no card) |
| `DealRow.lowest_verified: boolean` + `history_days`, `observation_count` | M1-B | UX-1 (selo honesto) |
| `dealDetail(slug)`: DealRow + `price_history: {observed_at, price_cents}[]` | M1-C | UX-2 (página + sparkline) |
| `product.category: string` | M2 | UX-3 (chips reais) |
| `POST` alerta de preço (email + product_id + consentimento) | M3 | UX-4 (CTA "me avisa se baixar") |
| Curadoria editorial: `blurb`, `score` (3 camadas) com fallback automático | M4 | UX-4 (narrativa própria + score) |

Enquanto um contrato não existe, a UI **degrada explicitamente** (esconde o selo/CTA), nunca simula o dado.

---

## Fase UX-0 — Contrato editorial + superfície canônica

**Objetivo:** decidir o que a página promete antes de alterar o visual e impedir trabalho na cópia errada.

- Superfície canônica: `packages/web`. `packages/site` recebe aviso explícito de protótipo/starter ou é arquivado em entrega própria; não sincronizar duas vitrines manualmente.
- Promessa B2C: economia de tempo + decisão confiável. Proposta-base: **“Você não perde tempo caçando ofertas. A BizuMiner cruza preço, histórico e avaliações do Mercado Livre para mostrar só o que merece atenção.”**
- Assinatura de marca preservada: “Um bizu bom vale ouro.” continua como frase memorável; a nova linha explica o serviço em linguagem funcional.
- Barra superior: preferir **“Curadoria do sinal à escolha · links de afiliado”**. “Ponta a ponta” só entra sem qualificador se o dono aceitar que esse percurso termina na recomendação, não na entrega do produto.
- Mensagem B2B fica fora do hero. Proposta para a área de vendedores: **“Automatizar ofertas é fácil. Conquistar público qualificado é outro jogo.”** A frase só é publicada junto de um canal real de contato e da declaração de independência editorial.

**Decisão do dono necessária:** BizuMiner é somente marca de curadoria para compradores ou também será a marca do produto B2B de automação? Até a resposta, a home permanece inequivocamente B2C.

**Critério de saída:** mapa de copy por seção aprovado por ambos os sócios; nenhuma frase promete dado ou serviço inexistente.

## Fase UX-1 — Primeiro viewport, evidência e conversão em 1 clique

**Depende de:** M1-A para nota/vendidos e M1-B para o selo de preço. Pode começar antes, mas os blocos de evidência ficam escondidos até o contrato real existir.

**Objetivo:** explicar o serviço em cinco segundos, mostrar prova suficiente e tornar a ação principal inequívoca.

- Hero em HTML/CSS, com texto selecionável e adaptável; manter a arte como composição, não como portadora exclusiva da mensagem. CTA primário “Explorar achados” e secundário “Como escolhemos”.
- Reduzir a altura do hero para que busca ou início do catálogo apareça no primeiro viewport de notebook sem destruir o impacto editorial.
- Card passa a exibir, quando disponível: `Nota no Mercado Livre`, rótulo de vendidos e horário/data da evidência. Nunca chamar vendidos de “avaliações”.
- `ver oferta ↗` vira **“Ver no Mercado Livre ↗”** e link direto `<a href="/go/[slug]" target="_blank" rel="noreferrer sponsored">`; remover o pedágio do modal para o clique de compra.
- Título e imagem podem abrir a página interna futura; enquanto UX-2 não existir, não fingem destino diferente. Coração nunca dispara saída afiliada.
- Selo “menor preço já visto” só aparece com `lowest_verified`; caso contrário, usar texto factual como “preço monitorado” ou omitir.
- Tipografia mínima de 11px para informação; corpo principal ≥16px no mobile; alvos de toque ≥44×44px; estados hover, focus, pressed, loading, sucesso e erro.
- Menu acessível abaixo de 820px; busca com botão textual/ícone compreensível; modal remanescente fecha com `Esc`, prende foco e devolve foco ao gatilho.
- `next/image` nos cards; hero com dimensões explícitas, `priority` só no primeiro slide e `sizes` por breakpoint.
- “Mandar um bizu” vira contato real; toast de erro persiste pelo menos 6s.
- Telemetria mínima e sem PII: impressão do catálogo, busca, filtro, favorito, newsletter e saída `/go`, suficiente para calcular clique por impressão. Não gravar e-mail em evento analítico.

**Fica de FORA:** página de produto, categoria real, alerta de preço, score BizuMiner e comparação.

**Critério de saída:** proposta + CTA entendidos no primeiro viewport; card→Mercado Livre em um clique; evidência da fonte corretamente rotulada; nenhuma entidade HTML crua; navegação íntegra em 360, 390, 768, 1024 e 1440px.

**Verificação:** typecheck · testes dos estados condicionais de evidência · navegação por teclado · axe/checagem de contraste · clique real registrando `click_event` · Lighthouse mobile com performance ≥85, acessibilidade ≥95 e CLS <0,1 · veredito humano de copy e estética.

## Fase UX-2 — Página de produto `/bizu/[slug]` + compartilhabilidade

**Objetivo:** cada bizu vira URL, e a URL vira conteúdo que se distribui sozinho.

**Depende de:** M1-C (`dealDetail` + histórico).

- Rota `/bizu/[slug]` com ISR (revalidate curto): título, imagem, preço/âncora, **sparkline SVG do histórico** (server-rendered, sem lib de chart), blurb (M4, com fallback), CTA único para `/go/[slug]`, disclosure.
- OG image gerada (`next/og`): foto + preço + mini-gráfico + selo — o card de WhatsApp é o produto.
- Modal da vitrine é **substituído** por navegação à página (intercepting route se quisermos manter a sensação de overlay; decisão na entrega).
- `sitemap.xml` + `robots.txt` (pendência já registrada no roadmap) incluindo `/bizu/*`.
- Vitrine `/` sai de `force-dynamic` para ISR + revalidate on-demand no hook da varredura (contrato com M1-C; resolve o achado nº 1).

**Fica de FORA:** alerta de preço (M3 ainda não existe), comparador de alternativas (dado não existe no schema).

**Critério de saída:** URL de produto colada no WhatsApp renderiza OG com preço; página indexável; `/` servida estática entre varreduras.

**Verificação:** typecheck · teste de rota (slug inexistente → 404) · OG inspecionada em preview real · query confirmando que `/` não abre conexão por request (log do pooler ou instrumentação).

## Fase UX-3 — Catálogo navegável

**Objetivo:** transformar a grade monótona em catálogo navegável, reduzir fadiga e separar claramente filtro de ordenação.

**Depende de:** M2 (categoria), M3 (alerta), M4 (curadoria/score).

- Chips de categoria reais sob o rótulo literal “Navegue por categoria”; faixas de preço viram filtro secundário e “menor preço” sai desse grupo para a ordenação.
- Ordenações explícitas: “Destaques selecionados”, “Maior queda real”, “Menor preço” e “Mais recente”; a padrão usa o ranking de curadoria quando M4 existir, nunca apenas o maior desconto declarado.
- Em telas pequenas, filtros abrem em painel acessível; estado ativo não depende só de cor e sempre oferece “limpar”.
- Mostrar 24 itens por página, com paginação numerada no desktop e anterior/próxima no mobile; preservar página, busca, filtros e ordenação na URL quando a pessoa volta de um produto.
- Busca: botão `↵` vira "buscar" legível; sem resultado local, oferecer limpar/estado claro (já existe empty state — estender).
- Faixa de “quedas recentes” **se e só se** M1-C tiver histórico com densidade suficiente para afirmar “caiu X% hoje” — senão fica de fora.

**Fica de FORA (deste plano inteiro, por ora):** dark mode; modo garimpo (swipe); comparador lado a lado; redesign tipográfico com `next/font` — vale doc de decisão próprio se a identidade BizuMiner for a definitiva (registrar no roadmap qual identidade venceu).

**Critério de saída:** usuário navega por categoria, distingue filtro de ordenação, limpa estados e volta de uma página de produto sem perder o contexto da lista.

## Fase UX-4 — Retenção, confiança e curadoria própria

**Depende de:** M3 (alertas) e M4 (curadoria/score).

**Objetivo:** dar motivo para voltar e tornar a metodologia BizuMiner uma experiência, não apenas um manifesto.

- CTA contextual “Me avise se baixar” na página de produto; incluir estado anti-FOMO: quando o preço ainda não é especial, dizer isso e oferecer alerta.
- Favoritos explicam onde ficam e preservam estado; newsletter informa frequência e benefício (“cinco sinais fortes por semana”, se essa cadência for aprovada).
- Card/página em três camadas: **resumo** (veredito rápido), **evidências** (preço/histórico/nota) e **bizu** (para quem vale + principal ressalva).
- Score BizuMiner é separado visual e semanticamente da nota do Mercado Livre e abre a composição dos critérios; nenhuma caixa-preta.
- Campo editorial opcional “Não compre se…” para reduzir arrependimento e diferenciar a curadoria de sites de desconto.
- Área de vendedores usa a mensagem B2B aprovada, canal funcional e política de independência; conteúdo pago, se existir, recebe rótulo próprio.
- Página de transparência explica afiliação, atualização, critérios, ausência de garantia de preço e distinção entre dados do marketplace e opinião editorial.

**Fica de FORA:** avaliações próprias de usuários, comentários, gamificação, swipe e comparador completo. Só entram após dados de uso provarem necessidade.

**Critério de saída:** alerta completo ponta a ponta; score e nota da fonte não podem ser confundidos em teste de compreensão; top 24 sem blurb repetido; dono aprova copy e equilíbrio visual.

---

## Regras desta instância

- **Nada de dado simulado na UI.** Selo, score, sparkline e alerta só aparecem alimentados pelo contrato real. (Cicatriz: blurb repetido 24× veio de exibir afirmação que o dado não sustentava.)
- **Edição de arquivo sempre via editor UTF-8, nunca PowerShell** (incidente de encoding registrado no roadmap, 18/08).
- Acessibilidade existente é piso, não teto: nenhuma entrega pode regredir focus-visible/aria/reduced-motion.
- Toda entrega termina com **pedido de conferência** (parcial por padrão) antes de ✅ — quem implementa não aprova.

---

## Registro de implementação — 18/08/2026 (🟡 aguardando conferência independente)

### UX-0 e UX-1 entregues para revisão

- A promessa B2C entra no primeiro viewport: “Não perca tempo caçando ofertas”; a explicação limita a promessa a preço, histórico e evidências reais do Mercado Livre.
- A mensagem B2B ficou na área de vendedores, com contato real por e-mail e declaração de independência editorial.
- Cards agora expõem três camadas: desconto declarado no anúncio, histórico de preço e evidência da fonte. Nota e rótulo de vendidos seguem identificados como dados do Mercado Livre.
- A ação comercial é um link direto e ostensivo: **“ver no Mercado Livre”** abre `/go/[slug]` em nova aba e preserva `sponsored`; coração continua local ao navegador.
- Filtros de categoria, faixa de preço e ordenação foram separados. Categorias vêm do banco; há 12 itens iniciais e “carregar mais”.
- Menu móvel, busca com botão textual, estados vazios e aviso de favoritos foram preservados/implementados. Não há score BizuMiner nem avaliações próprias simuladas.

### UX-2 parcialmente entregue para revisão

- Criada a rota compartilhável `/bizu/[slug]`, com produto, preço, evidências da fonte, disclosure, CTA afiliado e gráfico SVG gerado somente de observações existentes.
- A página informa literalmente quantos registros existem e qual período foi monitorado, sem inferir tendência nem nomear um estado abstrato de “formação”.
- Ainda faltam OG image, `sitemap.xml`/`robots.txt` e ISR/revalidate on-demand; dependem do fechamento de M1-C e de uma decisão de infraestrutura.

### Verificações executadas

- `packages/web`: `npm run typecheck`, `npm test` e `npm run build` passaram.
- `packages/persistence`: `npm run typecheck` e `npm test` passaram (5 testes).
- Navegação local conferida em `/` e em uma rota real `/bizu/ml-MLB28263665`: conteúdo renderizado, links internos/CTA presentes e nenhum overlay de erro do Next.
- A revisão humana ainda precisa validar os breakpoints 360, 390, 768, 1024 e 1440px, a leitura da copy e o clique afiliado ponta a ponta antes de qualquer item receber ✅.

---

## Registro de paginação e busca — 18/08/2026 (🟡 aguardando conferência independente)

- A home expõe 24 produtos por página. No desktop, o controle apresenta anterior, páginas numeradas, reticências e próxima; abaixo de 560px, reduz para anterior, “Página X de Y” e próxima.
- Busca, categoria, faixa de preço e ordenação continuam aplicadas no servidor. Qualquer mudança desses estados volta à página 1.
- O estado público usa parâmetros legíveis (`pagina`, `categoria`, `preco`, `ordem`, `busca`). Recarregar, compartilhar a URL e navegar com Voltar/Avançar restaura o mesmo contexto.
- A vitrine comunica o recorte real, por exemplo “Mostrando 25–48 de 290 achados”, e a numeração editorial dos cards continua global entre páginas.
- Verificação automatizada: página 1 = 24 itens; página 2 = 24 itens; total = 290; 0 IDs duplicados. Troca 2 → 3 exibiu 49–72 e Voltar restaurou 25–48.
- Verificação responsiva em 390×844: números ficam ocultos, status “Página 2 de 13” visível e ambos os controles direcionais habilitados. Sem overlay do Next ou erro de console após reiniciar o servidor.
- `npm run typecheck`, 6 testes e `npm run build` passaram. A rota `/` permanece dinâmica e adiciona apenas 6,93 kB ao bundle de página (110 kB de First Load JS).
- Pendente para ✅: conferência humana do ritmo de 24 cards por página, da estética do controle e de busca/filtros em aparelhos físicos.

## Registro do novo carrossel e da linguagem literal — 18/08/2026 (🟡 aguardando conferência humana)

- O banner rasterizado e estreito foi substituído por um carrossel integral em HTML/CSS. O primeiro slide combina promessa editorial e produtos reais; os demais usam dados atuais do catálogo.
- Imagens de produto usam `object-fit: contain`, preservando o objeto completo em vez de cortá-lo para preencher o quadro. A composição ocupa a mesma largura estrutural da faixa de controles abaixo.
- O primeiro slide diz “Menos tempo procurando. Mais clareza para decidir.”; preço, nota, vendidos e histórico aparecem como fatos, não como metáforas.
- Foram removidos da interface pública “sinal”, “sinal em formação”, “Explore a mina” e equivalentes. Entraram “ofertas monitoradas”, “registros de preço”, “período monitorado”, “categorias” e “destaques selecionados”.
- A promessa B2C continua no primeiro viewport; a mensagem “Automatizar ofertas é fácil. Conquistar público qualificado é BizuMiner.” permanece na área destinada a vendedores.
- Conferência automatizada em desktop: carrossel inicial e slide de produto renderizados, 24 cards na página, 183 ofertas no total, nenhuma rolagem horizontal e nenhum overlay/erro do Next.
- Pendente para ✅: julgamento dos sócios sobre proporção, ritmo e copy, além de conferência visual em aparelhos móveis reais. As regras responsivas foram implementadas, mas não substituem esse veredito humano.

## Ajuste responsivo e área clicável do destaque — 19/08/2026 (🟡 aguardando conferência humana)

- A altura do carrossel deixou de depender apenas da largura da tela. Em monitores com pouca altura útil, ela agora é limitada pelo viewport descontando barra superior, cabeçalho e controles; o conteúdo interno reduz espaçamentos e escala tipográfica sem alterar a composição em telas grandes.
- A imagem de cada produto em destaque passou a ser um link interno para `/bizu/[slug]`, com cursor, resposta visual no hover, foco de teclado explícito e nome acessível contendo o produto.
- O link textual “ver detalhes” continua disponível. Ambos os acessos registram `hero_detail_click`, enquanto um gesto horizontal acima de 48 px troca o slide e bloqueia a navegação acidental da imagem.
- Pendente para ✅: conferir a proporção em um notebook 1366×768 (ou equivalente), validar a legibilidade dos títulos reais e testar clique, teclado e gesto horizontal em dispositivo físico.

## Experiência mobile-first de garimpo — 19/08/2026 (🟡 aguardando conferência humana)

- A referência produzida no Google Stitch foi tratada como direção de produto, não como especificação literal. A identidade editorial existente, a origem real dos dados e os contratos atuais da vitrine foram preservados.
- A home abaixo de 820px agora tem composição própria: abertura compacta, busca prioritária, categorias roláveis, barra de ordenação/filtro e grade simétrica de duas colunas. O primeiro produto ocupa a largura completa para criar hierarquia; depois do sexto item, um intervalo editorial sugere três categorias reais sem interromper o fluxo.
- A paginação numerada continua no desktop. No mobile, “carregar mais 24” acrescenta os próximos produtos à grade, remove duplicidades e registra a última página carregada na URL — durante a sessão de navegação, a pessoa continua garimpando sem substituir os itens anteriores.
- A navegação inferior oferece Início, Categorias, Salvos e Menu, com estado atual exposto também por `aria-current`. Categorias, filtros e salvos abrem superfícies móveis dedicadas, devolvem foco ao título e deixam a ação principal ao alcance do polegar.
- Favoritos guardam IDs e uma cópia normalizada dos produtos no navegador. Isso permite reencontrar o item no painel “Seus salvos” mesmo fora da página onde ele apareceu; ainda não existe sincronização entre aparelhos ou conta de usuário.
- A página `/bizu/[slug]` recebeu ação de salvar, CTA afiliado fixo no rodapé mobile e uma faixa horizontal de até quatro produtos reais da mesma categoria. Nenhuma recomendação, imagem ou preço é simulado.
- Imagens de catálogo, detalhe e relacionados usam `next/image`, `sizes` por breakpoint e domínios remotos explicitamente permitidos. O desktop mantém carrossel, filtros completos, paginação e grade de quatro colunas.
- Verificação automatizada: `npm run typecheck`, 10 testes e `npm run build` passaram. No navegador real, a grade foi conferida em 360, 390 e 768 px sem overflow horizontal; 24 → 48 itens foram anexados; salvar → contador → painel de salvos funcionou; o detalhe exibiu CTA fixo e quatro relacionados; no breakpoint desktop, a navegação mobile ficou oculta e quatro cards permaneceram alinhados.
- Pendente para ✅: os sócios precisam conferir ritmo, densidade, copy e conforto de toque em aparelhos físicos; validar especialmente sessões longas de rolagem, áreas seguras de iPhone/Android e se o destaque de largura dupla deve continuar sempre no primeiro item.

## Escada de verificação da instância web

1. `npm run typecheck` (tudo)
2. Testes de componente/rota quando houver lógica (tudo que tenha branch)
3. Navegação real teclado+mobile viewport (mudança visível)
4. Clique ponta a ponta gravando `click_event` + Lighthouse (caminho crítico)
5. Veredito do dono sobre estética/copy (gosto e marca)
