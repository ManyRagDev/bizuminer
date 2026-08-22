# Plano — Camada de Distribuição

**Criado em 20/08/2026.** Como um produto do catálogo vira um clique num grupo de WhatsApp ou no canal do Telegram.

Contexto que este plano assume (do documento mestre): **vocês são o único canal**. O cliente não espalha. Sem loop viral, cada publicação é trabalho seu — então a ferramenta existe para que esse trabalho renda mais por unidade de esforço.

Status: ✅ feito e conferido · 🟡 parcial · ⬜ não iniciado

---

## Decisões desta versão

| Decisão | Valor | Consequência |
|---|---|---|
| Conteúdo do card | **Só selo em texto**, sem mini-gráfico | v1 sai muito mais rápido; o gráfico entra quando o histórico for denso o bastante para desenhar curva |
| Canal do Telegram | **Público desde o início** | Cada post é indexável e o link do canal pode ser divulgado; sem período de teste fechado |
| Cadência de publicação | **Flexível — será testada** | O composer não pode assumir nem um-a-um nem lote. Ver seção "Composer" |

**Confirmações do dono em 20/08/2026 (redação oficial):** o painel do dono é o **oráculo** — composer (D-2) e publicação no Telegram (D-5) são escopo confirmado, com rodagem acionada pela plataforma via GitHub Actions (M1-C), sem entrar no código. WhatsApp permanece manual para sempre. Shopee e Amazon pendentes de credencial de afiliado não alteram este plano (D-1..D-6 são agnósticos de loja).

---

## 1. O card de compartilhamento

Quando alguém cola o link no WhatsApp, o card **é** o produto. Ele nasce de `/bizu/[slug]/opengraph-image` via `next/og`, gerado no servidor.

**O que entra:** foto do produto, título, preço atual, e **um selo de texto** com o que o histórico sustenta. Mais a assinatura BizuMiner e a divulgação de afiliado.

**O selo segue a mesma regra da vitrine** — só fala quando o dado sustenta, e nunca inventa:

| Estado real | Selo no card |
|---|---|
| `lowest_verified` | "menor preço desde que começamos a acompanhar" |
| Preço abaixo do menor registro anterior | "caiu X% do menor que já registramos" |
| Sem histórico suficiente | nenhum selo — só produto e preço |

**Fatos técnicos que mordem se ignorados:**

- **O preview é cacheado quase para sempre.** WhatsApp e Telegram buscam uma vez e guardam. O card precisa estar certo **antes** da primeira distribuição em volume — corrigir depois não conserta os links já postados.
- **No WhatsApp, só o primeiro link da mensagem gera preview.** Isso tem consequência de produto: mensagem com cinco produtos perde o card de quatro deles. Ver "Composer".
- **Nada de encurtador de terceiros:** quebra o preview e cheira a spam. Se precisar encurtar, é no domínio próprio.

---

## 2. A copy

**Princípio:** mensagem que parece anúncio é ignorada; mensagem que parece uma pessoa é aberta. O objetivo não é disfarçar persuasão — é soar humano.

**Regras de forma:** minúsculas, curto, no máximo um emoji, sem caixa alta, sem contagem regressiva, sem "corre que acaba". A divulgação de afiliado aparece de forma discreta mas presente (exigência legal e da plataforma).

**Regra de conteúdo:** o gatilho sai do dado real. É o que só vocês podem dizer, e é o que sobrevive ao clique seguinte — se o texto promete urgência e a página entrega "3 registros de preço", queima-se a única coisa que diferencia o BizuMiner.

**Repertório por sinal**, para o texto variar junto com o produto (e não virar padrão reconhecível):

| Sinal | Exemplos |
|---|---|
| Menor preço verificado | "esse tá no menor preço desde que comecei a acompanhar 👀" · "dá um bizu: menor preço que já vi nesse aqui" |
| Queda contra o histórico | "caiu 18% do menor que eu tinha anotado" · "esse baixou de novo, olha aí" |
| Sem histórico | "achei esse hoje, tá em conta" · "dá um bizu nessa" |

A rotação resolve dois problemas de uma vez: evita a fadiga de quem lê os mesmos grupos todo dia, e evita o padrão repetitivo que levanta suspeita de automação.

---

## 3. O composer (painel do dono)

A cadência será testada, então o composer **não assume formato**. O desenho que dá os dois sem duplicar código:

**A cadência emerge da seleção.** Marcar 1 produto gera mensagem de um produto; marcar 5 gera mensagem de lote. Mesma tela, mesmo caminho de código.

Fluxo: escolher produto(s) no catálogo → escolher o destino → receber a mensagem pronta → **copiar** (WhatsApp) ou **publicar** (Telegram).

**Mas o formato ideal difere por canal, e isso não é preferência — é limitação técnica:**

- **WhatsApp favorece o post único.** Só o primeiro link ganha card. Um lote vira uma lista de texto sem imagem, que rende muito menos.
- **Telegram lida bem com lote.** Cada produto vira sua própria mensagem com foto e botão próprio, disparadas em sequência.

Então o composer sugere o formato por canal, mas **não impede** o contrário — porque a hipótese a testar é justamente essa.

---

## 4. Atribuição por destino

A pergunta que importa não é "cliente ou admin publicou", é **qual destino converte**: o grupo da família, o grupo de achadinhos, o canal do Telegram, ou a vitrine.

**Mecânica mínima, sem tabela nova:** o link carrega um código de destino, `/go/ml-XXX?via=wa-g1`. O route handler grava esse código no `click_event` (uma coluna nova, anulável) e o repassa como sufixo do `subId` no `matt_word`. Assim a origem aparece **tanto na telemetria própria quanto no painel do Mercado Livre**.

O código também distingue formato quando ele estiver sendo testado: `via=tg-lote` × `via=tg-unico`. Comparar taxa de clique entre os dois responde a pergunta da cadência com dado, não com impressão.

**Ressalva registrada:** o formato do `subId` do Mercado Livre foi provado em campo com o slug puro. Acrescentar sufixo precisa de um teste real antes de virar padrão — o ML já se mostrou chato com parâmetro.

**No WhatsApp não dá para saber se você realmente postou** — só que copiou. A verdade vem do clique, não da cópia. O painel não deve fingir que sabe.

---

## 5. Preço envelhecido — proteção da sua reputação

A mensagem que você postou num grupo semana passada continua lá, rolável. Alguém clica hoje e o card cacheado mostra R$ 89 enquanto a página mostra R$ 129. Quem se sente enganado associa isso a **você**, não ao Mercado Livre.

**Solução:** o link carrega o preço do momento da publicação (`&p=8900`) e a página de destino compara: *"quando publicamos este link, estava R$ 89. Agora está R$ 129."*

**Anti-adulteração, usando o que já temos:** a comparação só é exibida se aquele valor **existir de fato no histórico de preço do produto**. Um `?p=` inventado não encontra observação correspondente e o aviso simplesmente não aparece. O moat vira defesa.

Isso transforma uma limitação de cache numa demonstração de honestidade que nenhum concorrente tem.

---

## 6. Telegram

Canal público desde o dia um. Bot API oficial, gratuita, sem risco de banimento — coerente com a decisão que atravessa o projeto inteiro.

**Broadcast (primeira frente):** `sendPhoto` com legenda e **botão inline** ("ver no Mercado Livre") apontando para `/go/[slug]?via=tg`. O botão entrega em um toque e sem o usuário ver URL. Em lote, uma mensagem por produto — álbum não permite botão por item.

O canal é **só broadcast**. Ele não serve para avisar uma pessoa específica sobre o produto que ela marcou — isso é outra coisa, na seção 7.

Token do bot em variável de ambiente, nunca no repositório.

---

## 7. Aviso de queda de preço — individual, não broadcast

Quem marcou "de olho no preço" num produto é quem recebe o aviso daquele produto. Não se avisa a lista inteira sobre o item de uma pessoa; no máximo, um achado bom vira post no canal — mas aí é broadcast e vale a seção 6.

**Canais, em ordem de entrada:**

| Canal | Papel | Custo | Autorização |
|---|---|---|---|
| **Painel** (`/minha-area`) | Registro de verdade; sempre existe | zero | nenhuma — é a área dela |
| **E-mail** | Padrão do aviso individual | baixo | consentimento no momento em que ela pede o aviso |
| **Telegram** | Opcional, para quem já usa | zero | a própria pessoa inicia o bot pelo deep link |
| **WhatsApp** | Só depois, se o dado justificar o custo | ~R$0,08–0,35 por mensagem | **autorização explícita e registrada**, template aprovado |

**Por que e-mail como padrão:** não precisa de aprovação de template nem de conta verificada, custa quase nada, e o "de olho no preço" é por natureza **paciente** — a pessoa quer aquele produto e espera o preço certo. Meia hora de atraso não estraga o caso de uso, ao contrário de uma oferta relâmpago.

**Vinculação do Telegram**, para quem quiser: deep link `t.me/<bot>?start=<token>`, com o token mapeando para `app_user.id`. Custo zero por mensagem e chegada imediata, para a fatia que usa Telegram.

**Regra de coleta:** nenhum canal de contato é pedido "por precaução". E-mail, Telegram ou WhatsApp só entram quando a pessoa opta por aquele aviso específico, e o consentimento é gravado com data — como já se faz em `subscriber`.

**Dependência dura:** sem varredura recorrente não há movimento entre visitas, e aviso sobre catálogo estático é promessa vazia. Nada disso começa antes.

---

## Fases

| Fase | Entrega | Depende de |
|---|---|---|
| **D-1** | 🟡 Card OG em `/bizu/[slug]` com selo de texto | nada |
| **D-2** | Composer no painel: seleção, destino, copiar/publicar | D-1 |
| **D-3** | Atribuição por destino (`via` no clique e no `subId`) | D-2 |
| **D-4** | Comparação de preço na chegada | D-3 |
| **D-5** | Publicação no canal do Telegram com botão inline | D-2 |
| **D-6** | Alerta pessoal por Telegram | varredura recorrente |

D-1 primeiro porque um único artefato serve aos dois canais e destrava a publicação manual imediatamente.

---

## Registro de implementação — D-2, 20/08/2026 (🟡 aguardando conferência independente)

Handoff de origem: `handoff-d2-composer.md`. Entregue após D-1.

### O que foi entregue

- `lib/composer.ts` (novo, puro): `composeMessage(products, destination, baseUrl)` — 1 produto = mensagem única; 2+ = lote numerado (teto de 5). Copy pelo sinal real (`priceHighlight`), com rotação determinística por slug (mesmo produto repete a mesma variante; produtos diferentes divergem). Repertório: `verified` ("esse tá no menor preço desde que comecei a acompanhar 👀" / "dá um bizu: menor preço que já vi nesse aqui"), `drop` ("caiu X% do menor que eu tinha anotado" — X do histórico real / "esse baixou de novo, olha aí"), sem histórico ("achei esse hoje, tá em conta" / "dá um bizu nessa"). Rodapé de divulgação de afiliado ("link de afiliado · BizuMiner"). Preço pt-BR sem decimais quando inteiro (NBSP normalizado para espaço comum).
- `app/admin/composer.tsx` (novo, client): busca no catálogo via `/api/deals` (sem API nova), seleção com teto de 5, chips removíveis, alternância WhatsApp/Telegram, preview em textarea e botão copiar com fallback. Avisos por canal: WhatsApp+lote → "só o primeiro link gera card — considere uma mensagem por produto" (sugere, não bloqueia); Telegram → publicação automática é D-5.
- `app/admin/page.tsx`: monta o composer e passa `baseUrl` do server (`siteUrl()`) — a base não pode ser resolvida no cliente.
- `test/composer.test.mjs` (novo, 11 testes).
- `tsconfig.json`: `allowImportingTsExtensions` habilitado (mesmo padrão da persistence) — necessário para o runtime Node dos testes resolver `./deal-signal.ts`.

### Verificação executada (contra a fonte de verdade)

- `npm run typecheck`: limpo. `npm test`: **39/39** (28 antes + 11 novos de composer).
- `npm run build`: limpo, com o dev server parado antes (regra do projeto); `/admin` no manifesto com o composer embutido (4,79 kB).
- Smoke test com dev server: `GET /admin` → HTTP 200, "Composer" presente no HTML renderizado.
- **Não verificado nesta entrega:** colar a mensagem num chat real do WhatsApp/Telegram (depende do domínio; o card OG precisa dele) e o veredito humano sobre a copy gerada.

### Achados honestos

- O destino (WhatsApp/Telegram) **não altera o texto** nesta versão: o lote do Telegram vira N mensagens com foto e botão na D-5. O composer sugere formato por canal via avisos na UI, sem bloquear — conforme a decisão do plano.
- `drop` com preço igual ao menor anterior cai no tom "sem histórico/silêncio" da copy (variante de descoberta), nunca inventa queda.

### Pendente para ✅

Conferência independente desta entrega e veredito do dono sobre a copy gerada (degrau 5).

---

## Registro de implementação — D-2b, 20/08/2026: link direto com página de passagem (🟡 aguardando conferência independente)

**Decisão do dono nesta sessão:** o link do composer vai para a versão "direto" — quem se interessou pelo card não precisa passar pelo site para decidir, já quer comprar.

**Por que não apontar o link direto para `/go/[slug]`:** a `/go` é um redirect puro (302) sem HTML nem meta tags; o WhatsApp/Telegram não renderiza card nenhum, e o investimento do D-1 (o card é o produto no feed) morre. Solução: **a mesma página do card** (`/bizu/[slug]`) com o parâmetro `?direto=1`.

### O que foi entregue

- `lib/direct-flow.ts` (novo, puro): contador de 3s (`DIRECT_COUNTDOWN_SECONDS`), `nextCountdown`, `shouldFire` e `flagKey(slug)` — flag de sessão por produto.
- `app/bizu/[slug]/redirect-banner.tsx` (novo, client): banner ácido no topo — "Redirecionando para o Mercado Livre em 3…" + botão **"quero ficar aqui"** com foco inicial. **Qualquer interação** (toque, tecla, rolagem) cancela e mantém a página normal. Aos 0s, grava a flag na sessão e navega para `/go/[slug]` (que registra o clique afiliado como sempre).
- **Anti-loop do botão voltar:** se a flag de sessão já existe, o banner não redireciona de novo — mostra "este dispositivo já foi redirecionado" com "ir de novo ↗" e "continuar no BizuMiner". Sem isso, voltar do ML recairia no contador e viraria loop de sequestro.
- `app/bizu/[slug]/page.tsx`: lê `searchParams.direto` e monta o banner só quando `direto=1`. Busca orgânica e links normais continuam sem banner.
- `lib/composer.ts`: `directLink(baseUrl, slug)` = `…/bizu/<slug>?direto=1`, usado na mensagem única e no lote.
- Sem animação de contagem (números trocados por estado) — `prefers-reduced-motion` não exige tratamento especial.

### Verificação executada (contra a fonte de verdade)

- `npm run typecheck`: limpo. `npm test`: **44/44** (39 + 4 de `direct-flow` + 1 de `directLink`).
- `npm run build`: limpo, com o dev server parado antes.
- Smoke test com dev server e slug real do banco (`ml-MLB45553868`): `/bizu/<slug>` **sem** banner; `/bizu/<slug>?direto=1` **com** banner no HTML; `/go/<slug>` → **HTTP 302**.
- **Não verificado nesta entrega (depende de navegador humano):** o comportamento em navegador real — o contador regredir 3→2→1, o clique em "quero ficar aqui" cancelar, e o loop do voltar (redirect → voltar → banner estático). A lógica está coberta por testes do módulo puro, mas a cena real precisa de verificação manual.

### Pendente para ✅

Conferência humana do fluxo em navegador (contador, cancelamento, voltar) e veredito do dono.

### Correção — 20/08/2026: link de compartilhamento sempre canônico

O composer estava gerando o link com a URL provisória da Vercel (`VERCEL_URL`) quando `NEXT_PUBLIC_SITE_URL` não estava definida no ambiente. Correção: `lib/site-url.ts` ganhou `shareBaseUrl()` (canônico `https://www.bizuminer.com.br`, sem cair em preview/localhost) e o `/admin` passou a usá-la no composer; `siteUrl()` continua para `metadataBase`/card OG (cada ambiente aponta para si mesmo, para testar preview). 46/46 testes, typecheck limpo.

---

## Registro de implementação — D-1, 20/08/2026 (🟡 aguardando conferência independente)

Handoff de origem: `handoff-d1-card.md`. Executado de ponta a ponta pelo mesmo agente que escreveu o handoff, em sessão separada.

### O que foi entregue

- `lib/site-url.ts`: endereço-base em cascata (`NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` → `localhost:3100`), usado em `metadataBase` do layout raiz.
- `app/bizu/[slug]/opengraph-image.tsx`: card 1200×630 via `next/og`, runtime Node. Foto contida sobre fundo branco (400×400) ou monograma "B" se ausente; selo reaproveitando `priceHighlight()` sem alteração na função; título cortado em ~78 caracteres; preço em destaque com preço anterior menor ao lado quando há desconto; rodapé com a assinatura BizuMiner e a nota de link de afiliado. Slug inexistente devolve card genérico da marca, nunca erro.
- `app/bizu/[slug]/page.tsx`: `generateMetadata` passou a emitir `openGraph.title/description/url` por produto — sem isso, o preview trazia a foto certa com o título genérico do site ao lado, em toda oferta compartilhada.
- Fontes: `public/fonts/Manrope-{ExtraBold,SemiBold}.ttf` (TTF real, ~35 KB cada; baixadas do Google Fonts com truque de user-agent, já que o repositório do Google Fonts só publica a fonte variável e o Satori não instancia variável — precisa de peso estático).
- Testes: `test/site-url.test.mjs`, cobrindo as três branches de resolução.

### Três bugs encontrados e corrigidos — nenhum estava no handoff

O handoff previu as armadilhas de WOFF2, cache de preview e URL absoluta; nenhuma delas se manifestou. As três que apareceram foram outras, e cada uma quebrava o card com o **mesmo erro minificado e enganoso** (`TypeError: u2 is not iterable` no pipe da resposta), que não aponta para a causa — só bisecção por eliminação (remover peça, testar, reintroduzir) revelou cada uma:

1. **`width: "fit-content"` no selo.** O motor de layout do Satori (Yoga) não implementa a palavra-chave CSS `fit-content` — lança erro interno em vez de ignorar. Corrigido com `alignSelf: "flex-start"` no lugar, que é o equivalente correto em flexbox para "não esticar ao longo do eixo cruzado".
2. **`textDecoration: "line-through"` no preço anterior.** Satori não suporta a propriedade. Removida; o preço anterior se distingue só por tamanho e cor, sem risco de reintroduzir o bug.
3. **Fotos do Mercado Livre em WebP.** O CDN `mlstatic.com` serve `.webp` por padrão, e o Satori/resvg não decodifica esse formato — falha em silêncio, sem mensagem legível. **Achado que vale a outros pontos do projeto onde imagem do ML é buscada no servidor, não só exibida via `next/image`:** a mesma URL aceita trocar a extensão para `.jpg` e devolve JPEG de verdade (confirmado com `curl`, HTTP 200, `Content-Type: image/jpeg`). `fetchProductImage()` faz essa troca antes de buscar.

Cicatriz de processo a registrar: **erro minificado do Satori não indica a causa.** Diante de `"X is not iterable"` ou similar vindo de `ImageResponse`, bisectar a árvore JSX comentando blocos, não tentar adivinhar pela mensagem.

### Verificação executada (contra a fonte de verdade, não narrada)

- `npm run typecheck`: limpo. `npm test`: **28/28** (25 antes desta entrega + 3 novos de `site-url`).
- `npm run build`: limpo, com o dev server parado antes (regra já registrada no projeto); rota nova aparece no manifesto como dinâmica.
- **Os três estados do selo, com slugs reais do banco** (consultados via SQL, não escolhidos de memória):
  - `drop`: `ml-MLB51233304` (Notebook Lenovo, R$ 3.606 vs. mínimo anterior R$ 3.680) → HTTP 200, PNG 1200×630 válido, 193 KB.
  - `unproven`/sem selo: `ml-MLB24061510` (Monitor LG UltraGear, 1ª observação) → HTTP 200, 241 KB.
  - sem selo por ausência de queda: `ml-MLB50269368` (Secador Philco, preço igual ao mínimo anterior) → HTTP 200, 188 KB.
  - fallback (slug inexistente): HTTP 200, 13 KB, sem foto.
  - **Achado honesto, não escondido:** não existe hoje **nenhum** produto com `lowest_verified = true` no catálogo inteiro — confirmado por query agregada (`any_verified: false` em todas as 313 linhas). A regra exige 7 dias de histórico e a captura mais antiga tem 2. O estado `verified` do card existe no código e será exercitado assim que o histórico for denso o bastante — não foi possível testá-lo com dado real porque o dado real ainda não sustenta esse estado, e é exatamente essa a regra que o projeto se propôs a cumprir.
- `curl` na página `/bizu/[slug]`: `og:image` e `og:url` resolvem para `http://localhost:3100/...`, não para o domínio morto.
- Validação estrutural do PNG (assinatura de arquivo + dimensões lidas do header IHDR) para os 4 casos: todos válidos, 1200×630.
- **Não verificado nesta entrega:** preview real em WhatsApp/Telegram (exige URL pública; domínio ainda não comprado) e o card no estado `verified` (dado ainda não existe). Ambos ficam explícitos como pendência, não como "testado e passou".
- **Limitação do ambiente, registrada com honestidade:** o navegador desta sessão não compôs frame para screenshot (`Browser pane is not displayed`), então a inspeção visual pixel-a-pixel do card não foi feita por mim — a verificação se apoiou em PNG estruturalmente válido nas dimensões corretas, ausência de erro no servidor, e no rastreamento explícito de cada valor (`photoLength`, `photoPrefix`) que alimentou o JSX durante a depuração. Recomendo abrir os PNGs manualmente antes de aprovar — é precisamente o tipo de defeito (proporção, corte de texto, contraste) que só o olho humano pega.

### Pendente para ✅

Veredito humano sobre a estética do card (abrir os 4 PNGs) e teste em WhatsApp/Telegram real após o domínio existir.

## Fora de escopo (por decisão, não por esquecimento)

Mini-gráfico no card; qualquer automação de WhatsApp; encurtador de terceiros; agendamento de posts; geração de copy por LLM em produção; compartilhamento pelo cliente como mecanismo de crescimento.

## Verificação

1. Typecheck e testes — tudo
2. Card inspecionado em preview real do WhatsApp **e** do Telegram, antes de qualquer distribuição em volume — o cache não perdoa
3. Clique real chegando ao `click_event` com o código de destino correto
4. `subId` com sufixo testado em campo contra o painel do Mercado Livre antes de virar padrão
5. Veredito do dono sobre a copy e o ritmo dos posts
