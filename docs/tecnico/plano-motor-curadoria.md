# Plano de Implementação — Motor de Curadoria (instância dados/backend)

**Documento vivo — criado em 17/08/2026.**
Escopo: `packages/persistence`, `packages/capture`, schema `garimpa` (Supabase), queries em `packages/web/lib/db.ts` (a camada de leitura vive no web, mas o **contrato** é definido aqui). O plano da interface é `plano-ux-vitrine.md`.

Status: ✅ feito e conferido · 🟡 parcial · ⬜ não iniciado

---

## Achados da leitura do código (17/08/2026)

1. **Bug de semântica no "menor preço já visto".** `topDeals` calcula `min(price_cents)` sobre **todo** o histórico — incluindo a observação atual. Para produto com 1 observação, `min == price` sempre, e `isLowest()` na UI é verdadeiro. Resultado observado: 24/24 produtos com o mesmo selo e o mesmo blurb. O diferencial do produto (histórico próprio) está afirmando algo que o dado não sustenta.
2. **O ranking contradiz o posicionamento.** `topDeals` ordena por `claimed_discount_rate desc` — o desconto **declarado pelo ML**. A vitrine inteira vira −60/−80% "bom demais para ser verdade", exatamente o que o texto do site diz combater.
3. **Histórico é raso porque a varredura é manual.** `bin/sweep.ts` é CLI; 3 varreduras registradas (177 produtos, 529 observações). Sem varredura recorrente não existe sparkline, nem alerta, nem selo honesto — **agendamento é pré-requisito de quase tudo**.
4. **Não existe `category` em `product`.** Chips reais de categoria precisam de coluna + extração na captura (ou heurística por título).
5. **Infra já pronta que os planos reutilizam:** `price_observation` com índice `(product_id, observed_at)` — sparkline é uma query, não uma migração; `publication` criada on-demand no `/go` com slug determinístico `ml-<external_id>`; `subscriber` (LGPD: e-mail + consentimento) para newsletter; `capture_run` com alerta de zero itens.
6. `tenant_id` fixo `"local"` como default em `topDeals` — ok por ora, mas toda query nova nasce com `tenant_id` no `where` (princípio do modelo-de-dados.md).
7. **A nota já existe na fonte, mas se perde no pipeline.** O HTML real de `/ofertas` contém `Classificação X de 5 estrelas` e uma faixa de vendidos. `RawOffer` já prevê `ratingStar`/`salesCount`, porém `parseDealsHtml()`, `sweep()`, `OfferStore`, o schema SQL e `DealRow` não transportam esses campos.
8. **“Vendidos” não é necessariamente uma contagem exata.** A fonte publica rótulos como `+10 mil vendidos`; transformar isso silenciosamente em `10.000` exatos seria uma nova afirmação falsa. O contrato precisa preservar o rótulo original e, se normalizar um número, marcá-lo como limite inferior/aproximado.
9. **Os títulos chegam com entidades HTML sem decodificação.** Casos como `B&amp;G` e `D&#x27;água` aparecem na vitrine. A correção pertence à borda de captura; a UI não deve espalhar remendos por componente.

---

## Contrato com a web (o que este motor promete)

| Contrato | Forma | Fase |
|---|---|---|
| `lowest_verified`, `observation_count`, `history_days` no DealRow | colunas na query `topDeals` | M1-B |
| `dealDetail(slug)` → DealRow + `price_history[]` | função em `lib/db.ts` (leitura) | M1-C |
| Ranking por sinal de valor, não por desconto declarado | mudança interna de `topDeals` | M1-B |
| Revalidate on-demand pós-varredura | hook no fim do `sweep()` | M1-C |
| Evidência do marketplace: `rating_star`, `sales_label`, `evidence_observed_at` | parser → observação append-only → `DealRow` | M1-A |
| Título de origem com entidades HTML decodificadas | parser de `/ofertas` | M1-A |
| `product.category` | migration + captura/backfill | M2 |
| Alerta de preço: subscribe + disparo | tabela + route handler + job pós-sweep | M3 |
| `blurb`/`score` editorial com fallback | tabela `curation` + fallback derivado | M4 |

---

## Fase M1-A — Evidência do Mercado Livre + higiene da captura (🟡 pronta para conferência)

**Objetivo:** transportar até o banco exatamente a evidência que a fonte oferece, sem inventar precisão, e eliminar títulos tecnicamente quebrados.

- Contrato de captura: manter `ratingStar` e acrescentar a representação honesta de vendidos (`salesLabel` original + valor normalizado opcional marcado como aproximado/limite inferior). Campos sempre opcionais: card sem evidência continua sendo oferta válida.
- Parser de `/ofertas`: ler primeiro o texto acessível `Classificação X de 5 estrelas`; ler o rótulo de vendidos sem depender do desenho da estrela; decodificar entidades nomeadas e numéricas no título antes de criar `RawOffer`.
- Persistência append-only: adicionar campos nulos à `price_observation`, não a `product`, porque nota e volume mudam e precisam conservar `observed_at`. Linhas antigas permanecem nulas — não fazer backfill fictício.
- Ingestão/store/query: transportar os novos campos por `sweep()`, `OfferStore`, `PostgresStore` e última observação de `DealRow`.
- Fonte na UI: a web sempre rotula `Nota no Mercado Livre`; ausência de nota esconde o bloco, nunca mostra zero.

**Fica de FORA:** comentários escritos, número exato de avaliações, avaliação de usuários BizuMiner, reputação do vendedor e score próprio.

**Critério de saída:** fixture real extrai nota e rótulo de vendidos; fixture sabotada sem esses elementos continua passando com campos nulos; nenhum título da top 24 contém entidade HTML crua; uma varredura real persiste evidência com o mesmo `observed_at` do preço.

**Verificação:** testes de parser e persistência + `bin/verify-marketplace-evidence.ts`, derivado do banco, imprimindo `external_id`, nota, rótulo de vendidos e timestamp. Estado atual: capture 72 testes, persistence 4; varredura real de 193 ofertas persistiu 576 observações com evidência e zero títulos com entidade HTML crua.

## Fase M1-B — Verdade do preço + ranking por valor

**Objetivo:** parar de chamar todo produto novo de “menor preço” e fazer o ranking obedecer ao posicionamento da marca.

- `lowest_verified = (preço atual ≤ min das observações ANTERIORES) AND observation_count ≥ N AND history_days ≥ D`.
- N e D são parâmetros registrados (proposta inicial: N=3, D=7; decisão do dono antes da implementação). A observação corrente é excluída do mínimo anterior.
- Ranking prioriza queda real contra histórico próprio; nota do Mercado Livre e volume vendido podem atuar como sinal de confiança, mas nunca compensar preço ruim. `claimed_discount_rate` vira desempate.
- `topDeals` retorna `lowest_verified`, `observation_count`, `history_days`, `rating_star`, `sales_label` e `evidence_observed_at`.

**Fica de FORA:** score editorial, material/qualidade inferidos, alternativas e qualquer nota BizuMiner.

**Critério de saída:** produto novo não recebe selo; ranking não é idêntico ao ranking por desconto declarado; ausência de nota não exclui automaticamente uma oferta.

**Verificação:** `bin/verify-lowest.ts` imprime, por produto exibido, observações, janela, mínimo anterior, preço atual e veredito; teste sabotado prova que a observação atual não contamina o mínimo anterior.

### Registro de implementação — 18/08/2026 (🟡 aguardando conferência independente)

- Regra aplicada em `packages/web/lib/db.ts`: `N=3` observações e `D=7` dias; a observação mais recente é excluída de `previous_min_price_cents`.
- `topDeals` agora ordena sinal verificado, queda real contra o mínimo anterior, desconto declarado e preço — nessa ordem. `claimed_discount_rate` não é mais o motor do ranking.
- Criado `packages/persistence/bin/verify-lowest.ts` e o comando `npm run verify:lowest`.
- Evidência real no Supabase em 18/08: 24 itens conferidos, 0 com `lowest_verified`; todos ainda tinham menos de 7 dias de histórico. Este é o comportamento correto: nenhum selo é exibido por uma certeza que a base ainda não permite.
- Pendente para encerrar M1-B: conferência independente da fórmula/ordem de ranking depois de uma janela histórica de pelo menos 7 dias.

## Fase M1-C — Varredura recorrente + detalhe + revalidação

**Objetivo:** transformar capturas manuais em histórico útil e fornecer a fronteira necessária para páginas de produto e alertas.

- Varredura agendada de `sweep()` a cada 2–4h por GitHub Actions ou host próprio; a escolha de infraestrutura é registrada antes de codar.
- Alerta explícito quando `capture_run` registra zero itens ou falha repetida.
- `dealDetail(slug)` resolve `ml-<external_id>` e retorna produto + histórico de até 90 dias + evidência mais recente do marketplace.
- Revalidate on-demand da web somente quando houver mudança relevante, com token de ambiente.

**Fica de FORA:** categoria, alertas de usuário, curadoria editorial e Shopee.

**Critério de saída:** pelo menos 48h de execuções automáticas verificadas, `dealDetail` coberto por teste e a home deixa de abrir uma conexão nova por request após a entrega web correspondente.

### Registro de implementação — 18/08/2026 (🟡 parcial)

- `dealDetail(slug)` foi entregue em `packages/web/lib/db.ts`: resolve o slug Mercado Livre, retorna fatos atuais e até 90 dias de observações reais.
- Ainda não existe agendamento recorrente nem revalidação on-demand. Eles dependem da escolha e configuração de uma infraestrutura de execução (GitHub Actions ou host) e de um segredo de revalidação. Sem isso, a home continua dinâmica por segurança de dados.

### Registro de captura auditável — 18/08/2026 (🟡 aguardando conferência independente)

- A execução agora nasce como `capture_run.status = running` antes da busca. O mesmo registro é encerrado como sucesso, erro ou captura vazia; parâmetros não sensíveis e o identificador de correlação do coletor ficam associados à execução.
- Cada produto encontrado gera exatamente uma `price_observation` por execução, ligada por `capture_run_id`. Preço repetido também é registrado porque comprova presença e proveniência naquela coleta.
- `product.first_seen_at`, `last_seen_at` e `last_capture_run_id` mantêm o estado agregado; a observação conserva snapshots normalizados de título, URL, imagem e categoria para reprodução de auditorias.
- A restrição única `(capture_run_id, product_id)` impede duplicação dentro da mesma execução. FKs com `ON DELETE RESTRICT` evitam apagar acidentalmente o histórico ao remover uma execução ou produto.
- Observações antigas sem proveniência reconstruível foram preservadas com `capture_run_id` nulo; não houve backfill fictício nem exclusão de histórico.
- Varredura real validada: execução `0d539916-c495-41ea-b569-a3b3f714d3e1`, 183 itens capturados, 183 produtos distintos e 183 observações vinculadas. Todos os checks de `npm run verify:capture-audit` passaram.
- O parâmetro `--pages` do CLI agora controla de fato o limite do coletor por meio de `FetchParams.maxPages`.
- Ainda fora desta entrega: agendamento recorrente, prazo de retenção `X`, compactação/particionamento e uma regra de indisponibilidade. Ausência em uma coleta não é tratada como prova de indisponibilidade.

## Fase M2 — Categoria de produto

**Objetivo:** a "mina" ganha corredores.

- Migration: `alter table garimpa.product add column category text` (+ índice se filtro server-side).
- Captura: extrair categoria do card de `/ofertas` se disponível no HTML (verificar no fixture antes de decidir); senão, heurística por título (dicionário pequeno e auditável: suplemento, casa, tech, fitness, beleza…) com `category = null` quando incerto — **nunca chutar silenciosamente**.
- Backfill dos produtos existentes pela mesma heurística; registrar quantos ficaram `null`.
- `topDeals` aceita filtro opcional de categoria.

**Fica de FORA:** taxonomia hierárquica, classificação por LLM (só se a heurística provar taxa de `null` > ~40% — medir antes de sofisticar).

**Critério de saída:** ≥ 60% do catálogo com categoria não-nula, conferível por query.

### Registro de implementação — 18/08/2026 (🟡 aguardando conferência independente)

- Migration aplicada: `product.category`, índice parcial e backfill conservador.
- Captura e `PostgresStore` passam a classificar apenas títulos com pistas explícitas; a ausência continua `null`.
- Cobertura real após a expansão auditável do dicionário: 220 de 290 produtos, ou **75,9%**. O critério de cobertura foi atingido sem classificar os 24,1% incertos à força.

## Fase M3 — Alerta de preço ("me avisa se baixar")

**Objetivo:** retenção com o dado que só nós temos.

- Migration: `garimpa.product_alert` (id, tenant_id, product_id FK, email, consented_at, unsubscribe_token, notified_at nullable, created_at). LGPD igual ao `subscriber`: só e-mail + consentimento, sem IP.
- Route handler `POST /api/alerta` (rate-limit simples por hash de IP, como o `/go` já faz).
- Job pós-sweep: para cada alerta ativo, se preço atual < preço no momento da inscrição (ou < alvo), envia e-mail e marca `notified_at`. Provedor de e-mail a decidir na entrega (Resend é o candidato; registrar custo).
- Link de descadastro por token (obrigatório antes do primeiro envio real).

**Depende de:** M1-C (varredura recorrente — alerta sem varredura é promessa vazia).

**Fica de FORA:** digest diário, alerta por categoria, push/WhatsApp.

**Critério de saída:** ciclo real ponta a ponta: inscrição → queda de preço em varredura real → e-mail recebido → descadastro funciona. Evidência: query de `product_alert` com `notified_at` + id da `capture_run` que disparou.

## Fase M4 — Curadoria editorial (blurb + score)

**Objetivo:** cada produto com narrativa própria; a promessa "mais revista do que vitrine" vira dado.

- Migration: `garimpa.curation` (product_id FK única, tenant_id, blurb text, score_sinal/score_valor/score_bizu smallint 0–100, curated_by, updated_at). Tabela separada de `product` porque captura sobrescreve produto e curadoria é humana — ciclos de vida diferentes.
- Fallback derivado quando não há curadoria: gerar blurb do histórico real ("caiu X% desde jul", "estável há N dias") — **variado por produto porque o dado varia**, resolvendo a repetição sem inventar opinião.
- Interface de edição: começar sem admin — planilha/SQL ou arquivo versionado importado por script. Admin web só se a dor aparecer (burocracia sem uso é dívida).
- `topDeals`/`dealDetail` passam a retornar `blurb`/`score` (join left — ausência não quebra nada).

**Fica de FORA:** geração de blurb por LLM em produção (pode ser rascunho offline revisado por humano; decidir depois de M4 rodar manual), comparador de alternativas.

**Critério de saída:** top 24 da vitrine sem nenhum blurb repetido; fallback cobrindo o resto.

---

## Ordem e dependências

```
M1-A (evidência ML) ─► M1-B (preço honesto) ─► UX-1
                              │
                              └─► M1-C (cron + detalhe) ─► UX-2 ─► M3 (alertas)
M2 (categoria) ─► UX-3
M4 (curadoria) ─► UX-4
```

M1-A é a primeira entrega porque fecha um caminho completo e pequeno — fonte → contrato → banco → consulta — e prepara a prova que a UX passará a exibir. M1-B vem imediatamente depois porque corrige a afirmação falsa hoje visível ao público.

## Regras desta instância

- **Toda afirmação de execução real sai de script, não de narrativa** (`verify-lowest.ts` e sucessores). Cicatriz de origem: selo "menor preço" exibido 24× sem sustentação no dado.
- Migration nova sempre com `tenant_id` e `where tenant_id` em toda query (modelo-de-dados.md — irreversível depois).
- Append-only em `price_observation`: nenhuma fase pode reescrever histórico.
- Toda entrega termina com **pedido de conferência** antes de ✅; contagem de testes declarada no relatório.

## Escada de verificação da instância motor

1. `npm run typecheck` + testes existentes (capture: 70/70; persistence: suíte atual) — tudo
2. Testes novos com fixture/InMemoryStore — toda lógica nova
3. Query de conferência contra o banco real — mudança de dado visível
4. Varredura real + script de verificação derivada — caminho crítico (selo, alerta)
5. Veredito do dono — fórmula de ranking, copy de e-mail, custo de provedor
