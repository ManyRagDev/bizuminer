# Plano de Implementação — Pauta de Stories (WhatsApp)

**Documento vivo — criado em 29/08/2026.**
Escopo: `packages/web` (rotas `/p`, `/pauta`, `/api/story`, `lib/desirability.ts`, `lib/short-*`), migração `garimpa.short_link`. Não toca `packages/extension` nem `packages/capture` — **decisão do dono, 29/08/2026**: o fluxo de captura fica intacto.

Documentos relacionados: [`plano-distribuicao.md`](./plano-distribuicao.md) (composer para grupos/conversas), [`plano-motor-curadoria.md`](./plano-motor-curadoria.md) (sinal de preço), [`plano-ux-vitrine.md`](./plano-ux-vitrine.md) (hero e identidade visual).

Status: ✅ feito e conferido · 🟡 parcial · ⬜ não iniciado

---

## Problema

Postar um produto no status do WhatsApp custa ~90s de trabalho manual: print, recorte, editor de imagem, digitar preço, colar link. Multiplicado por 10 produtos/dia, é o gargalo da distribuição.

**Automatizar a postagem está fora de questão** e não por escolha: nem a API oficial (Cloud API) expõe endpoint de Status — nenhuma via legítima expõe. Bibliotecas que dirigem o WhatsApp Web (Baileys, whatsapp-web.js) resolveriam, ao custo de banimento do número; risco recusado.

O que sobra, e é onde está o ganho, é eliminar a **preparação**.

---

## Decisão de rota — colar link venceu compartilhar imagem (29/08/2026)

Duas abordagens foram construídas e comparadas **em campo, no aparelho do dono**:

| | Compartilhar arte | Colar link |
|---|---|---|
| Como funciona | PNG 1080×1920 gerado no servidor + `navigator.share({files})` | Status de texto; o WhatsApp monta o preview a partir das tags OG |
| Área ocupada | Tela cheia | Card grande, ~40% da tela |
| Trabalho por post | Salvar imagem, compartilhar, escolher status | Copiar, colar, publicar |
| Infra necessária | Rota de imagem + tela de compartilhamento + `navigator.share` | Só um link curto |

**Escolhido: colar link.** O preview renderiza foto, título, preço, selo de sinal e carimbo de loja — quase o mesmo resultado visual por uma fração do trabalho. Verificado com print do status real em 29/08/2026.

A arte 1080×1920 (`/api/story/[slug]`) **permanece no código como reserva**, já pronta caso o formato de preview do WhatsApp mude ou o impacto visual se mostre insuficiente na prática.

---

## Achados da leitura do código (29/08/2026)

1. **O card OG estava quebrado para AliExpress, em produção.** O CDN deles (`aliexpress-media.com`) responde `image/webp` mesmo em URL `.jpg` e **ignora o header `Accept`**. O Satori não decodifica webp e aborta o stream em silêncio: resposta com corpo vazio, sem status de erro e sem log. Todo produto AliExpress compartilhado saía sem preview. Bug anterior a este plano, encontrado por acidente ao construir a arte de story.
2. **O link do `/go` não serve para compartilhar.** O robô de preview do WhatsApp **segue redirects** e lê as tags OG do destino final — encurtar para `/go` faria o preview sair com o card do Mercado Livre. Pior: o `/go` grava `click_event` a cada acesso, então cada visita de robô entraria como clique humano na telemetria. O link de compartilhamento tem de apontar para `/bizu/[slug]`.
3. **A URL longa é um defeito visual concreto.** O status exibe o texto colado. `https://www.bizuminer.com.br/bizu/ml-MLB54964804` (48 caracteres) ocupa **duas linhas enormes** sob o card. Apagar o texto não é opção: remover a URL derruba o preview junto.
4. **O Composer existente não resolve este caso.** [`lib/composer.ts`](../../packages/web/lib/composer.ts) monta mensagem para grupo/conversa: abertura variada, título, preço, loja, assinatura, lotes de até 5. Colar isso num status produz parede de texto — o card de preview já mostra título, preço e loja. E lote não faz sentido: só um link por post gera preview.
5. **`heroScore` normaliza sobre a página, não sobre o acervo.** [`vitrine.tsx:76`](../../packages/web/app/vitrine.tsx) roda **no cliente**, sobre os 24 produtos de `initialProducts`. `categoryDesirability` divide pelo maior valor *da amostra*, e descarta categoria com menos de 2 itens na amostra. Consequência: o hero mostra a nata **de 24**, não a nata **de 473**, e o resultado muda conforme a página. O próprio código antecipa a correção: *"Quando materializarmos na rodagem, este cálculo sai do componente."*
6. **A equação nunca lê o título.** `heroScore` combina vendas, avaliação, histórico, queda e categoria. Não distingue "Robô Aspirador com Mapeamento a Laser" de "Capa de Estepe Modelo 2003" — categoria é proxy grosseiro de desejo. Desejo mora no texto do título.

---

## Fase P0 — Arte de story (✅ feito · mantida como reserva)

Rota `/api/story/[slug]` gera PNG 1080×1920 a partir dos dados do produto.

- Área segura de 300px no topo e 380px na base: o WhatsApp desenha barra de progresso, autor, legenda e campo "responder" por cima. Margens com folga sobre a medida real, porque a altura varia por aparelho e versão.
- Utilitários compartilhados extraídos para [`lib/og-assets.ts`](../../packages/web/lib/og-assets.ts) e reusados pelo card OG.
- **Correção do achado 1:** transcodificação via `sharp` para o que o Satori não lê. Conserta a arte de story **e** o card OG, que estava quebrado em produção para AliExpress.
- Verificado nas três lojas com produtos reais.

---

## Fase P1 — Encurtador (✅ feito e conferido)

`bizuminer.com.br/p/x7k2` → 302 → `/bizu/[slug]`. Resolve o achado 3: de 48 caracteres (2 linhas) para 23 (1 linha).

| Peça | Arquivo |
|---|---|
| Alfabeto e sorteio | [`lib/short-code.ts`](../../packages/web/lib/short-code.ts) |
| Cunhagem idempotente + retry | [`lib/short-link-db.ts`](../../packages/web/lib/short-link-db.ts) |
| Redirect | [`app/p/[code]/route.ts`](../../packages/web/app/p/[code]/route.ts) |
| Texto pronto para colar | [`lib/story-link.ts`](../../packages/web/lib/story-link.ts) |
| Migração | `20260829000000_garimpa_short_link.sql` |
| Testes | `test/short-code.test.mjs` (7, passando) |

Aplicada no projeto `spbuwcwmxlycchuwhfir` em 29/08/2026. Conferido: três códigos cunhados, redirect correto nas três lojas, tags OG preservadas no destino, idempotência (mesma chamada → mesmo código), formato inválido barrado antes do banco.

### Decisões registradas

**Sorteio, nunca derivação.** Derivar o código do produto (hash do id, timestamp de captura) foi considerado e recusado. Qualquer função que leve um conjunto grande para 707.281 casas **colide** — casa dos pombos, não escolha de algoritmo. Derivar não evita a colisão; torna-a **permanente**, sem chance de nova tentativa. É estritamente pior que sortear. Timestamp é ainda pior: em milissegundos dá volta a cada 11,8 minutos, em segundos a cada 8,2 dias, e a captura insere em lote — produtos da mesma rodagem nasceriam com o mesmo código.

**Alfabeto de 29 símbolos** (`abcdefghjkmnpqrtuvwxyz2346789`), sem `0/o`, `1/l/i`, `5/s`, tudo minúsculo. O código precisa ser **digitável** por quem só está vendo a tela. 29⁴ = 707.281.

**Colisão é tratada, não ignorada.** Pelo paradoxo do aniversário, a primeira colisão aparece por volta de **1.054 códigos**, não de 707.281 — com o catálogo atual de 473 produtos já haveria ~15% de chance. Daí `unique` na chave e novo sorteio no conflito (máx. 5 tentativas). Colisão publicada seria irreversível: status não se edita depois.

**Pasta `/p/`, não a raiz.** Código na raiz sortearia um dia `bizu`, `go`, `api` ou `entrar` e sequestraria rota real. A defesa alternativa seria uma lista de palavras proibidas que teria de crescer junto com o site, com alguém esquecendo de atualizar. Dois caracteres compram imunidade permanente.

**302, não 301.** Um 301 fica gravado no navegador de quem clicou; reapontar ou revogar um código seria impossível para quem já visitou.

**Grant sem `delete` nem `update`.** Código publicado num status não pode ser reapontado nem apagado. Se um link precisar morrer, que seja operação manual e consciente, não algo que a borda web faça sozinha.

**Domínio próprio, não domínio curto comprado.** `bi.zu` é impossível por dois motivos independentes: `ZU` não é código de país ISO 3166-1 (nem está na faixa de uso privado), e a ICANN veta gTLDs de dois caracteres. Domínio curto de terceiro país também foi recusado: `bizuminer.com.br/p/x7k2` já cabe em uma linha, e ccTLD estrangeiro significa alugar a marca de um governo — a Líbia confiscou o `vb.ly` em 2010 e todos os links publicados morreram.

---

## Fase P2 — Desejabilidade global (⬜ não iniciado)

**Objetivo:** corrigir o achado 5 — a nata do acervo, não a nata da página.

- Extrair `heroScore` e `categoryDesirability` de `vitrine.tsx` para `lib/desirability.ts` (função pura, testável).
- Calcular no **servidor**, sobre o catálogo inteiro, não sobre `initialProducts`.
- Apontar o hero para a mesma função. Ganha normalização global sem mudar comportamento visível.
- Testes: normalização estável independente do tamanho da amostra; categoria com 1 produto não desaparece por acidente de paginação.

**Contrato de saída:** os ~40 produtos de maior score, todos com evidência já qualificada.

---

## Fase P3 — Curadoria em dois estágios (⬜ não iniciado · decisão de modelo pendente)

**Estágio 1 (equação, P2):** 473 produtos → ~40. Determinístico, auditável, gratuito.

**Estágio 2 (IA):** ~40 → ~12, por leitura semântica do título — o que a equação não faz (achado 6).

**A restrição que preserva a integridade do produto:** a IA só **reordena dentro de um conjunto já qualificado**. Nunca promove item com evidência fraca, porque nada com evidência fraca chega até ela. O estágio 1 é o portão; o estágio 2 é o gosto. O BizuMiner continua afirmando apenas o que verifica: a IA ordena, mas quem *fala* na tela continua sendo `priceHighlight()`.

Requisitos não negociáveis:

- **Cache de 1 dia.** Uma chamada por dia, não por carregamento de página.
- **Degrada para a equação.** API fora, sem chave, timeout → ordem determinística do estágio 1. Nunca em branco, nunca travado.
- **Saída estruturada** validada por schema (`output_config.format`), não texto livre.

### Custo estimado

~2.500 tokens de entrada (40 títulos com preço e categoria + prompt) e ~300 de saída, uma vez por dia:

| Modelo | Entrada | Saída | Por chamada | Por mês |
|---|---|---|---|---|
| Opus 5 | $5/M | $25/M | ~$0,02 | ~$0,60 |
| Haiku 4.5 | $1/M | $5/M | ~$0,004 | ~$0,12 |

A diferença entre o modelo mais capaz e o mais barato é de **~50 centavos por mês**. Nesta carga, custo não é critério de decisão.

**Pendências desta fase:**
- ⬜ Escolha do modelo — **do dono, adiada por decisão explícita em 29/08/2026**.
- ⬜ `ANTHROPIC_API_KEY` não existe no `.env.local` (há `GEMINI_API_KEY`, de outro projeto).

---

## Fase P4 — Tela `/pauta` (⬜ não iniciado · manifesto aprovado)

Rota própria, desenhada primeiro para celular, atrás do mesmo gate de autenticação do `/admin` (adicionar ao `middleware.ts` e usar `isAdmin` na página).

### Insight que orienta o desenho

A página **não é para navegar** — é uma lista que se queima. O traço definidor do uso é que **o operador sai do app a cada item**: copia, troca pro WhatsApp, cola, publica, volta. O trabalho difícil não é copiar; é **não perder o lugar** ao voltar.

### Manifesto visual (aprovado em 29/08/2026)

**Âncora emocional:** *"Sei exatamente onde parei, mesmo tendo saído do app cinco vezes."*

**Paleta** — só tokens existentes em `globals.css`:

| Papel | Token |
|---|---|
| Fundo | `--paper` |
| Card pendente | `--surface` |
| Botão de copiar | `--ink-block` / `--on-accent` |
| Selo de sinal | `--blue` / `--blue-text` |
| Linha copiada | `--ink-quiet` sobre `--paper-deep` |

O sistema já atribui significado à cor — `--blue` é evidência nossa, `--acid` é alegação do vendedor. Usar qualquer um dos dois num botão de ação colidiria com a linguagem de confiança, que é o ativo do produto. Por isso a ação é **preto sobre bege**: força visual máxima, zero significado roubado.

**Tipografia** — Manrope, três degraus: preço 28px/800, título 15px/600 (2 linhas), meta 13px/600. Hierarquia curta porque a decisão é binária (já postei ou não).

**Ritmo** — base 4px, alvo de toque mínimo 48px (uso de pé, uma mão). O ritmo **acelera conforme desce**: card pendente ~140px, card copiado colapsa para ~40px.

**Elemento surpresa** — o card copiado colapsa numa linha carimbada com o código curto (`✓ 6v2e`). Serve à âncora duas vezes: encolher torna o "próximo" óbvio sem procurar, e o código exposto permite conferir, ao voltar do WhatsApp, se a colagem entrou — sem copiar de novo. A linha continua tocável.

**O que não é:** não é vitrine (não existe para admirar catálogo) nem painel (nada que peça interpretação).

### Wireframe

```
┌─────────────────────────────────┐
│  PAUTA                    4/12  │  ← progresso, sticky
│  ▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░      │
├─────────────────────────────────┤
│ ✓ 6v2e   Celular Samsung…       │  ← copiado: 40px, toca p/ recopiar
│ ✓ yarm   Kit Maca Power…        │
├─────────────────────────────────┤
│  ┌───────┐  caiu 8% desde o     │  ← PRÓXIMO: card cheio, ~140px
│  │ foto  │  menor que vimos     │
│  └───────┘  Robô Aspirador…     │
│  R$ 889,90        MERCADO LIVRE │
│  ┌─────────────────────────────┐│
│  │      COPIAR TEXTO           ││  ← 48px, largura total
│  └─────────────────────────────┘│
│  acabou rápido → …/p/x7k2       │  ← prévia do que será copiado
├─────────────────────────────────┤
│  ┌───────┐  Cafeteira Expresso  │  ← pendentes seguintes
│  │ foto  │  [ COPIAR ]          │
└─────────────────────────────────┘
```

### Pendência desta fase

⬜ **Onde mora o "já copiei".** Proposta: `localStorage`, chave por dia. O estado é do **aparelho**, não da conta — trocando de celular, a pauta reinicia. Persistir no banco custa uma tabela e uma rota para um dado que expira em 24h. **Decisão do dono:** se ele postar de mais de um aparelho, sobe para o banco.

---

## Ordem de execução

| Fase | Depende de | Estado |
|---|---|---|
| P0 — arte de story | — | ✅ (reserva) |
| P1 — encurtador | — | ✅ |
| P2 — desejabilidade global | — | ⬜ |
| P3 — curadoria com IA | P2 + escolha de modelo | ⬜ |
| P4 — tela `/pauta` | P2 (funciona sem P3, com ordem determinística) | ⬜ |

P4 **não bloqueia** em P3: a tela funciona com a ordem determinística e ganha a curadoria semântica quando o modelo for escolhido.

---

## Decisões em aberto

| # | Decisão | Dono | Desde |
|---|---|---|---|
| 1 | Modelo de IA para o estágio 2 | dono | 29/08/2026 |
| 2 | `localStorage` × tabela para o estado "já copiei" | dono | 29/08/2026 |
| 3 | Provisionar `ANTHROPIC_API_KEY` | dono | 29/08/2026 |
