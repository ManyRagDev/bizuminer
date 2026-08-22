# BizuMiner

Site de curadoria de ofertas. Detecta promoções, **verifica se o desconto é real** usando histórico de preço próprio, e publica o que merece atenção. Hoje opera o Mercado Livre; Shopee e Amazon entram quando as credenciais de afiliado chegarem.

A comissão de afiliado é da casa: o BizuMiner publica, o comprador decide, o link de saída é rastreado de ponta a ponta.

> **Comece por aqui:** [`docs/estado-do-projeto.md`](docs/estado-do-projeto.md) — a régua oficial: o que o produto é, as decisões que não se reabrem, o estado atual e os bloqueios.

---

## Estrutura

```
docs/
  estado-do-projeto.md   documento mestre oficial — leia primeiro
  pendencias.md          mapa do que fazer a seguir e por quê (sessão 19–20/08)
  tecnico/               roadmap, planos de execução, modelo de dados
  estrategia/            brief antigo OfertaFlow — histórico, não usar para decidir

packages/
  capture/               captura de ofertas (Mercado Livre ativo; Shopee pronta, pendente de credencial)
  persistence/           schema, ingestão, migrations e scripts de verificação
  web/                   Next.js: vitrine, página de produto, área do cliente, painel do dono

archive/
  site/                  protótipo estático anterior — arquivado, não é superfície
```

---

## Rodar

O banco é Supabase (schema `garimpa`). A `DATABASE_URL` fica em `packages/web/.env.local`.

```bash
npm run dev --prefix packages/web
```

Rotas: `/` (vitrine), `/bizu/[slug]` (produto + card OG), `/minha-area` (área do cliente — requer login com Google), `/entrar` (login), `/admin` (painel do dono — exclusivo do e-mail admin), `/go/[slug]` (saída afiliada).

**Só um `next dev` por vez nesta pasta.** Porta diferente não cria um `.next` diferente — dois servidores se atropelam e produzem erros que parecem bug de código.

Uma varredura ao vivo do Mercado Livre:

```bash
node --env-file=../web/.env.local --experimental-strip-types bin/sweep.ts --pages 1
```

Verificação derivada do banco (nunca confie em relatório narrado):

```bash
npm run verify:member-area --prefix packages/persistence
```

---

## A decisão que organiza tudo

Construir **dentro do que as plataformas permitem**, e usar isso como posicionamento.

Na prática: publicação no WhatsApp é **manual**, feita por uma pessoa, sem nenhuma automação — os termos do WhatsApp não distinguem grupo, canal e comunidade, e há precedente judicial no Brasil contra fornecedores de disparo em massa. O Telegram entra por Bot API oficial, gratuita. **Docker, WAHA, Puppeteer e sessões não-oficiais: fora — nunca existiram neste código e não serão construídos.** Não existe anti-ban no projeto porque não existe nada para banir.

A plataforma gera a mensagem pronta (copy + link) no painel; o envio no WhatsApp é seu, como pessoa.

---

## Estado atual

**Funciona e foi validado em campo:** captura do Mercado Livre com execução auditável, histórico de preço próprio, vitrine pública, página de produto compartilhável e redirect afiliado gravando clique.

**Feito, aguardando conferência:** área do cliente (salvos, acompanhamento de preço, recomendações, perfil), painel do dono (telemetria e acionamento do robô), card de compartilhamento OG e **autenticação com Google (login em `/entrar`, admin exclusivo do dono)**.

**Não existe ainda:** varredura recorrente (cron decidido: GitHub Actions — falta configurar), alerta de preço, composer, publicação no Telegram, `sitemap.xml`.

**Bloqueio duro antes de qualquer deploy público de peso:** RLS desabilitada em todo o schema (defesa em profundidade — o acesso ao banco é só server-side; decisão de 22/08).

O detalhamento de cada item está em [`docs/estado-do-projeto.md`](docs/estado-do-projeto.md).

---

## Regras de operação

- **Edição de arquivo sempre por editor UTF-8, nunca por PowerShell.** `Set-Content` corrompe acentuação — já aconteceu.
- **Migration versionada não é migration aplicada.** Conferir no banco; a tabela `subscriber` existiu só como arquivo por três dias, com a newsletter quebrada em silêncio.
- **Afirmação sobre execução real sai de script, não de narrativa.** Os `bin/verify-*.ts` existem para isso.
- **Toda entrega termina com pedido de conferência** antes de virar ✅. Quem implementa não aprova.

---

## Segurança

Credenciais de afiliado e tokens **nunca** entram em log, resposta de API ou controle de versão. O IP de quem clica é gravado apenas como hash com sal (LGPD). A área do cliente não coleta e-mail sem consentimento explícito.
