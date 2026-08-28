# Mercado Livre — Engenharia Reversa do Link de Afiliado

**Registro de experimento — 17–18/08/2026**

Como descobrimos, por engenharia reversa ética (observação + experimento controlado), construir links de afiliado do Mercado Livre programaticamente — algo que a API oficial não oferece e que a concorrência trata como impossível.

---

## Resumo executivo

| Questão | Resposta | Confiança |
|---|---|---|
| Dá para gerar link de afiliado por código? | **Sim** — permalink + `matt_word` + `matt_tool` + `forceInApp` | ✅ Provado em campo |
| O `ref` criptografado é necessário? | **Não** — link sem ele contabilizou clique | ✅ Provado em campo |
| Dá para rastrear por publicação? | **Sim** — sufixo `_subid` no `matt_word` passou junto | ✅ Provado em campo |
| Dá para descobrir produtos automaticamente? | **Sim** — página pública `/ofertas` renderiza ofertas no servidor | ✅ Funcionando |
| O painel conta cliques em tempo real? | **Não** — atualiza em lotes com atraso de segundos a horas | ✅ Provado em campo |

---

## 1. Anatomia do link de afiliado

URL canônica de produto do ML com parâmetros pendurados:

```
https://produto.mercadolivre.com.br/MLB-5414849184-chocalho-...-_JM
  ?matt_word=juem4482159_minhapub    ← ID do afiliado + sufixo de sub-atribuição
  &matt_tool=99838509                ← ID fixo por conta (não muda entre links)
  &forceInApp=true                   ← força deep-link do app
```

Descoberto via `link-trace.ts` (tracer de cadeia de redirects): expandimos shortlinks `meli.la` gerados no painel de afiliados e observamos os parâmetros que o próprio ML injeta.

**Peças:**
- `matt_word` = `{trackingId}_{subId}`. O `subId` é opcional e **passa intacto** — é a sub-atribuição por publicação (diferencial competitivo: saber qual post gerou qual comissão).
- `matt_tool` = ID numérico fixo por conta de afiliado. Obtém-se **uma vez** (via trace de um shortlink próprio) e configura no tenant.
- `ref` = token opaco, único por link, gerado server-side. **Provamos que é dispensável** para atribuição de clique.

## 2. Prova de campo (o experimento decisivo)

**17/08/2026.** Link do chocalho (MLB5414849184) construído 100% por código, com sufixo `linklab001`, aberto em aba anônima:

- ✅ Contador "cliques totais" no painel: 0 → 1 **na hora**
- ✅ Sem `ref`, sem shortlink, sem passar pelo painel
- Conclusão: `matt_word + matt_tool + forceInApp` **suficiente** para atribuição
- **Acúmulo até 18/08 (tarde): 4 cliques totais no painel** — atribuição continua contando consistentemente com o atraso esperado do §6

Registrado no código: estratégia `matt_full` em `src/adapters/mercadolivre/affiliate-link.ts` marcada `verified: true`, com teste guarda impedindo marcar outra estratégia como verificada sem experimento correspondente.


## 3. Descoberta de produtos: página pública de Ofertas

A API oficial de busca (`/sites/MLB/search`, `/items/{id}`) **retorna 403 para apps não certificadas** (política `PA_UNAUTHORIZED_RESULT_FROM_POLICIES`, em vigor desde 2025). A app autentica normal (`/users/me` = 200), mas não vê catálogo.

**Alternativa descoberta e validada:**

```
GET https://www.mercadolivre.com.br/ofertas        (HTML público, sem login)
→ ~44 cards com título, preço, % OFF, href real do produto
GET .../ofertas?page=2                              (paginação funciona)
```

- Renderizado no servidor: **fetch simples resolve**, sem navegador/headless.
- Cards usam componentes `poly-card` / `poly-component__*` (padrão Andes do ML).
- **Conformidade E0 (25/08/2026):** o acesso automatizado a esta página está **desligado por default** (kill switch `ML_AUTOMATED_CAPTURE_ENABLED`, só development). O texto original desta seção planejava "varredura a cada 30–60 min" como cadência aceitável — essa recomendação foi **suplantada**: a captura vigente é humana (bookmarklet/extensão). O parser/fixtures permanecem como ferramenta offline.

## 4. A regra de ouro: nunca construir permalink do zero

**Lições de 18/08 (teste ponta a ponta que NÃO contabilizou):**

1. Construímos um permalink com slug gerado do título + `_JM`. O slug canônico do ML **não é adivinhável** (ex.: "preto/vermelho" → `pretovermelho`).
2. Link com slug errado → ML corrige com **redirect** → **parâmetros `matt_*` descartados** no redirect → página abre normal, mas sem afiliação.
3. Além disso, muitos cards de Ofertas apontam para **páginas de catálogo** (`/p/MLB...`), não para anúncio direto; o ID do item real vem no parâmetro `wid=MLB...` do href.

**Regra para o adapter:** usar sempre o **`href` que vem no card** (limpo de fragmento/tracking) e apenas pendurar os `matt_*`. O `wid` serve como identificador do item para deduplicação/histórico.

> ⚠️ Nota 18/08: mesmo com href real, clique de teste não contabilizou — mas o **controle idêntico ao de ontem também não**. Evidência de problema no registro/contador, não na URL (ver §6).

## 5. Restrições e armadilhas conhecidas

- **Anti-bot**: acesso automatizado a páginas de produto responde `302 → /gz/account-verification`. O parser de Ofertas lê HTML de **listagem** (sem esse bloqueio), mas **nunca devemos clicar/abrir links de produção por código** — validação de clique é sempre manual.
- **API de listas/favoritos**: não existe endpoint público (`/users/{id}/bookmarks`, `/lists` etc. = 404). A vitrine `/social/{usuario}` é alimentada por serviço interno não documentado. **Decisão: não usar a vitrine como fila** — as Ofertas a tornam desnecessária.
- **Certificação da app**: única via para `/search` oficial. Solicitar no DevCenter quando o volume justificar.
- **Puppeteer/headless**: tecnicamente viável para busca, mas **decidido não usar** (ToS, risco recai sobre a conta do cliente, custo de manutenção).

## 6. Granularidade do contador: RESOLVIDO (delay, não dedup)

**Crônica dos experimentos:**

| Teste | Resultado no momento | Resultado final |
|---|---|---|
| 17/08: chocalho, `linklab001`, anônima, mesmo PC | ✅ 0→1 na hora | ✅ |
| 18/08: bicicleta, permalink construído (errado) | ❌ parecia | ✅ contou com atraso |
| 18/08: bicicleta, href real do card | ❌ parecia | ✅ contou com atraso |
| 18/08: chocalho idêntico ao de ontem, sufixo novo | ❌ parecia | ✅ contou com atraso |
| 18/08: cortina da vitrine, `vitrine01` | ✅ 1→3 na hora | ✅ |

**Desfecho:** ao clicar na cortina, o contador saltou 1 → 3 — revelando que os cliques "perdidos" do dia haviam sido contabilizados **com atraso de horas**. Hipóteses de dedup por visitante e de "vitrine como pré-requisito" foram **derrubadas**.

**Conclusões:**
1. O contador "cliques totais" do painel **atualiza em lotes** com latência variável (de segundos a horas). Nunca tratar como tempo real.
2. A atribuição funciona para **qualquer produto** — na vitrine ou fora, href real ou permalink (o permalink "errado" da bicicleta contou, sugerindo que o redirect preserva os `matt_*` ao corrigir o slug; a regra do §4 continua sendo a prática recomendada por robustez).
3. **Implicação para o produto:** as métricas de clique lidas do painel ML devem ser tratadas como *eventualmente atrasadas*; diferenciais do Garimpa (cliques por publicação, por produto) devem vir da nossa própria telemetria de saída, não do painel.

**Resta um experimento final:** comissão real (compra via link gerado) — confirma o ciclo completo.

## 7. Artefatos no código

| Artefato | Onde | Status |
|---|---|---|
| Estratégias de link + `matt_full` verificada | `packages/capture/src/adapters/mercadolivre/affiliate-link.ts` | ✅ testado |
| Parser + adapter da página /ofertas (`linkGeneration: true`) | `packages/capture/src/adapters/mercadolivre/deals.ts` (+ `test/deals.test.ts`, fixture real em `test/fixtures/ofertas-sample.html`) | ✅ 70/70 |
| Tracer de redirects | `packages/capture/src/adapters/mercadolivre/link-trace.ts` + `bin/link-lab.ts --trace` | ✅ |
| OAuth 2.0 + PKCE | `packages/capture/bin/oauth-login.ts` | ✅ funcionando |
| Persistência + ingestão (/ofertas → banco) | `packages/persistence` | ver `roadmap.md` |

Scripts `tmp-*.mjs` descartados após promoção a código testado; `tmp-ofertas.html` mantido apenas como origem do fixture.

## 8. Pendências

1. [x] ~~Experimento do visitante externo / contador~~ — resolvido em 18/08: era delay do painel, não dedup (§6)
2. [x] ~~Promover parser de Ofertas a `DealsAdapter` testado~~ — feito 18/08 (`deals.ts`, 70/70)
3. [x] ~~`linkGeneration: true`~~ — no `MercadoLivreDealsAdapter` (a fonte correta). O `MercadoLivreAdapter` de API oficial permanece `false` de propósito: lá não há como gerar link (API de afiliados não existe)
4. [ ] Solicitar certificação da app no DevCenter (desbloqueia `/search` e `/items`) — app nova `BizuMiner` (id `8327388871751867`) criada 24/08/2026 com scopes corretos mas `certification_status: not_certified`; ver mapa de capacidades na seção 10
5. [ ] **Rotacionar client secret e refresh token** — decidido: só antes da subida pra produção (testes rodam só na máquina local até lá)
6. [ ] Teste final: comissão real (compra através de link gerado)

## 9. Roadmap

Ver [`roadmap.md`](./roadmap.md) — fases de implementação até a página web pública.

## 10. Mapa de capacidades da API oficial (verificado em 24/08/2026)

Teste ponta a ponta com a app `BizuMiner` (id `8327388871751867`, criada 24/08/2026), token OAuth recém-gerado via `oauth-login.ts` com PKCE. Scopes da app: `urn:ml:mktp:publish-sync:/read-only`, `urn:ml:mktp:offers:/read-only`, `read`, `offline_access`. Status crítico da app: **`certification_status: not_certified`**.

### O que a API oficial retorna (HTTP 200)

| Recurso | Endpoint | Observação |
|---|---|---|
| Perfil do usuário autenticado | `GET /users/me` | valida o token; nickname, CPF, reputação do dono |
| Site | `GET /sites/MLB` | moeda, métodos de pagamento |
| Árvore de categorias | `GET /sites/MLB/categories` | IDs e nomes de todas as categorias |
| Best-sellers por categoria | `GET /highlights/MLB/category/{category_id}` | 20 IDs de **produto do catálogo** (tipo `PRODUCT`, não anúncio) |
| Tendências de busca | `GET /trends/MLB` | keywords em alta + URL de lista correspondente |
| Catálogo do produto | `GET /products/{id}` | nome canônico, atributos, variantes (`pickers`), fotos, domínio, família |
| Itens do próprio vendedor | `GET /users/{id}/items/search` | só anúncios da conta autenticada; sem anúncios = lista vazia |

### O que continua bloqueado (HTTP 403)

| Recurso | Endpoint | Motivo |
|---|---|---|
| Busca por palavra-chave | `GET /sites/MLB/search?q=` | certificação exigida |
| Detalhe do anúncio | `GET /items/{id}` | certificação exigida |
| Multiget de anúncios | `GET /items?ids=` | certificação exigida |
| Promoções | `GET /seller-promotions/...` | certificação exigida |
| Buy box (preço ativo) | campo `buy_box_winner` em `GET /products/{id}` | vem **vazio** por depender de `/items` |

### Erros observados — como diferenciar a causa

| Erro | Significado |
|---|---|
| `403` com `PA_UNAUTHORIZED_RESULT_FROM_POLICIES` | **Permissão funcional** (scope) não habilitada ou sem o escopo no token. Problema de configuração do DevCenter. |
| `403` genérico `{"error":"forbidden"}` ou `access_denied` ("Access to the requested resource is forbidden") | **Certificação**: scopes certos, mas app não certificada. É o caso atual. |
| `/products/{id}` com `buy_box_winner: null` | Consequência do `/items` bloqueado — o preço vivo do catálogo não é entregue. |

### Conclusão operacional

Com a app não certificada, a API oficial **não substitui** o scraping de `/ofertas`:

- **Descoberta + preço** continuam no `MercadoLivreDealsAdapter` (scraping da listagem `/ofertas`).
- A API oficial é fonte **complementar** de metadados: categorias, tendências, best-sellers e catálogo.
- O catálogo (`/products/{id}`) serve para **enriquecer** o produto já descoberto pelo scraping — nome canônico, atributos, variantes, fotos de alta resolução — sem tocar em preço.
- Qualquer uso de preço oficial depende de certificação; até lá, o preço vem só do parser de `/ofertas` (com histórico próprio via `price_observation`).

### Caminho para destravar `/search` e `/items`

Certificação da app (Developer Partner Program). Enquanto `certification_status` for `not_certified`, os endpoints de anúncio ficam fechados. Status consultável em `GET /applications/{app_id}` → campo `certification_status` (também `blocked`, `disabled` e `scopes` — útil para debug de 403).

