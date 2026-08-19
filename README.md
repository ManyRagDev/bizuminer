# BizuMiner

Plataforma de curadoria e distribuição de ofertas para afiliados.

Detecta ofertas de e-commerce, **verifica se o desconto é real** usando histórico de preço próprio, e distribui em canais que a audiência do cliente escolheu seguir.

---

## Estrutura

```
docs/
  estrategia/        plano de negócio, decisões, brief do produto
  pesquisa/          análise competitiva, prompts de pesquisa
  tecnico/           modelo de dados
  apresentacoes/     dashboard interativo e decks
  modelo-financeiro.xlsx

packages/
  capture/           camada de captura de ofertas (Shopee, Mercado Livre)

tools/               scripts que geram o xlsx e o pptx
```

---

## Por onde começar

**Entender o projeto:** `docs/estrategia/plano-de-negocio-90-dias.md`

**Ver o resumo visual:** abrir `docs/apresentacoes/dashboard-executivo.html` no navegador

**Entender as decisões técnicas:** `packages/capture/README.md`

**Rodar o código:**

```bash
cd packages/capture
npm install
npm test          # 51 testes, nenhum toca a rede
npm run typecheck
```

---

## A decisão que organiza tudo

Construir **dentro do que as plataformas permitem**, e usar isso como posicionamento.

A dor número um da categoria — banimento de contas de WhatsApp — é consequência da arquitetura que todos os onze concorrentes adotaram. Não se corrige com anti-ban melhor; corrige-se não precisando de anti-ban.

Três canais, cada um com um papel, nenhum em zona cinzenta:

| Canal | Mecanismo | Custo |
|---|---|---|
| Telegram | Bot API oficial | zero |
| Grupo de WhatsApp | conteúdo pronto, o gestor publica | zero |
| WhatsApp 1:1 | Cloud API oficial, alerta de preço | ~R$0,35/msg |

---

## Estado atual

**Pronto:** camada de captura com contrato de adapter, Shopee (API oficial) e Mercado Livre (OAuth 2.0), mais o `link-lab` para o experimento de atribuição.

**Bloqueado:** credencial da Shopee Open API — aprovação manual, sem prazo publicado.

**Em teste:** atribuição de link do Mercado Livre. Ver `packages/capture/bin/link-lab.ts`.

**Próximo:** endpoint de callback OAuth, persistência de ofertas com histórico de preço, worker BullMQ.

---

## Pendências que não dependem de código

1. Solicitar App ID e Secret da Shopee — caminho crítico
2. Acordo societário por escrito, antes da primeira linha de código de produção
3. Abrir CNPJ com estrutura de Fator R
4. Sessão de mapeamento com a sócia, levantando a comissão histórica como linha de base
5. Definir os cinco parâmetros do schema (ver `docs/tecnico/modelo-de-dados.md`)

---

## Segurança

Credenciais de afiliado e tokens OAuth **nunca** entram em log, resposta de API ou controle de versão. Ver `.gitignore` e a seção de credenciais em `packages/capture/README.md`.
