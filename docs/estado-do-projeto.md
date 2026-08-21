# BizuMiner — Estado do Projeto (documento mestre oficial)

**Redigido em 20/08/2026, a partir do levantamento do código, do banco e das decisões do dono.** Este documento descreve **o que o produto é**, não o que se pretendeu que fosse. Quando houver divergência entre este documento e qualquer outro, vale este — e a divergência deve ser corrigida no outro.

Convenção de honestidade: **fato** (lido no código ou no banco), **inferência** (conclusão a partir de fatos) e **pendente** (decisão que ninguém tomou ainda). Nada é registrado como pronto sem verificação.

---

## 1. O produto

O **BizuMiner** é um site B2C de curadoria de ofertas. As pessoas acessam, encontram produtos com desconto real, e compram — a comissão de afiliado é da casa. O comprador decide, o BizuMiner publica, o clique é rastreado de ponta a ponta.

Três fatos que definem o modelo econômico, verificados no código:

1. **Existe uma única tag de afiliado**, lida de `ML_TRACKING_ID`. Toda comissão gerada é da casa. Não há cadastro de tag de terceiros.
2. **Não existe cobrança**: nenhuma assinatura, gateway ou plano no pacote web.
3. **`tenant_id` aparece em todas as tabelas e vale `"local"`.** Multi-tenancy hoje é uma coluna, não uma capacidade — e não é necessária no modelo B2C.

**Lojas:** o Mercado Livre opera hoje. **Shopee e Amazon estão pendentes de credencial de afiliado** (solicitadas pelo dono, sem resposta na data desta redação). A Shopee já tem adapter pronto no código (`packages/capture/src/adapters/shopee/`, Open API oficial — nunca scraping); a Amazon não tem código ainda. Nenhuma das duas bloqueia nada: o produto roda 100% no Mercado Livre enquanto as credenciais não chegam.

**Fonte do briefing antigo:** os documentos de `docs/estrategia/` (julho/2026) descreviam o OfertaFlow — SaaS B2B vendido a afiliados, com disparo em massa por WhatsApp e instâncias WAHA/Docker. **Nada disso existe no código e nada disso será construído.** Esses documentos são histórico: não se atualizam e não se consultam para decidir o presente.

---

## 2. Arquitetura real

Monorepo com três pacotes canônicos (o quarto foi arquivado em 20/08):

| Pacote | O que é | Onde |
|---|---|---|
| `packages/capture` | Adaptadores de captura: ML (`/ofertas` público, auditável) e Shopee (Open API oficial) | `src/adapters/*` |
| `packages/persistence` | Schema SQL, ingestão (`sweep()`), CLI `bin/sweep.ts`, migrations e scripts de verificação derivada | `supabase/migrations/`, `bin/verify-*.ts` |
| `packages/web` | Next.js 15 (App Router): vitrine, página de produto, área do cliente, painel do dono | `app/` |
| `archive/site` | Protótipo estático anterior (starter com Drizzle/Worker). **Arquivado em 20/08, não é superfície, não se mexe, não se deleta** | `archive/site/` |

**Banco:** Supabase (Postgres), schema `garimpa`, acesso direto via pooler com role de servidor `garimpa_app` (privilégio mínimo). SQL puro, sem ORM. As 10 tabelas: `product`, `price_observation`, `capture_run`, `publication`, `click_event`, `subscriber`, `app_user`, `favorite`, `price_watch`, `buyer_profile`.

**Web:** Next.js App Router, CSS próprio (tokens BizuMiner em `globals.css`), sem Tailwind, sem framework de UI. Rotas: `/` (vitrine), `/bizu/[slug]` (+ card OG), `/go/[slug]` (saída afiliada), `/minha-area`, `/admin`, e as APIs `/api/deals`, `/api/newsletter`, `/api/minha/*`, `/api/admin/*`.

**Deploy:** Vercel, URL provisória (desatualizada — não tem as rotas novas). Domínio `bizuminer.com.br` em processo de compra; quando resolver, o código já aponta sozinho (`lib/site-url.ts`: `NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` → localhost).

---

## 3. Fontes de dados

| Fonte | Como | Estado |
|---|---|---|
| Mercado Livre | Scraping da página pública `/ofertas` (`MercadoLivreDealsAdapter`), cada varredura registrada em `capture_run` | Operando |
| Shopee | Open API oficial (`ShopeeAdapter` pronto). **Scraping de Shopee é proibido pelos termos e nunca será feito** | Pendente de credencial |
| Amazon | Nenhum código | Pendente de credencial |

Regra de ouro do projeto: **nunca construir permalink do zero; sempre usar o href real do card + parâmetros `matt_*`** (provado em campo). `Puppeteer`/headless: nunca (ToS).

---

## 4. Os fluxos de negócio

1. **Varredura** — `bin/sweep.ts` captura `/ofertas`, grava produto + uma observação de preço por execução, fecha `capture_run` como ok/erro/vazio. Hoje é manual/CLI + botão no painel. **Cron decidido: GitHub Actions (2–4h)** — o mesmo workflow aceita `workflow_dispatch`, então o botão do painel passa a pedir execução ao GitHub em vez de `spawn` local (que não funciona na Vercel). É a "rodagem pela plataforma, sem entrar no código" que o dono quer.
2. **Vitrine** — `/` dinâmica (`force-dynamic`): 24 ofertas por página, busca, categorias, faixa de preço, ordenação, carrossel editorial, newsletter.
3. **Produto** — `/bizu/[slug]` com histórico real (até 90 dias), evidências do ML, CTA afiliado e **card OG** para compartilhamento (WhatsApp/Telegram). Com `?direto=1` (link do composer), vira **página de passagem**: contador de 3s redireciona ao ML (via `/go`, registrando o clique), com "quero ficar aqui" e anti-loop do botão voltar — decidido em 20/08 (D-2b).
4. **Clique afiliado** — `/go/[slug]` upserta `publication`, grava `click_event` (IP só como hash salgado — LGPD), redireciona com `matt_word` + `subId`.
5. **Área do cliente** — `/minha-area`: salvos sincronizados com o servidor, "de olho no preço" com baseline e ticker de movimento, recomendações com o motivo declarado, perfil com categorias e faixa de preço. Identidade hoje é cookie `bm_uid` (httpOnly, 1 ano) — **não é login**. Auth real é a fase AL-3.
6. **Distribuição** — WhatsApp é **manual, para sempre** (você publica como pessoa; zero automação, zero risco jurídico). Telegram entra por Bot API oficial (botão inline apontando para `/go/[slug]?via=tg`). A plataforma gera a mensagem pronta: é o **composer** do painel (D-2).
7. **Aviso de queda de preço** — **individual, nunca broadcast**: quem marcou "de olho" recebe o aviso daquele produto. Ordem de canal: painel sempre → e-mail (padrão) → Telegram opcional (deep link) → WhatsApp só com autorização explícita e registrada, por último.

---

## 5. O oráculo — o painel do dono é o centro de comando (escopo confirmado em 20/08)

O dono quer ver tudo e comandar tudo pela plataforma, sem entrar no código. Confirmado como escopo:

- **Hoje (AD-1):** telemetria completa (produtos, observações, rodagens, cliques, assinantes, dados da área do cliente), tabela de rodagens com destaque para vazia/erro, botão de acionar rodagem.
- **Composer (D-2, 🟡 entregue em 20/08):** escolher produto(s) e destino → a plataforma gera a mensagem pronta (copy + link) para colar no WhatsApp ou publicar no Telegram.
- **Publicação no Telegram (D-5):** `sendPhoto` com botão inline, direto do painel.
- **Acionamento via GitHub Actions (M1-C):** rodagem pela plataforma em qualquer ambiente, sem processo local.
- **Admin editorial (AD-2):** curadoria (blurb/score), gestão de assinantes e alertas, logs do coletor.

O painel é ferramenta interna de vocês dois: específico e cru, não precisa nascer genérico.

---

## 6. Decisões que não se reabrem sem o dono

| Decisão | Valor |
|---|---|
| Modelo | B2C, comissão da casa, vocês são o único canal de distribuição (o cliente não compartilha como mecanismo de crescimento) |
| WhatsApp | Manual, sempre. Nenhuma automação, nenhuma sessão não-oficial, nenhum WAHA |
| Telegram | Bot API oficial, canal público desde o início |
| Docker/WAHA/Puppeteer | Fora. Nunca existiram no código |
| Aviso de queda | Individual, não broadcast |
| Card OG v1 | Só selo em texto; mini-gráfico quando o histórico for denso |
| Copy | Soar humano; gatilho sempre do dado real; nunca fabricar urgência |
| Preço envelhecido | Link carrega preço da publicação; a página compara — só se o valor existir no histórico (anti-adulteração) |
| Provedor de e-mail | SMTP da Hostinger (ativa quando o domínio existir) |
| Fora de escopo | Automação de WhatsApp, comparador entre lojas, recomendação por LLM em produção |

---

## 7. Estado atual por item

✅ feito e conferido · 🟡 feito, aguardando conferência humana/independente · ⬜ não iniciado

| Item | Estado |
|---|---|
| Captura do ML com execução auditável | 🟡 |
| Histórico de preço e selo honesto de menor preço | 🟡 |
| Categoria de produto (75,9% de cobertura) | 🟡 |
| Vitrine, busca, filtros, paginação | 🟡 |
| Página `/bizu/[slug]` com histórico | 🟡 |
| Redirect afiliado com telemetria própria | ✅ (validado em campo) |
| Área do cliente (salvos, acompanhamento, recomendações, perfil) | 🟡 |
| Painel do dono (telemetria + acionar robô) | 🟡 |
| Card de compartilhamento (OG) | 🟡 (entregue; falta veredito visual do dono e teste real pós-domínio) |
| **Varredura recorrente (cron GitHub Actions)** | ⬜ **decidido, não configurado — bloqueia alerta e histórico denso** |
| Composer (D-2) | 🟡 (entregue 20/08, aguardando conferência) |
| Atribuição por destino (`via`) (D-3) | ⬜ depende de D-2 |
| Comparação de preço na chegada (D-4) | ⬜ depende de D-3 |
| Publicação no Telegram (D-5) | ⬜ depende de D-2 |
| Alerta individual por Telegram (D-6) | ⬜ depende do cron |
| Autenticação (cliente e dono) + RLS + gate do admin | ⬜ |
| Alerta de e-mail | ⬜ depende do cron |
| `sitemap.xml` / `robots.txt` | ⬜ |
| Shopee / Amazon | ⬜ pendente de credencial (nenhum bloqueio interno) |

---

## 8. Bloqueios duros antes de qualquer deploy público de peso

1. **RLS desabilitada** nas 10 tabelas do schema `garimpa` (0 policies). Há dado de usuário no banco.
2. **Painel `/admin` sem autenticação** — quem descobrir a URL aciona o robô.
3. **Área do cliente sem autenticação** — identidade é cookie; limpar cookies perde tudo.

Nenhum impede o uso atual (baixo risco, sem tráfego). Todos impedem escalar. Quando o auth entrar: **cliente e dono usam modelos separados** (tabelas distintas, não campo `role`), e a rodagem passa a registrar quem acionou.

---

## 9. Cicatrizes (o que já custou caro aqui)

- **Selo "menor preço" exibido em 24 de 24 produtos** porque o mínimo incluía a observação atual. Origem da regra: nenhuma afirmação vai à interface sem que o dado a sustente.
- **Blurb idêntico repetido 24 vezes** — e a mesma falha reapareceu como razão de recomendação repetida 7 vezes na área do cliente. Repetição é sintoma de afirmação sem dado variável.
- **`subscriber` existia só como arquivo** — newsletter respondia 500 em silêncio desde 17/08. Migration versionada não é migration aplicada.
- **Perda silenciosa de preferência**: perfil validava categorias contra a última varredura, e uma rodagem curta apagava escolhas sem aviso. Corrigido 20/08 com teste que reproduz o defeito exato.
- **Três bugs do Satori no card OG** (`fit-content`, `line-through`, WebP) — todos mascarados pelo mesmo erro minificado inútil (`u2 is not iterable`); só bisecção achou. Fotos do ML trocam `.webp` por `.jpg` na mesma URL da CDN.
- **Documentos descreviam um produto que não é** (brief B2B OfertaFlow) — origem da régua e desta redação oficial.
- **Encoding corrompido por edição via PowerShell.** Arquivo se edita por editor UTF-8; shell é para comando.
- **Um único `next dev` por pasta.** Porta diferente não dá `.next` diferente; dois servidores se atropelam e produzem falsos negativos absurdos.
- **Nada commitado desde 19/08** — a entrega da área logada, do painel e do card vive só no working tree. Risco real de perda até o próximo commit.

---

## 10. Próxima entrega, na ordem (uma por vez)

1. **Configurar o cron** (GitHub Actions + secret `DATABASE_URL`) — destrava histórico denso, que destrava quase tudo o resto
2. **Comprar o domínio e apontar o DNS** (em andamento)
3. **Conferir visualmente os 4 PNGs do card D-1** (`%TEMP%\og-final-*.png`) e testar em WhatsApp/Telegram reais após o domínio resolver
4. **D-2: composer no painel** — 🟡 entregue (20/08), aguardando conferência e veredito do dono sobre a copy
5. **D-3/D-5 em paralelo; D-4 na sequência de D-3**
6. **Auth (AL-3) + RLS + gate do admin**, quando o volume justificar

---

## 11. Onde os documentos vivem

| Documento | Papel | Tipo |
|---|---|---|
| `docs/estado-do-projeto.md` | **Este.** O que é verdade hoje | vivo |
| `README.md` | Porta de entrada do repositório | vivo |
| `docs/pendencias.md` | Mapa de "o que fazer a seguir e por quê" da sessão 19–20/08 | vivo |
| `docs/tecnico/roadmap.md` | Fases e histórico de execução | vivo |
| `docs/tecnico/plano-motor-curadoria.md` | Dados e captura | vivo |
| `docs/tecnico/plano-ux-vitrine.md` | Interface pública | vivo |
| `docs/tecnico/plano-area-logada.md` | Área do cliente e painel do dono | vivo |
| `docs/tecnico/plano-distribuicao.md` | Card, copy, composer, Telegram e atribuição | vivo |
| `docs/tecnico/modelo-de-dados.md` | Princípios do schema (referência congelada) | **histórico** |
| `docs/estrategia/*` | Brief inicial do OfertaFlow (SaaS B2B) | **histórico** |
| `docs/pesquisa/*` | Pesquisa de mercado de julho | **histórico** |
| `archive/site/` | Protótipo estático anterior | **arquivado** |

---

## 12. Registro — redação oficial da documentação (20/08/2026)

**O que mudou em relação à versão anterior do mestre, por decisão do dono nesta sessão:**

1. **Amazon saiu de "fora de escopo"** e entrou como loja pendente de credencial (solicitação em aberto, sem código). Shopee permanece pendente de credencial, com adapter pronto.
2. **O oráculo foi confirmado como centro de comando**: composer (D-2), publicação no Telegram (D-5), rodagem via plataforma (GitHub Actions) e admin editorial (AD-2) são escopo confirmado, não aspiração.
3. **`packages/site` foi arquivado** em `archive/site/` (não deletado), removendo a ambiguidade de superfície.
4. **Provedor de e-mail fechado**: SMTP Hostinger (o plano M3 ainda citava Resend como candidato — corrigido).
5. **Correções factuais**: README dizia que o card de compartilhamento não existia (existe desde 20/08, aguardando conferência); UX-2 citava mini-gráfico no card (decidido para depois).

**D-2 entregue no mesmo dia:** composer no painel (seleção de produtos, destino, mensagem pronta com copy pelo sinal real e link, botão copiar) — 11 testes novos, 39/39, build limpo, smoke test HTTP 200. Registro e verificação em `plano-distribuicao.md`; aguardando conferência independente.
**D-2b entregue no mesmo dia:** link direto com página de passagem (`?direto=1`) — contador 3s → ML via `/go`, "quero ficar aqui", anti-loop do voltar; composer passou a gerar esse link. 44/44 testes, build limpo, smoke test com slug real. Aguardando conferência.

**PEDIDO DE CONFERÊNCIA — redação oficial (parcial)**

Conferente: verifique contra a fonte de verdade, não contra este relato.

1. **Arquitetura**: `archive/site/` existe e `packages/site/` não existe mais; `packages/capture/src/adapters/` contém `mercadolivre/` e `shopee/`.
2. **Banco**: 10 tabelas no schema `garimpa`, RLS desabilitada em todas (query em `pg_tables`).
3. **Testes**: `npm test` em `packages/web` = 28 pass / 0 fail; `npm run typecheck` limpo.
4. **Decisões registradas nas seções 1, 5 e 6**: conferir com o dono que Amazon/Shopee pendentes, oráculo como centro de comando e WhatsApp manual/WAHA fora correspondem ao que foi decidido em conversa.
5. **Julgamento humano (degrau 5)**: o dono aprova este texto como a régua oficial do projeto — nenhum ✅ sem isso.

**Veredito do dono — 20/08/2026: APROVADO.** Este documento passa a valer como a régua oficial do projeto.
