# Handoff — D-2: composer no painel

**Para quem executa.** Entrega fechada, dependente de D-1 (card OG, entregue). Plano de origem: `plano-distribuicao.md`, seções 2 e 3.

**Objetivo:** o dono escolhe produto(s) no catálogo e o destino, e o painel gera a mensagem pronta para copiar (WhatsApp) ou publicar (Telegram). A cadência emerge da seleção: 1 produto gera mensagem de 1 produto; até 5 gera mensagem de lote. Mesma tela, mesmo caminho de código.

---

## Estado do mundo (verificado em 20/08/2026)

- `/admin` existe com telemetria + rodagens (`app/admin/page.tsx` server component + `admin-panel.tsx` client). Rota `POST /api/admin/rodagem` ainda usa `spawn` local (a troca para GitHub Actions é M1-C, fora desta entrega).
- `/api/deals` (público, `force-dynamic`) já devolve o catálogo paginado com **tudo** que o composer precisa: `slug`, `title`, `priceCents`, `originalPriceCents`, `previousMinPriceCents`, `observationCount`, `historyDays`, `lowestVerified` (via `toVitrineProduct`). Busca por `?q=` já existe. **Não criar API nova para listar produtos.**
- `lib/deal-signal.ts` tem `priceHighlight()` (puro, testado) com os três tons: `verified`, `drop`, `unproven`/`null`. O card OG reusa essa regra; o composer também.
- `lib/site-url.ts` resolve a URL-base **no servidor**. No cliente (`"use client"`) `VERCEL_URL` não existe no bundle — **a base vem de prop do server component**, não de import no cliente.
- Sem nenhum código de Telegram ainda (D-5 não existe). O composer D-2 gera **texto**; a publicação com foto + botão é D-5.
- Decisão do dono confirmada: o oráculo é centro de comando; D-2 é escopo confirmado.

## O que fazer

### 1. Módulo puro `lib/composer.ts` (núcleo, sem IO)

- `composeMessage(products, destination, baseUrl): string` — 1 produto = mensagem única; 2+ = lote numerado. Destino (`whatsapp | telegram`) hoje não muda o texto (o lote do Telegram vira N mensagens com foto/botão na D-5); o aviso visual por canal fica na UI.
- Copy pelo sinal real (`priceHighlight`), com **rotação determinística por slug** (hash do slug escolhe a variante) — texto varia entre produtos sem depender de sorte; o mesmo produto sempre repete a mesma variante.
  - `verified`: "esse tá no menor preço desde que comecei a acompanhar 👀" · "dá um bizu: menor preço que já vi nesse aqui"
  - `drop`: "caiu X% do menor que eu tinha anotado" (X = percentual real, `priceDifferencePercent`) · "esse baixou de novo, olha aí"
  - `unproven`/sem sinal: "achei esse hoje, tá em conta" · "dá um bizu nessa"
- Regras da copy (plano §2): no máximo um emoji, sem caixa alta, sem contagem regressiva, sem urgência fabricada. O gatilho vem do dado real — nunca do desconto declarado do anúncio.
- Estrutura da mensagem única: abertura → título → preço atual (pt-BR, sem decimais quando inteiro) → link `${baseUrl}/bizu/${slug}` → rodapé de divulgação de afiliado discreto ("link de afiliado · BizuMiner").
- Lote: cabeçalho ("bizus de hoje:") + itens numerados "1. título — preço — link" + mesmo rodapé.
- Sem produtos → string vazia.

### 2. UI `app/admin/composer.tsx` (client) + montagem em `app/admin/page.tsx`

- Server component passa `baseUrl={siteUrl()}` como prop.
- Busca no catálogo via `/api/deals?q=…&limit=24` (input + submit; sem debounce). Lista de resultados com checkbox; **máximo 5 selecionados** (além disso os demais desabilitam, com aviso). Mostra título, preço e o selo real (`priceHighlight`) como pista — nunca simular dado.
- Chips dos selecionados com botão de remover.
- Alternância de destino: WhatsApp / Telegram (padrão WhatsApp).
- Preview em textarea readonly + botão copiar (clipboard, com fallback e feedback "copiado!").
- Avisos por canal: WhatsApp com lote → "no WhatsApp só o primeiro link da mensagem gera card — considere uma mensagem por produto" (sugere, não bloqueia). Telegram → "publicação automática com foto e botão entra na D-5; por enquanto, copie o texto e cole no canal".
- Estilo: tokens existentes (`admin-section`, `--acid`, `--ink`, `--line`, `--blue`), mínimo de classes novas `composer-*` em `globals.css`.

### 3. Testes `test/composer.test.mjs`

Cobrir: mensagem única nos três tons (conteúdo: variante, título, preço formatado, link, rodapé); percentual real no tom `drop`; rotação determinística (mesmo slug → mesma mensagem); lote numerado com links; formatação de preço (inteiro sem decimais, com decimais); lista vazia → ""; destino não altera o texto (comportamento atual documentado).

## Armadilhas conhecidas

- **`clipboard` exige contexto seguro ou fallback** — usar `navigator.clipboard` com `try/catch` e fallback para `document.execCommand("copy")` em textarea temporária.
- **Não reutilizar `process.env.VERCEL_URL` no cliente** — só `NEXT_PUBLIC_*` chega ao bundle; por isso a base vem do server.
- **Não colar desconto declarado na copy** — é alegação do anúncio (ácido), não dado nosso; o gatilho do texto é o histórico (azul).
- **`/api/deals` é público** — usar igual na vitrine não expõe nada novo (o painel já lê dados agregados públicos + DB de servidor).

## Fora de escopo (por decisão, não por esquecimento)

Atribuição `via` (D-3, depende desta entrega); comparação de preço na chegada (D-4); publicação real no Telegram com foto/botão (D-5); botão "publicar" que chame Bot API; agendamento; geração de copy por LLM.

## Verificação

1. `npm run typecheck` e `npm test` em `packages/web` (28 + novos; declarar contagem antes/depois).
2. Abrir `/admin` com dev server: buscar produto real, selecionar 1 e 5, alternar destino, copiar e colar num chat de teste — conferir texto e link.
3. Conferir que mensagem única abre o card no WhatsApp/Telegram **só depois do domínio** (enquanto isso, o texto está correto mesmo sem preview).
4. Pedido de conferência antes de marcar ✅ — quem implementa não aprova.

## Arquivos que a entrega toca

- `packages/web/lib/composer.ts` — novo, puro
- `packages/web/test/composer.test.mjs` — novo
- `packages/web/app/admin/composer.tsx` — novo, client
- `packages/web/app/admin/page.tsx` — monta o composer, passa `baseUrl`
- `packages/web/app/globals.css` — classes `composer-*`
- `docs/tecnico/handoff-d2-composer.md` — este
- `docs/tecnico/plano-distribuicao.md`, `docs/estado-do-projeto.md`, `docs/pendencias.md` — registro
