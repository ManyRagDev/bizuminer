# Plano de Implementação — Motor de Curadoria (instância dados/backend)

**Documento vivo — criado em 17/08/2026.**
Escopo: `packages/persistence`, `packages/capture`, schema `garimpa` (Supabase), queries em `packages/web/lib/db.ts` (a camada de leitura vive no web, mas o **contrato** é definido aqui). O plano da interface é `plano-ux-vitrine.md`.

> **Aviso de atualização (25/08/2026):** a fase M1-C abaixo (cron + GitHub Actions para scraping do ML) foi **suplantada**. Não configurar o cron de scraping do Mercado Livre: o acesso automatizado foi contido em E0 de [`plano-extensao-captura.md`](./plano-extensao-captura.md) (kill switch `ML_AUTOMATED_CAPTURE_ENABLED`, desligado por default). O caminho vigente de descoberta/captura do ML é humano (bookmarklet/extensão). O restante deste documento (menor preço honesto, categoria, evidências, atividade) segue válido.

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

- Varredura agendada de `sweep()` a cada 2–4h. **Infraestrutura decidida em 20/08/2026: GitHub Actions.**
- **Duas missões da varredura (decidido 20/08):** descoberta (feed `/ofertas`) + retenção (re-observar o que importa — "de olho no preço" e vitrine). **Restrição da plataforma:** página de produto do ML responde 302 → anti-bot (regra de ouro §2 do adapter), então a retenção individual por scrape é **bloqueada no ML**; no feed, quem volta retoma a história automaticamente. Re-visita individual só com API oficial (Shopee/Amazon). Acompanhar quando as credenciais chegarem.
- **Estado de vida derivado (aplicado 20/08):** ativo = rodagem atual; recente = últimos 14 dias; dormente = além. Nunca gravado — `src/activity.ts` (classificador puro) + `productActivity()` no store + resumo impresso pelo `sweep.ts`.

  Motivo: a varredura leva ~20s e cresce com o número de páginas, o que a torna arriscada em função serverless com limite de tempo; o Actions não tem esse teto, é gratuito no volume do projeto, e roda o CLI que já existe (`bin/sweep.ts`) sem adaptação. Requer `DATABASE_URL` como secret do repositório.

  **Consequência que resolve outro problema:** o mesmo workflow aceita `workflow_dispatch`, então o botão "nova rodagem" do painel passa a pedir uma execução ao GitHub em vez de dar `spawn` num processo local — que **não funcionaria na Vercel** (sistema de arquivos somente-leitura, sem processo longo, e o `packages/persistence` não vai no pacote de deploy). Um mecanismo, dois gatilhos.

  **Efeito colateral bom:** com o disparo via GitHub, publicar ou não o `/admin` deixa de bloquear qualquer coisa — o painel funciona igual rodando local ou hospedado. A decisão pode esperar.
- Alerta explícito quando `capture_run` registra zero itens ou falha repetida.
- `dealDetail(slug)` resolve `ml-<external_id>` e retorna produto + histórico de até 90 dias + evidência mais recente do marketplace.
- Revalidate on-demand da web somente quando houver mudança relevante, com token de ambiente.

**Fica de FORA:** categoria, alertas de usuário, curadoria editorial e Shopee/Amazon (ambas pendentes de credencial de afiliado — voltam como entrega própria quando as credenciais chegarem).

**Critério de saída:** pelo menos 48h de execuções automáticas verificadas, `dealDetail` coberto por teste e a home deixa de abrir uma conexão nova por request após a entrega web correspondente.

### Registro de implementação — 18/08/2026 (🟡 parcial)

- `dealDetail(slug)` foi entregue em `packages/web/lib/db.ts`: resolve o slug Mercado Livre, retorna fatos atuais e até 90 dias de observações reais.
- Ainda não existe agendamento recorrente nem revalidação on-demand. Eles dependem da escolha e configuração de uma infraestrutura de execução (GitHub Actions ou host) e de um segredo de revalidação. Sem isso, a home continua dinâmica por segurança de dados.
- **20/08/2026:** infraestrutura decidida — GitHub Actions, `workflow_dispatch` incluso (botão do painel passa a pedir execução ao GitHub). O workflow `.github/workflows/sweep.yml` e o secret `DATABASE_URL` do repositório **ainda não foram criados**.
- **20/08/2026 — coleta/curadoria aplicada:** `src/activity.ts` (classificador puro, janela de 14 dias), `productActivity()` na interface `OfferStore` + `InMemoryStore` + `PostgresStore`, resumo de estado de vida impresso pelo `sweep.ts` e 4 testes novos (11/11 em persistence). Verificação real contra o banco: 41 ativos / 295 recentes / 0 dormentes. **Pendente:** aplicar a mesma derivação na UI (vitrine "recentes", recomendações da área logada) quando houver entrega que a consuma.

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
- Job pós-sweep: para cada alerta ativo, se preço atual < preço no momento da inscrição (ou < alvo), envia e-mail e marca `notified_at`. **Provedor decidido em 20/08/2026: SMTP da Hostinger** — ativa quando o domínio existir (verificação de DNS); checar o limite de envio por hora do plano antes de contar com volume.
- Link de descadastro por token (obrigatório antes do primeiro envio real).

**Depende de:** M1-C (varredura recorrente — alerta sem varredura é promessa vazia).

**Fica de FORA:** digest diário, alerta por categoria, push/WhatsApp.

**Critério de saída:** ciclo real ponta a ponta: inscrição → queda de preço em varredura real → e-mail recebido → descadastro funciona. Evidência: query de `product_alert` com `notified_at` + id da `capture_run` que disparou.

## Fase M4 — Curadoria editorial

**Objetivo:** nenhum produto novo chega ao público sem uma decisão editorial e cada decisão vira dado reaproveitável. A dor real de avaliar o catálogo confirmou a necessidade do admin web e substitui a hipótese anterior de começar por planilha/SQL.

### M4-A — Gate e fila editorial (🟡 código e migration entregues em 01/09/2026; conferência prática pendente)

- `garimpa.product_curation` guarda o estado atual por produto e tenant: `legacy_visible`, `pending`, `approved`, `rejected` ou `held`.
- `garimpa.curation_event` é o histórico append-only. Toda decisão preserva ator, transição, política, motivo estruturado e texto livre.
- Rollout sem apagar a vitrine: o catálogo anterior recebe `legacy_visible` e entra na fila; todo produto inserido depois da migration nasce `pending` por trigger e fica oculto até aprovação.
- Tela dedicada em `/admin/curadoria`, com sessões de 20, evidências objetivas, atalhos, aprovação em um clique, rejeição/espera por chips, “Depois” e desfazer a última decisão.
- “Outro” exige texto livre de 3 a 1000 caracteres, validado na aplicação e no banco. Esse material é preservado justamente para revelar motivos recorrentes e enriquecer uma classificação futura — não treina nem altera uma IA automaticamente.
- O painel avisa quantos produtos aguardam avaliação. Vitrine, detalhe, favoritos, acompanhamento, recomendações e saída afiliada só expõem `approved` ou `legacy_visible`.

### M4-B — Narrativa e priorização (não iniciado; reordenado para depois de M4-H)

- Blurb e scores editoriais continuam separados do gate de elegibilidade. Um produto pode ser aprovado sem ocupar uma vitrine; destaque é uma decisão editorial posterior.
- Fallback derivado quando não há narrativa: gerar texto apenas de fatos do histórico real ("caiu X% desde jul", "estável há N dias"), sem inventar opinião.
- A LLM poderá sugerir prioridade e rascunho somente depois que o contrato de exemplos humanos, a proveniência e a medição em modo sombra estiverem prontos em M4-F/M4-G.
- Esta etapa não bloqueia a curadoria operacional. A ordem recomendada passa a ser M4-C → M4-D → M4-E → M4-F → M4-G → M4-H → M4-B.

### M4-C — Descoberta category-first e controle de saturação (🟡 código entregue em 03/09/2026; rodada real pendente)

**Hipótese que originou a entrega:** buscas amplas como `achadinhos` tendem a espelhar concentração do ranking do marketplace (no caso observado, unhas e acessórios de moto) e empurram trabalho repetitivo para a curadoria. Se isso se repetir, a busca dirigida deve ser o modo principal, não um fallback manual.

- `capture-plan.ts` define o plano inicial `category-first-v1`: 8 consultas dirigidas e 2 exploratórias (80/20). O plano é comum à loja como um todo; cada adapter com capacidade de busca executa as intenções usando sua API oficial.
- Os CLIs de AliExpress e Shopee executam o plano por padrão quando não recebem `--keyword`. `--mode directed|exploratory|all` permite isolar uma parte e `--dry-run` mostra o plano sem API nem banco.
- O termo genérico `achadinhos` deixou de ser fallback da AliExpress. Uma `--keyword` explícita continua disponível como experimento auditável.
- Cada intenção gera sua própria `capture_run`; `parameters` registra plano, consulta, modo, categoria/família-alvo, limites, itens recebidos, itens limitados, páginas lidas e saturação.
- O gate determinístico aceita no máximo 8 candidatos novos por consulta e 5 da mesma família. Com amostra mínima de 10 candidatos, concentração de 60% encerra páginas seguintes e o executor avança para a próxima intenção.
- **Invariante de retenção:** produto já conhecido nunca é bloqueado pela saturação; recebe nova observação de preço normalmente. O limite incide apenas sobre descoberta nova.
- Produto sem família reconhecida não cai num balde “outros” e não é limitado por família. O classificador é conservador para não fabricar semelhança.
- `verify:capture-plan` deriva do banco a integridade das rodadas reais; antes da primeira execução informa `awaiting_real_run` e falha fechado.

**Parâmetros iniciais (calibráveis após dados reais):** 80/20 dirigido/exploratório; 8 novos por consulta; 5 novos por família; saturação em 60% após 10 candidatos; 1 página por consulta nos CLIs.

**Fica de FORA desta entrega:** seleção automática do próximo marketplace pela taxa de aprovação, comparação de custo total entre lojas, agrupamento semântico/LLM, tela para editar o plano e busca automática do Mercado Livre (segue contida pelo kill switch e pelas regras próprias da fonte).

**Critério de saída:** uma rodada real em AliExpress e/ou Shopee verificada por `npm run verify:capture-plan`, seguida de julgamento humano sobre variedade e qualidade da nova fila. Até isso acontecer, o item permanece 🟡.

### Diagnóstico consolidado da curadoria (03/09/2026)

O sistema já controla a entrada e registra decisões individuais, mas a unidade de trabalho da interface ainda é o produto. Isso transforma concentração legítima da captura — por exemplo, 30 manoplas de moto não duplicadas — em 30 decisões repetitivas. A unidade operacional correta é **grupo de semelhantes + exceções**:

1. captura procura variedade e conserva reobservações;
2. agrupamento comprime produtos semelhantes em uma decisão de triagem;
3. avaliação individual fica reservada aos representantes e casos ambíguos;
4. aprovação significa elegibilidade; seleção de vitrine é um contrato separado;
5. IA sugere e explica antes de receber qualquer autoridade automática;
6. cada sugestão, decisão e correção volta ao histórico para medição.

#### Invariantes de produto e segurança

- **I1 — Loja não recebe cota de aprovação.** O pipeline busca cobertura, não “justiça” entre marketplaces. Se a melhor variedade estiver no Mercado Livre, ele pode fornecer mais finalistas.
- **I2 — Saturação não é rejeição.** Produto semelhante pode ser bom e apenas redundante; deve ficar em espera com motivo próprio, sem virar exemplo negativo de qualidade.
- **I3 — Produto conhecido sempre pode ser reobservado.** Limites de descoberta nunca quebram o histórico de preço.
- **I4 — `approved` é elegível, não destacado.** A vitrine consome uma seleção editorial separada; aprovação não garante posição na home.
- **I5 — Decisão humana prevalece.** Sugestão de regra/LLM nunca sobrescreve silenciosamente uma decisão humana.
- **I6 — Falha de IA não bloqueia a operação.** Agrupamento conservador e fila manual continuam funcionando sem provedor/modelo.
- **I7 — Treino reproduz o momento da decisão.** Exemplo de aprendizado usa snapshot imutável das evidências vistas, não apenas os valores atuais do produto.
- **I8 — Toda ação em lote continua auditável por produto.** Cada item recebe evento próprio, ligado ao mesmo grupo/sessão.
- **I9 — Automação nasce em modo sombra.** Nenhuma aprovação ou rejeição automática antes de volume, concordância e falsos positivos medidos.

### Pipeline alvo, ponta a ponta

```text
PLANO DE CAPTURA
  80% consultas dirigidas + 20% exploratórias por loja capaz
        │
        ▼
CAPTURA E NORMALIZAÇÃO
  identidade do anúncio · snapshots · preço · nota · vendas · proveniência
        │
        ├── produto conhecido ─► reobserva sempre
        │
        ▼
GATE DE DESCOBERTA
  limite por consulta · família · detecção de saturação · próxima intenção
        │
        ▼
AGRUPAMENTO EDITORIAL
  categoria + família + similaridade conservadora + representantes
        │
        ├── confiança baixa/sem família ─► fila de produtos singulares
        │
        ▼
TRIAGEM DETERMINÍSTICA
  duplicado exato · indisponível · evidência insuficiente · riscos objetivos
        │
        ▼
SUGESTÃO DE IA (modo sombra primeiro)
  decisão sugerida · motivos · confiança · exemplos humanos recuperados
        │
        ▼
CURADORIA HUMANA
  grupo primeiro → finalistas individuais → resumo da sessão
        │
        ├── approved ─► catálogo elegível
        ├── held ─────► reavaliação por causa explícita
        └── rejected ─► fora do catálogo, com motivo
        │
        ▼
SELEÇÃO EDITORIAL
  home · categoria · destaque · validade/prioridade
        │
        ▼
PUBLICAÇÃO E RESULTADO
  impressão · clique · favorito · alerta · conversão disponível
        │
        ▼
CICLO DE APRENDIZADO
  concordância IA×humano · padrões de “Outro” · aprovação por origem/família
  → ajusta exemplos, política e orçamento futuro de captura
```

#### Comportamento por cenário

| Cenário | Resposta do pipeline |
|---|---|
| 30 manoplas na AliExpress | agrupa, mostra até 5 representantes, permite enviar os demais para espera por saturação |
| Shopee com poucos resultados | registra a baixa cobertura e segue; não aprova produto fraco para cumprir cota |
| Mercado Livre concentra a variedade | seus produtos ocupam mais finalistas, desde que atendam aos mesmos critérios |
| Família desconhecida | não força agrupamento; produto entra como singular até haver padrão suficiente |
| Consulta satura | interrompe páginas seguintes e avança para outra intenção; conhecidos continuam reobservados |
| Produto bom, mas repetitivo | `held/family_saturation`, nunca `rejected/low_utility` |
| Preço ou anúncio perdeu validade | espera com causa operacional e elegibilidade pública bloqueada |
| LLM indisponível ou incerta | fila determinística/manual; nenhuma perda de decisão |
| “Outro” recorrente | entra em relatório; após validação humana pode virar motivo estruturado versionado |

### M4-D — Contrato de agrupamento e contexto imutável (🟡 M4-D.1 aplicada e verificada; aguarda conferência independente)

**Objetivo:** fazer a família criada na captura chegar à curadoria e preservar o que sustentou cada decisão.

- Persistir `family_key`, `family_label`, método e versão do classificador. Família operacional é dado estruturado; não fica escondida apenas em JSON.
- Ligar a fila à consulta e à `capture_run` que apresentou o produto, preservando marketplace, plano, modo e categoria-alvo.
- Criar contrato de grupo editorial por tenant: família, estado, contagem, representantes, método/versão, confiança e timestamps. Um grupo pode reunir lojas diferentes quando os itens forem materialmente comparáveis.
- Acrescentar `family_saturation` aos motivos de espera e persistir "Depois" (`deferred_until` ou contrato equivalente), sem convertê-lo em rejeição.
- No momento da decisão, preencher `curation_event.metadata` com snapshot versionado: título, categoria/família, marketplace, preço, desconto, nota, vendas, histórico, sinais exibidos, captura/grupo e origem da ação.
- Ações em lote escrevem um evento por produto dentro de transação, com `group_id`, `review_session_id` e `bulk_action_id` comuns.

**Fica de FORA:** embeddings, LLM, nova tela visual e decisões automáticas.

**Critério de saída:** qualquer decisão nova pode ser reproduzida sem consultar o estado atual mutável do anúncio; verificador encontra zero decisões humanas novas sem snapshot obrigatório e zero grupos cruzando tenants.

#### Registro de implementação — 03–04/09/2026 (🟡 M4-D.1 aplicada e verificada; conferência pendente)

- **Família estruturada (código):** `product-family.ts` agora expõe `FAMILY_METHOD="title-keywords"`, `FAMILY_RULES_VERSION="v1"` e `familyInfoForTitle()` (key+label+método+versão). `sweep()`/`ingest.ts` classificam cada oferta capturada e o `OfferStore`/`PostgresStore`/`InMemoryStore` persistem `family_key`, `family_label`, `family_method`, `family_version` no produto (coalesce conservador na reobservação; título sem pista nunca apaga família anterior).
- **Migration `20260903200000_garimpa_editorial_context.sql` (aplicada no banco compartilhado; constatação read-only em 04/09):**
  1. `product.family_*` + check de presença em par + índice parcial por tenant/família;
  2. `product_curation.deferred_until` + check `deferred_until is null or status in (pending, legacy_visible, held)` + índice;
  3. `family_saturation` admitido como motivo de espera (`held`) nas constraints das duas tabelas (rejeição continua sem ele);
  4. `curation_event.group_id/review_session_id/bulk_action_id` (texto, sem FK — grupo é determinístico por tenant+família+método/versão, não tabela);
  5. view `garimpa.curation_queue_facts`: observação atual, mínimo anterior (exclui a linha atual), dias de histórico, `lowest_verified`, família e proveniência da captura (primeira observação com `capture_run_id` → plano/modo/categoria-alvo) — fonte única para a tela e o snapshot.
- **Snapshot obrigatório (código):** `reviewProduct`, `reviewProductsBulk` e `undoReview` gravam `metadata.snapshot_version=1` + `metadata.snapshot` com fatos da view (`curation-snapshot.ts`, puro) — título, URL da imagem, categoria, família, marketplace, slug, preço, desconto, nota, vendas, histórico, sinais objetivos exibidos (`curation-signals.ts`, compartilhado com a mesa editorial), proveniência e origem da ação (via, grupo, sessão, lote, evento de undo). Produto sem observação não tem decisão possível (sem snapshot não há evento).
- **Mesa editorial:** sinais objetivos passam a vir do módulo compartilhado (mesmos textos, mesma ordem); chips de espera ganham "Saturação de família" automaticamente.
- **Grupo editorial (contrato puro):** `editorial-groups.ts` deriva grupos por tenant+família (id determinístico `grp_<hash64>`), nunca cruza tenant, `state open/resolved`, representantes até 5 por evidência `[EVAL]`, singulares fora de balde. A borda de banco recalcula o id a partir dos fatos persistidos e rejeita `group_id` arbitrário enviado pelo cliente. Materialização/persistência e tela ficam para M4-E (grupo é derivado nesta entrega, como o estado de vida do catálogo).
- **"Depois":** contrato de adiamento (`validateCurationDeferral`, ≤ 30 dias, futuro) + `deferReview`/`clearDeferredReview` no banco; fila e contadores excluem produtos com `deferred_until` futuro. A tela continua tratando "Depois" localmente — **decidir em M4-E** se o botão passa a persistir (mudança de comportamento visível).
- **Correção M4-D.1 (`20260904173316_harden_editorial_context.sql`, aplicada em 04/09):** cada evento novo preserva `from_reason_code`, `from_reason_detail` e `from_deferred_until`; decidir limpa o adiamento e desfazer restaura status, motivo, detalhe e adiamento. Eventos legados sem motivo anterior suficiente falham fechado. Lote rejeita produto repetido antes da transação.
- **Verificadores:** `npm run verify:editorial-context` exige o schema corretivo e evidência real: sem qualquer snapshot responde `awaiting_snapshot_evidence`/`ok=false`; com evidência valida versão, chaves obrigatórias e tipos essenciais, além de família, grupos entre tenants e adiamentos em status final. `backfill:family` continua modo sombra por padrão.
- **Evidência do banco em 04/09:** schema M4-D presente; 571 produtos, 104 com família e 467 sem família; 0 pares quebrados; 571 estados editoriais; nenhuma decisão com snapshot ainda (`firstSnapshotAt=null`). O registro anterior que dizia “migration não aplicada” estava incorreto e fica explicitamente retratado por este item.
- **Verificação da M4-D.1 (04/09):** persistence 22/22, capture 120/120 e testes direcionados web 22/22; suíte web completa 140/148, mantendo as mesmas 8 falhas pré-existentes fora do escopo; typechecks de web/persistence/capture e build web de produção limpos. Prova real controlada no produto `00c6f380-9556-4a51-aad1-efe27599d60d`: aprovação gerou evento `43`, undo gerou `44`, adiamento foi consumido, estado anterior foi capturado, snapshot v1 continha `imageUrl` e o estado final foi restaurado exatamente.
- **Evidência derivada do banco:** `verify:editorial-context` retornou `status=verified`/`ok=true`, 571 produtos, 104 com família, 0 pares quebrados, 0 snapshots ausentes/malformados, 0 grupos/lotes cruzando tenant e 0 adiamentos em status final. `verify:curation` manteve 571/571 estados, 37 aprovados, 529 legados e 5 rejeitados; a prova não alterou a distribuição final. O histórico remoto contém a versão `20260904173316`.
- **Cicatriz de migration:** `db push --dry-run` com a role da aplicação falhou por permissão em `supabase_migrations`; o vínculo administrativo revelou timestamps remotos antigos divergentes dos nomes locais. Para não usar `--include-all` nem reaplicar migrations, foi executado somente o arquivo corretivo via `db query --linked` e reparada somente a versão `20260904173316`. A divergência histórica anterior permanece fora desta entrega e deve ser reconciliada separadamente.
- **Pendências registradas:** decisão humana sobre persistir "Depois" na mesa (M4-E) e conferência independente. A view já usa `security_invoker=true`.

### M4-E — Caixa de entrada por grupos e sessão prática (🟡 implementada em 05/09/2026; aguarda conferência independente de M4-D.1 e M4-E)

**Objetivo:** reduzir centenas de produtos capturados a poucas decisões significativas sem transformar a curadoria em questionário.

- **Notificação por carga decisória:** o painel admin (`/admin`) e a entrada da curadoria exibem a carga real de esforço humano em vez de contagem crua: *"X grupos e Y produtos singulares aguardam avaliação — Z produtos capturados"* (`formatDecisionLoad`).
- **Navegação estruturada em 4 abas em `/admin/curadoria`:**
  - `Hoje`: mesa individual de 20 produtos (preservada de M4-D como segunda etapa para itens singulares, finalistas e casos ambíguos), com navegação por teclado, botão "Rever em 7 dias" (`deferred_until`) e botão "Encerrar sessão".
  - `Grupos repetitivos`: cards de grupos canônicos com família/motivo, contagem de itens, distribuição por marketplace, faixa de preço (mínimo e máximo), até 5 representantes ordenados por evidência + diversidade de marketplace, expansão sob demanda via server action (`fetchGroupMembers`), e ações em massa.
  - `Em espera`: visualização dos produtos retidos com motivo estruturado e dos produtos adiados com prazo programado (`deferred_until`), permitindo a antecipação imediata para a fila ativa.
  - `Aprendizados`: métricas consolidadas de decisões humanas, taxa de compressão (produtos por decisão humana), distribuição de motivos e histórico auditável com os textos livres digitados em "Outro" (3 a 1000 caracteres).
- **Ações atômicas de grupo (`actOnGroup`):**
  - Validação estrita no servidor: o hash do grupo canônico é recalculado a partir dos dados do banco para o tenant e família; clientes maliciosos ou desatualizados com hashes forjados falham fechado (`invalid_group_id`).
  - Prevenção contra produtos duplicados antes de iniciar a transação.
  - Ação combo canônica: o curador aprova até 5 representantes selecionados e, em transação única, todos os demais membros não selecionados do grupo são retidos automaticamente como saturação de família (`held/family_saturation`), nunca rejeição.
  - Cada produto afetado recebe evento append-only com `snapshot_v1` imutável, compartilhando `group_id`, `review_session_id` e `bulk_action_id`.
- **Desfazer atômico de ação em lote (`undoBulkReview`):**
  - Desfaz atomicamente todos os produtos afetados por um `bulk_action_id`, restaurando status, motivo, detalhe e adiamento anteriores (`stateRestoredByUndo`), registrando eventos de undo auditáveis.
- **Isolamento de vitrine:**
  - Consultas da vitrine e busca pública continuam restritas a `approved` e `legacy_visible`; itens `pending`, `held` (saturação e evidência) e `rejected` permanecem estritamente isolados.
- **Fica de FORA:** sugestão por LLM, embeddings e automação da seleção da home (permanecem reservados para M4-F a M4-H).

**Critério de saída:** cenário-fixação com 30 itens semelhantes resolvido com 1 ação e até 5 representantes; todos os 30 recebem estado/evento correto; fluxo auditável e responsivo em viewport móvel. Verificado por 31 testes unitários em `packages/web` e 22 em `packages/persistence`.

### UX operacional — rodagens agrupadas por execução (🟡 implementada em 05/09/2026)

**Objetivo:** fazer a tabela representar a operação que o dono disparou, mantendo cada consulta disponível para diagnóstico.

- A unidade principal da tabela é a execução do plano; consultas por categoria ou exploração são linhas filhas recolhidas por padrão.
- `captureExecutionId` é persistido em toda consulta nova. Para o histórico category-first, a compatibilidade deriva o prefixo de `collector_run_id` somente com correspondência exata de `captureQueryId`; nenhuma heurística por minuto/data é aceita.
- O status pai é `rodando` se houver filho em andamento, `erro` se todos falharem, `parcial` se houver sucesso e erro, e `ok` quando todos concluírem; execução ok com zero itens continua marcada como `vazia`.
- O limite da leitura e a métrica do painel contam execuções completas, enquanto a expansão expõe os contadores e sinais de cada consulta.
- Prova real: 12 linhas recentes da AliExpress → 3 execuções; maior execução → 10 consultas. Prova automatizada: 4 testes de identidade/agregação; persistence 22/22; typechecks limpos.
- **Critério de saída pendente:** conferência independente do roteiro `pedido-conferencia-rodagens-agrupadas.md` e veredito humano no painel autenticado.

### M4-F — Dataset humano e observabilidade editorial (⬜)

**Objetivo:** transformar histórico auditável em exemplos confiáveis antes de chamar uma LLM.

- Criar leitura/versionamento `curation_training_example_v1`, derivada de evento humano final + snapshot, sem materializar cópias prematuramente.
- Excluir `legacy_visible` como rótulo humano; consolidar desfazimentos; não colapsar `held` em rejeição; distinguir saturação de inadequação.
- Relatório por período, loja, consulta, categoria, família e motivo: aprovação, rejeição, espera, tempo por decisão, compressão grupo/produto e frequência de “Outro”.
- Relatório de cobertura aponta categorias prometidas sem finalistas e fontes/consultas que geram esforço com pouco aproveitamento.
- Revisão semanal promove um padrão de “Outro” a motivo estruturado apenas por decisão do dono e com nova `policy_version`.

**Fica de FORA:** chamada a provedor de IA e fine-tuning.

**Critério de saída:** amostra aleatória do dataset é rederivável dos eventos; totais conciliam com o banco; relatório identifica separadamente qualidade ruim, falta de evidência e saturação.

### M4-G — LLM em modo sombra e recuperação de exemplos (⬜)

**Objetivo:** medir se uma LLM consegue antecipar a decisão humana sem influenciá-la.

- Para cada caso, recuperar exemplos humanos semelhantes por família/categoria/motivo e enviar apenas evidências disponíveis no momento da revisão.
- Saída estruturada e validada: `suggested_status`, `reason_codes[]`, explicação curta, sinais usados, `confidence` calibrável e `policy_version`.
- Persistir avaliação em registro separado da decisão humana: modelo/provedor, versão de prompt, custo, latência, exemplos usados e resposta estruturada.
- A sugestão fica invisível até o humano decidir. Depois, calcular concordância, matriz de confusão, desempenho por família/motivo e calibração da confiança.
- Redação livre e imagens devem ser tratadas como conteúdo não confiável do anúncio; nunca como instrução para o modelo.

**Fica de FORA:** sugestão visível, decisão automática, fine-tuning e geração de copy pública.

**Critério de saída:** conjunto de avaliação temporal sem vazamento; métricas por classe disponíveis; nenhuma execução da LLM altera `product_curation`.

### M4-H — Copiloto visível e revisão por exceção (⬜)

**Objetivo:** usar a IA para acelerar, mantendo responsabilidade humana explícita.

- Mostrar sugestão, justificativa, confiança e casos semelhantes; não exibir confiança como “certeza”.
- Priorizar divergências, baixa confiança, novos padrões e grupos de alto impacto.
- Aceitar, corrigir ou ignorar sugestão em um clique. A correção humana gera o rótulo canônico e vínculo explícito com a avaliação da IA.
- Regras determinísticas continuam responsáveis por invariantes e gates objetivos; LLM lida com julgamento semântico, não com integridade do banco.
- Primeira autoridade automática permitida, após métricas, é somente **reter para revisão**, ação reversível. Aprovar ou rejeitar automaticamente exige decisão de produto separada.

**Critérios mínimos para considerar automação** `[EVAL]`: volume suficiente em cada classe relevante; avaliação temporal em rodadas posteriores; concordância e falso aceite medidos por família; desempenho estável após mudança de marketplace/prompt. Os limiares numéricos só viram `[MEDIDO]` depois do modo sombra.

**Fica de FORA:** fine-tuning e publicação automática irreversível.

**Critério de saída:** redução mensurável do tempo por sessão sem aumento de correções; toda divergência é recuperável; desligar a IA mantém o workflow completo.

### M4-I — Seleção editorial e realimentação da captura (⬜)

**Objetivo:** separar qualidade do produto, espaço de vitrine e estratégia de descoberta.

- Criar seleção por placement (`home`, categoria, destaque), prioridade e vigência; apenas produtos `approved` podem ser selecionados.
- Expiração/indisponibilidade remove da seleção sem apagar a aprovação histórica.
- O planejador futuro usa sinais agregados — cobertura, aprovação por consulta/família, saturação e vantagem observada — para propor orçamento da próxima rodada.
- Mudança de orçamento é versionada e inicialmente aprovada pelo humano. Exploração nunca cai a zero, evitando aprisionamento nas preferências já observadas.
- Comparação entre lojas considera oportunidade para o cliente, não cota de marketplace; custo total/frete só entra quando a fonte oferecer dado confiável.

**Fica de FORA:** atribuir categoria exclusiva a uma loja, garantir igualdade de exposição e otimizar por conversão sem atribuição confiável.

**Critério de saída:** vitrine pode ser composta sem alterar o status de curadoria; proposta de próxima captura explica quais sinais mudaram cada orçamento e conserva uma parcela exploratória.

### M4-J — Fine-tuning como decisão posterior (⬜ condicionado)

Fine-tuning não é uma fase obrigatória. Só abre se M4-G/H provar que recuperação de exemplos + prompt versionado tem limite persistente, houver exemplos humanos suficientes e estáveis por classe e o ganho esperado justificar custo operacional. O primeiro candidato de fine-tuning é classificação estruturada; geração de narrativa pública permanece tarefa distinta.

### Workflow operacional

**A cada rodada**

1. Executar plano por marketplace permitido e registrar uma `capture_run` por intenção.
2. Reobservar conhecidos; limitar apenas novidades; avançar ao detectar saturação.
3. Formar grupos, representantes e singulares; aplicar triagem objetiva.
4. Atualizar a notificação pela quantidade de decisões, não pelo volume bruto.

**Validade operacional do catálogo (decisão de 06/09/2026)**

1. Oferta só é pública quando está `approved` e foi reobservada nos últimos 7 dias.
2. `legacy_visible` é apenas um estado histórico/de transição; não concede mais publicação.
3. Pendência vencida sai automaticamente da fila humana. Não é rejeitada nem apagada, porque ausência na fonte não prova indisponibilidade.
4. Qualquer nova observação renova `last_seen_at`, inclusive com preço igual, e recoloca o item no fluxo correspondente ao estado editorial existente.
5. Decisões e snapshots antigos permanecem disponíveis para o dataset de aprendizado; prazo de exposição e aprendizado editorial são responsabilidades separadas.
6. A limpeza inicial de 06/09 foi gravada como lote reproduzível por `npm run curate:initial -- --apply`: 44 decisões da LLM, sem exclusão física, reduziram a vitrine vigente de 64 para 20 produtos.

**Sessão diária do curador (meta: 10–15 minutos, `[EVAL]`)**

1. Resolver grupos repetitivos primeiro.
2. Escolher representantes e reter redundantes com motivo explícito.
3. Avaliar finalistas/singulares na mesa individual.
4. Revisar dúvidas e sugestões somente quando existirem.
5. Encerrar e ler o resumo; não exigir justificativa textual por produto.

**Revisão semanal**

1. Conferir cobertura por categoria e concentração por família/loja.
2. Ver aprovação por consulta e esforço desperdiçado.
3. Revisar espera antiga e padrões de “Outro”.
4. Ajustar taxonomia, motivos ou plano apenas com evidência registrada.
5. Quando M4-G existir, revisar erros da IA, não somente a média de concordância.

**Revisão mensal de política**

1. Versionar mudanças editoriais.
2. Congelar um conjunto temporal de avaliação.
3. Decidir se alguma ação reversível ganha automação.
4. Reavaliar a necessidade de fine-tuning.

### Métricas do sistema

| Métrica | Pergunta |
|---|---|
| compressão (`produtos / decisões humanas`) | agrupamento está poupando trabalho? |
| tempo mediano por sessão e decisão | a experiência está realmente prática? |
| cobertura por categoria | a promessa editorial está sendo atendida? |
| concentração por família | a captura voltou a espelhar um ranking estreito? |
| aprovação por consulta/fonte/família | quais buscas trazem material útil? |
| espera por causa e idade | estamos usando espera como cemitério? |
| frequência e temas de “Outro” | quais critérios ainda não foram formalizados? |
| concordância IA×humano por classe | em que decisões a IA ajuda? |
| falso aceite e falso descarte | qual o risco real da automação? |
| correções após aprovação | a política e as evidências são confiáveis? |

### Registro inicial de parâmetros

| Parâmetro | Valor inicial | Status | Observação |
|---|---:|---|---|
| consultas dirigidas/exploratórias | 80/20 | `[EVAL]` | já implementado em M4-C; depende de rodada real |
| novos por consulta | 8 | `[EVAL]` | gate de descoberta |
| novos por família/consulta | 5 | `[EVAL]` | gate de descoberta |
| saturação | 60% após 10 candidatos | `[EVAL]` | encerra páginas da intenção |
| representantes visíveis por grupo | até 5 | `[EVAL]` | precisa preservar diferenças relevantes |
| duração da sessão | 10–15 min | `[EVAL]` | meta de operação, não timeout |
| exploração mínima futura | maior que zero | `[PRODUTO]` | impede ciclo fechado de preferência |

### Sequenciamento recomendado da próxima etapa

1. **Fechar M4-C:** uma rodada real + `verify:capture-plan` + julgamento de variedade (aguarda autorização de rodada).
2. **Conferir M4-D.1 e M4-E:** executar o pedido de conferência independente de M4-D.1 e M4-E (`docs/tecnico/pedido-conferencia-m4e.md`).
3. **M4-F:** dataset humano e painel de aprendizado.
4. **M4-G:** LLM invisível em modo sombra.
5. **M4-H:** copiloto visível, se as métricas justificarem.
6. **M4-I:** placements e realimentação versionada do plano de captura.
7. **M4-B:** narrativa e priorização pública sobre a seleção já estabilizada.
8. **M4-J:** avaliar fine-tuning; não presumir que será necessário.

**Próxima entrega fechada:** Auditoria e conferência independente de M4-D.1 e M4-E (`pedido-conferencia-m4e.md`). M4-E permanece 🟡 até aprovação formal. Não avançar para M4-F ou LLMs antes do veredito independente.

---

## Ordem e dependências

```
M1-A (evidência ML) ─► M1-B (preço honesto) ─► UX-1
                              │
                              └─► M1-C (cron + detalhe) ─► UX-2 ─► M3 (alertas)
M2 (categoria) ─► UX-3
M4-C (descoberta dirigida) ─► M4-A (fila editorial) ─► UX-4
```

M1-A é a primeira entrega porque fecha um caminho completo e pequeno — fonte → contrato → banco → consulta — e prepara a prova que a UX passará a exibir. M1-B vem imediatamente depois porque corrige a afirmação falsa hoje visível ao público.

## Regras desta instância

- **Toda afirmação de execução real sai de script, não de narrativa** (`verify-lowest.ts` e sucessores). Cicatriz de origem: selo "menor preço" exibido 24× sem sustentação no dado.
- Migration nova sempre com `tenant_id` e `where tenant_id` em toda query (modelo-de-dados.md — irreversível depois).
- Append-only em `price_observation`: nenhuma fase pode reescrever histórico.
- Toda entrega termina com **pedido de conferência** antes de ✅; contagem de testes declarada no relatório.

## Escada de verificação da instância motor

1. `npm run typecheck` + testes existentes (capture: 120/120; persistence: suíte atual) — tudo
2. Testes novos com fixture/InMemoryStore — toda lógica nova
3. Query de conferência contra o banco real — mudança de dado visível
4. Varredura real + script de verificação derivada — caminho crítico (selo, alerta)
5. Veredito do dono — fórmula de ranking, copy de e-mail, custo de provedor
