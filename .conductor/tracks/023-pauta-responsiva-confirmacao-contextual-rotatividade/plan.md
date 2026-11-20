# Track 023 — Pauta Responsiva, Confirmação Contextual no Card e Rotatividade Ágil

> **Status:** Concluída  
> **Data de Início:** 18/11/2026  
> **Data de Conclusão:** 18/11/2026  
> **Objetivo:** Transformar a experiência de operação na `/pauta` com quatro melhorias essenciais solicitadas pelo operador:
> 1. **Confirmação Contextual no Card:** Eliminar a seção solta e desformatada *"Preparações salvas"* do topo da página. O fluxo de cópia, confirmação de envio (`[✅ Confirmar que enviei]`) e descarte/desfazer (`[✕ Não enviei]`) ocorre diretamente no próprio card do produto.
> 2. **Filtros Ágeis por Loja:** Barra de filtros rápidos por marketplace (Mercado Livre, Shopee, Amazon, AliExpress) com contadores em tempo real, combinável com as prateleiras editoriais e busca.
> 3. **Rotatividade Ágil da Pauta (Pular & Renovar):** Permitir dispensar ofertas indesejadas (`⏭️ Pular oferta` individual ou `🔄 Renovar ofertas não enviadas` em lote) para que o motor da Dupla Régua puxe automaticamente as próximas melhores ofertas da reserva (#31 em diante) dentre as centenas de capturas aprovadas.
> 4. **Design Responsivo (Mobile & Desktop):** Destravar o layout de 480px em telas maiores (`>= 768px` e `>= 1100px`), transformando a Pauta em um grid multi-colunas de 2 a 3 cards no Desktop, mantendo a experiência mobile-first vertical no celular.

---

## 1. Diagnóstico Arquitetural e Decisões de Design

1. **Problema das "Preparações salvas" desformatadas:**
   - Em `packages/web/app/pauta/pauta-client.tsx` (linhas 608–623), um bloco `<section aria-label="Preparações salvas">` renderizava tags HTML cruas (`<h2>`, `<p>`, `<h3>`, `<details>`, `<button>`) sem classes CSS do design system.
   - Sempre que o operador clicava em "Copiar", uma preparação era salva em `recommendation_edition_archive` (`kind: 'pauta-copied-v1'`) e em `localStorage` (`bm_pauta_preparations_v1`). Como não havia botão de descarte e preparações expiradas não eram auto-limpas, esses textos acumulavam-se no topo da tela, empurrando o conteúdo real para baixo.
   - **Solução:** Remover essa seção solta do topo. Mapear o estado de preparação diretamente no card do produto. Quando copiado, o card ganha o badge `✓ MENSAGEM COPIADA`, botão primário de confirmação `[✅ Confirmar que enviei]` e botão de descarte `[✕ Não enviei]`. Preparações órfãs expiradas são limpas automaticamente.

2. **Falta de Filtro por Loja:**
   - O operador precisa selecionar rapidamente apenas ofertas da Shopee, Mercado Livre, Amazon ou AliExpress.
   - **Solução:** Adicionar um seletor em pílulas com contadores dinâmicos (`Todas`, `Shopee`, `Mercado Livre`, `Amazon`, `AliExpress`), perfeitamente integrado ao filtro de prateleiras (`Alto Impacto`, `Giro Diário`, `De Olho`, `Só Frescas`).

3. **Rotatividade e Renovação da Pauta (Pular / Renovar):**
   - O motor de seleção (`selectOffers` / `composeLivePauta`) seleciona as 30 melhores ofertas. Quando o operador não quer postar alguns desses itens, ele ficava "preso" a eles porque somente ofertas com divulgação confirmada entravam em `recommendation_exposure`.
   - **Solução:** Implementar `action === "skip"` e `action === "discard"` no endpoint `POST /api/pauta`. A ação de pular registra a exclusão com invalidate trigger (`garimpa.invalidate_pauta_selection()`), fazendo com que o cache do canal se atualize e puxe imediatamente as próximas opções da reserva (#31 em diante). Além disso, disponibilizar um botão de renovação em lote `[🔄 Renovar ofertas não enviadas]`.

4. **Layout Responsivo Desktop vs Mobile:**
   - Em `packages/web/app/globals.css`, `.pauta-page` estava fixada com `max-width: 480px; margin: 0 auto;`. No Desktop, a página ocupava apenas uma faixa estreita no centro da tela.
   - **Solução:** Implementar media queries para `@media (min-width: 768px)` e `@media (min-width: 1100px)`: `.pauta-page` com `max-width: 1280px` e `.pauta-pending-section` em CSS Grid (`grid-template-columns: repeat(auto-fill, minmax(360px, 1fr))`), ajustando os cards para um layout multi-coluna fluido.

---

## 2. Plano de Execução Passo a Passo

### Fase 1: Backend e API (`pauta-db.ts` e `/api/pauta/route.ts`)
- [x] Adicionar suporte a `action === "discard"` em `POST /api/pauta`: permite descartar uma preparação de cópia sem registrar divulgação, limpando o rascunho de `recommendation_edition_archive`.
- [x] Adicionar suporte a `action === "skip"` em `POST /api/pauta`: permite pular um produto da pauta, registrando a rotação e acionando a invalidação do cache para trazer o próximo produto da reserva.
- [x] Adicionar suporte a `action === "skip_batch"` em `POST /api/pauta`: permite renovar a pauta pulando todas as ofertas pendentes não enviadas.
- [x] Adicionar função `discardPautaPreparation`, `skipPautaOffer` e `skipPautaOffersBatch` em `packages/web/lib/pauta-db.ts`.
- [x] Criar e aplicar migration `20261118203000_pauta_exposure_skip.sql` adicionando `is_skip boolean not null default false` em `garimpa.recommendation_exposure`.

### Fase 2: Interface e Componentes (`pauta-client.tsx`)
- [x] Remover o bloco solto `<section aria-label="Preparações salvas">` do topo da página.
- [x] Integrar ações contextuais no próprio card do produto (`.pauta-card`):
  - Estado copiado: `[✅ Confirmar que enviei]` e `[✕ Não enviei / Descartar]`.
  - Ação de pular: `[⏭️ Pular oferta]` nas ações secundárias do card.
- [x] Adicionar barra de filtros por loja (`storeFilter`: Todas, Shopee, Mercado Livre, Amazon, AliExpress) com contadores em tempo real.
- [x] Adicionar botão `[🔄 Renovar ofertas não enviadas]` no cabeçalho/barra de ações da Pauta.
- [x] Limpeza automática de preparações expiradas residuais (> 24h) e gaveta colapsável para rascunhos órfãos.

### Fase 3: Estilização Responsiva (`globals.css`)
- [x] Destravar `.pauta-page` para desktop (`@media (min-width: 768px)` e `@media (min-width: 1100px)`).
- [x] Transformar `.pauta-pending-section` em CSS Grid responsivo para telas maiores (`repeat(auto-fill, minmax(360px, 1fr))`).
- [x] Estilizar os novos botões contextuais no card (`.pauta-card-confirm-btn`, `.pauta-card-discard-btn`, `.pauta-card-skip-btn`).
- [x] Estilizar a barra de filtros por loja e o botão de renovação em lote.

### Fase 4: Verificação Automatizada e Deploy em Produção
- [x] Executar suíte completa de testes (`npm test --prefix packages/web` - 753 testes passando).
- [x] Executar typecheck (`npm run typecheck --prefix packages/web` - 0 erros).
- [x] Executar build de produção (`npm run build --prefix packages/web` - 26 páginas estáticas/SSR geradas).
- [x] Deploy na VPS de produção (`179.66.133.110` - containers `garimpa-web` e `garimpa-capture-executor` saudáveis).
- [x] Verificação em produção nos viewports desktop e mobile.
- [x] Atualizar `.conductor/tracks.md` e marcar tarefas como concluídas.
