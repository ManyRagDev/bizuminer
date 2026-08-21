# Handoff — D-1: card de compartilhamento

**Para quem executa.** Entrega fechada, pequena e independente. Plano de origem: `plano-distribuicao.md`, seção 1.

**Objetivo:** quando um link do BizuMiner for colado no WhatsApp ou no Telegram, o preview deve mostrar foto do produto, preço e — só quando o histórico sustentar — um selo de texto.

---

## Estado do mundo (verificado em 20/08/2026)

- Existe deploy na Vercel em `https://web-khaki-beta-l29v7h3o33.vercel.app`, **desatualizado** (as rotas `/minha-area` e `/admin` retornam 404 lá).
- `metadataBase` em `app/layout.tsx` aponta para `https://bizuminer.com.br`, **domínio ainda não registrado**. Por isso todo `og:image` hoje resolve para um endereço morto.
- O domínio será comprado em breve. **O dono aceitou explicitamente que a imagem não renderize enquanto isso** — o que importa nesta entrega é o fluxo funcionar ponta a ponta.
- `public/og-bizuminer.jpg` existe. O HTML no ar referencia `/hero-bizuminer.png`, que **não** existe — resquício da versão antiga, some no próximo deploy.

---

## O que fazer

### 1. Tornar o endereço-base dinâmico

`metadataBase` não pode ficar cravado num domínio que ainda não existe. A ordem de resolução deve ser:

1. variável de ambiente própria (ex.: `NEXT_PUBLIC_SITE_URL`), se definida;
2. senão, `https://${process.env.VERCEL_URL}` — a Vercel injeta isso automaticamente;
3. senão, `http://localhost:3100`.

Assim funciona em local, na URL da Vercel hoje e no domínio próprio depois, **sem alterar código**.

### 2. Criar a rota do card

`app/bizu/[slug]/opengraph-image.tsx`, usando `ImageResponse` de `next/og`. Tamanho 1200×630. Runtime Node (precisa ler arquivo de fonte).

Busca os dados com `dealDetail(slug)`, que já existe em `lib/db.ts` e já devolve tudo o que é preciso. Slug inexistente: devolver um card genérico da marca, nunca quebrar.

**O que aparece:** foto do produto (contida, não cortada — fundo branco, como no resto do site), título com no máximo 2 linhas, preço atual em destaque, o selo (regra abaixo), e a assinatura BizuMiner com a nota de link de afiliado em corpo pequeno.

### 3. O selo — reusar a regra, não reinventar

Use `priceHighlight()` de `lib/deal-signal.ts`. Ela já devolve os três estados. **Uma diferença em relação à vitrine:** no card, o tom `unproven` ("ainda sem histórico") **não é exibido** — card sem selo é o correto quando não há o que afirmar. Um selo negativo num card de divulgação só ocupa espaço.

| Estado | Selo no card |
|---|---|
| `verified` | "menor preço desde que começamos a acompanhar" |
| `drop` | "caiu X% do menor que já registramos" |
| `unproven` ou `null` | nenhum selo |

O card **nunca** inventa urgência, escassez ou desconto que o dado não sustente. Se o selo não couber na regra acima, ele não existe.

---

## Armadilhas conhecidas (cada uma já custou tempo em algum projeto)

- **Satori não lê WOFF2.** O `next/og` aceita **TTF ou WOFF**, não WOFF2. Não existe arquivo de fonte versionado no repositório hoje (só artefatos dentro de `.next`). É preciso adicionar um `.ttf` de Manrope ExtraBold em `public/fonts/` e lê-lo com `fs` a partir de `process.cwd()`. Não tente reaproveitar o `next/font` do layout — ele não vale dentro do `ImageResponse`.
- **O preview é cacheado quase para sempre** pelo WhatsApp e pelo Telegram. Conferir o card **antes** de distribuir em volume; corrigir depois não conserta link já postado.
- **A imagem do produto vem do Mercado Livre** (`http2.mlstatic.com`) e é buscada no servidor durante a geração. Precisa de timeout e de um caminho de fallback — se a foto não vier, o card sai sem foto, mas sai.
- **`og:image` exige URL absoluta.** É o item 1 deste handoff; sem ele nada renderiza.
- Peso do arquivo: mirar abaixo de ~300 KB. Card pesado falha em rede ruim e o WhatsApp desiste do preview.

---

## Fora de escopo (por decisão do dono, não por esquecimento)

Mini-gráfico de histórico no card (fica para quando o histórico for denso o bastante para desenhar curva); composer; atribuição por destino; qualquer publicação automática.

---

## Verificação

1. `npm run typecheck` e `npm test` em `packages/web`.
2. Abrir `/bizu/<slug>/opengraph-image` no navegador e conferir os **três estados** do selo com slugs reais — um com `lowest_verified`, um com queda e um sem histórico. Se não houver produto em algum estado, dizer isso no relatório em vez de fingir que testou.
3. `curl` na página e conferir que `og:image` e `og:url` apontam para o host correto (não para `bizuminer.com.br` enquanto o domínio não existir).
4. Depois do deploy: colar o link num chat real do WhatsApp **e** do Telegram. **Enquanto o domínio não estiver de pé, é aceitável o preview sair sem imagem** — o que precisa funcionar é título, descrição e o link levando ao lugar certo.
5. Pedido de conferência antes de marcar ✅. Quem implementa não aprova.

## Arquivos que a entrega toca

- `packages/web/app/layout.tsx` — endereço-base dinâmico
- `packages/web/app/bizu/[slug]/opengraph-image.tsx` — novo
- `packages/web/public/fonts/` — novo, arquivo de fonte
- `packages/web/lib/deal-signal.ts` — leitura apenas; **não alterar** (a vitrine depende dela)
