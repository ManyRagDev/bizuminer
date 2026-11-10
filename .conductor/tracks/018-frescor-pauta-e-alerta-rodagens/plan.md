# Track 018 — Frescor de Pauta, Semáforo Visual e Alerta de Rodagens no Painel Hoje

> **Status:** Concluído e Verificado  
> **Data:** 09/11/2026 (executado em 10/11/2026)  
> **Objetivo:** Implementar o ciclo fechado de frescor de catálogo no BizuMiner: teto equilibrado de lojas com curva de frescor intra-loja em `pauta-policy.ts` (blindando contra o "viés da última rodagem"), semáforo visual de 3 tempos nos cards da Pauta (`/pauta`), e card de telemetria/alerta de necessidade de rodagem no painel "Hoje" (`/admin`).

---

## 1. Contexto e Motivação

1. **A Armadilha do Viés da Última Rodagem:**
   Se uma nova rodagem der prioridade absoluta e global para ofertas recentes, qualquer execução isolada (ex: cron da Shopee) canibalizaria a Pauta inteira com 12 produtos daquela loja. Em seguida, uma captura de Amazon na extensão apagaria os outros e tomaria as 12 vagas.
   *Solução:* Teto balanceado por marketplace (ex: máximo de 4 a 5 vagas por loja no WhatsApp) somado a uma curva de frescor *intra-loja*, onde novas capturas competem entre si pela cota da sua respectiva loja, mantendo a Pauta sempre rica e diversa.

2. **O "Cronômetro Invisível" do E-commerce:**
   Preços promocionais e estoques de ofertas têm meia-vida:
   - **0 a 3 horas (Verde):** Fresquíssimo, confiança máxima de 95%+, pronto para disparo imediato.
   - **3 a 10 horas (Amarelo):** Atenção, meia-vida da oferta; recomendada conferência rápida antes de postar.
   - **> 10 horas ou virada da meia-noite (Vermelho):** Alto risco de alteração de preço ou esgotamento de lote promocional.

3. **Alerta de Operação no Painel "Hoje":**
   Em vez de adivinhar quando uma loja está desabastecida ou quando as ofertas da Pauta estão expirando, o painel central do operador (`/admin` -> Operação de hoje) deve monitorar a saúde da Pauta e sinalizar com clareza quais lojas precisam de uma nova captura.

---

## 2. Escopo e Arquitetura

### 2.1. Algoritmo de Pauta & Equilíbrio de Lojas (`packages/web/lib/pauta-policy.ts`)
- **Teto Proporcional por Marketplace:**
  - Em canais multiloja (WhatsApp com teto 12), limitar cada marketplace a no máximo `Math.max(2, Math.floor(policy.limit / activeMarketplacesCount) + 1)` (teto de 4 a 5 por loja no primeiro passe).
  - No segundo passe, caso alguma loja não atinja a cota, as vagas restantes são preenchidas por mérito geral.
- **Curva Suave de Frescor Intra-Loja:**
  - Substituir o bônus binário estático `ageHours <= 24 ? 8 : 0` por uma curva exponencial de recência:
    `const recencyBonus = Math.max(0, 10 * Math.exp(-ageHours / 5));`
  - Garante que a rodagem mais recente renove a cota da sua própria loja sem derrubar as cotas das outras.

### 2.2. Semáforo Visual nos Cards da Pauta (`packages/web/app/pauta/`)
- **Cálculo de Frescor (`packages/web/lib/deal-signal.ts`):**
  - Função `evaluateFreshnessStatus(value: Date | string | null, now?: Date)` comparando horas e virada de dia em horário de Brasília (`America/Sao_Paulo`).
- **Tratamento Visual (Mobile-First em `globals.css`):**
  - **Borda contínua vertical:** Borda lateral esquerda de 5px no card do produto:
    - `.pauta-card-freshness-fresh`: Verde (`#10b981`) para `< 3h`.
    - `.pauta-card-freshness-warm`: Amarelo (`#f59e0b`) para `3h a 10h`.
    - `.pauta-card-freshness-stale`: Vermelho (`#ef4444`) para `> 10h` ou pós-meia-noite.
  - **Pílula de Semáforo no cabeçalho:**
    - `.pauta-freshness-badge` com `.pauta-freshness-dot` e rótulo claro: `Fresco (<3h) · coletado há X min`, `Atenção (3-10h)`, `Virou o dia`.

### 2.3. Notificação no Painel "Hoje" (`packages/web/app/admin/`)
- **Leitura de Telemetria (`packages/web/lib/today-operation-db.ts` & `today-operation.ts`):**
  - Função `readStoresHealth(context)` medindo última captura e contagem de ofertas `<3h` (total e aprovadas na pauta).
- **Interface no "Hoje" (`packages/web/app/admin/today-command-center.tsx`):**
  - Bloco visual *"Saúde da Pauta & Próximas Rodagens"*.
  - Indicador por loja (🟢 Em dia, 🟡 Atenção, 🔴 Exige rodagem).
  - Ações rápidas:
    - Shopee: Botão para rodar lote ou link direto.
    - Amazon e Mercado Livre: Atalhos diretos para páginas de ofertas oficiais.

---

## 3. Tarefas de Implementação

- [x] **Fase 1: Teto Equilibrado e Frescor em `pauta-policy.ts`**
  - [x] Implementar teto proporcional por loja no primeiro passe da seleção.
  - [x] Implementar curva exponencial de recência `freshnessBonus = Math.max(0, 10 * Math.exp(-ageHours / 5))`.
  - [x] Atualizar e validar testes em `packages/web/test/pauta-live.test.mjs`.

- [x] **Fase 2: Semáforo Visual na Pauta (`pauta-client.tsx` & `globals.css`)**
  - [x] Criar helper utilitário de cálculo de semáforo (`evaluateFreshnessStatus` em `deal-signal.ts`).
  - [x] Integrar badge/pílula e borda lateral nos cards de WhatsApp e Stories (`pauta-client.tsx`).
  - [x] Adicionar estilos em `globals.css` para `.pauta-card-freshness-*` e `.pauta-freshness-badge`.
  - [x] Testes unitários de classificação em `test/deal-signal.test.mjs`.

- [x] **Fase 3: Widget de Saúde e Alerta de Rodagens no Painel "Hoje"**
  - [x] Criar `evaluateStoreHealth` em `today-operation.ts` e `readStoresHealth` em `today-operation-db.ts`.
  - [x] Adicionar testes unitários em `test/today-operation.test.mjs`.
  - [x] Adicionar componente visual em `today-command-center.tsx` e conectar em `app/admin/page.tsx`.
  - [x] Adicionar estilização responsiva em `globals.css` (`.today-stores-health`, `.today-stores-grid`, `.today-store-card`).

- [x] **Fase 4: Verificação de Ponta a Ponta & Definition of Done**
  - [x] Executar suíte de testes (`npm test --prefix packages/web`: 571/571 passando).
  - [x] Executar testes da extensão (`npm test --prefix packages/extension`: 29/29 passando).
  - [x] Executar typecheck com zero erros (`npm run typecheck --prefix packages/web`).
  - [x] Atualizar `.conductor/tracks.md` e sincronizar artefatos.
