# Tech Stack & Architectural Map — BizuMiner

> **Referência Técnica Oficial do Repositório**  
> Nenhuma biblioteca nova deve ser adicionada e nenhum padrão arquitetural deve ser alterado sem alinhamento prévio e atualização deste documento.

---

## 1. Visão Geral da Arquitetura

O BizuMiner é construído como um monorepo modular em TypeScript, operando em Node.js >= 22.6 com execução de tipos nativa via `--experimental-strip-types`.

```
Garimpa (Monorepo)
├── packages/
│   ├── web/           -> Next.js 15 (App Router), React 19, UI nativa, APIs e Painel Admin
│   ├── persistence/   -> SQL Migrations (Supabase), Store Postgres, Scripts de Verificação
│   ├── capture/       -> Clientes e Adaptadores de Marketplaces (ML, Shopee, AliExpress)
│   └── extension/     -> Extensão Chrome Manifest V3 para captura assistida e ativação
├── docs/              -> Documentação histórica, diagnósticos e especificações técnicas
└── .conductor/        -> Memória persistente, governança de arquitetura e planos de tracks
```

---

## 2. Camadas do Sistema

### 2.1. Frontend & Painel Web (`packages/web`)
- **Framework:** Next.js 15 (App Router)
- **Biblioteca Base:** React 19 (`react`, `react-dom`)
- **Estilos & Design System:**
  - **CSS Puro Nativo:** Definido em `packages/web/app/globals.css` utilizando CSS Custom Properties (tokens de cor, tipografia e elevação do BizuMiner).
  - **PROIBIÇÃO EXPRESSA:** NÃO instalar nem utilizar Tailwind CSS ou Shadcn/UI neste projeto. A UI segue a identidade customizada e os seletores puros do BizuMiner.
- **Utilitários e Serviços:**
  - `sharp`: Otimização e processamento de imagens (Cards OG, thumbnails).
  - `qrcode` e `@types/qrcode`: Geração de QR codes para links de passagem e campanhas.
  - `@next/third-parties`: Carregamento otimizado de tags de analytics (Google Analytics 4 / GA4).
  - Driver `postgres`: Comunicação direta e veloz com o Supabase Postgres via server actions e route handlers.

### 2.2. Backend, Dados e Persistência (`packages/persistence`)
- **Banco de Dados:** Supabase Postgres
- **Schema Dedicado:** `garimpa` (todas as tabelas e views vivem dentro do schema `garimpa`, nunca no schema `public` padrão).
- **Mecanismo de Conexão:** Driver `postgres` (porsager/postgres) com pool de conexões otimizado para serverless e scripts CLI.
- **Abordagem de Dados:** SQL puro, tipado e com queries parametrizadas. **Sem ORMs** pesados (sem Prisma, sem Drizzle no fluxo produtivo).
- **Tabelas Principais:**
  - `garimpa.product`: Identificação do produto, marketplace, título, imagem, categoria e estado de vida.
  - `garimpa.price_observation`: Registro append-only de preços ao longo do tempo.
  - `garimpa.capture_run` e `capture_batch`: Auditoria e controle de execuções de varredura.
  - `garimpa.publication`: Registro de ofertas publicadas/compartilhadas.
  - `garimpa.click_event`: Métricas de saída com IP anonimizado via hash salgado (LGPD).
  - `garimpa.curation_review` & `editorial_selection`: Triagens manuais e automatizadas para pautas.
  - `garimpa.app_user`, `favorite`, `price_watch`: Área logada e preferências do comprador.
- **Scripts de Verificação (Derivação Real):**
  - Scripts `bin/verify-*.ts` e `bin/monitoring-*.ts` auditam a integridade real do banco (ex: `verify:lowest`, `verify:curation`, `verify:tenant-isolation`).

### 2.3. Módulos de Captura e Marketplaces (`packages/capture`)
- **Mercado Livre:**
  - Adaptador de páginas de ofertas públicas e integração com a Extensão BizuMiner.
  - Regra: URLs de saída mantêm parâmetros de campanha (`matt_tool`, `matt_word`, `subId`).
- **Shopee:**
  - Adaptador GraphQL oficial da Shopee Open API (`ShopeeAdapter`).
  - Coleta em lotes por subcategorias e departamentos com controle de paginação e retries.
- **AliExpress:**
  - Adaptador oficial TOP API / Open API (`AliExpressAdapter`).
  - Mapeamento de moedas, conversão cambial garantida para BRL e identificação de subcategorias.

### 2.4. Extensão de Navegador (`packages/extension`)
- **Plataforma:** Google Chrome Extension (Manifest V3).
- **Tecnologias:** TypeScript, esbuild para empacotamento, scripts de injeção em páginas de busca e produtos.
- **Finalidade:** Captura assistida sob consentimento do operador, extração estruturada de ofertas no Mercado Livre e ativação de catálogo.

### 2.5. Inteligência Artificial & Curadoria
- **Provedor:** Google Gemini via SDK `@google/generative-ai`.
- **Modelos em produção:** `gemini-2.5-flash` como principal e `gemini-3.5-flash-lite` como reserva padrão. A triagem mantém as decisões válidas e sinaliza respostas incompletas.
- **Lógica:** Avaliação de atratividade da oferta, adequação de títulos, detecção de falsas promoções e classificação correta de departamento.

---

## 3. Bibliotecas Permitidas vs. Proibidas

| Categoria | Permitidas (Stack Canônica) | Proibidas / Banidas |
|---|---|---|
| **Linguagem & Runtime** | TypeScript 5.6+, Node.js 22.6+ (`--experimental-strip-types`) | Runtimes não homologados, compiladores lentos sem benefício |
| **Framework Web** | Next.js 15 (App Router), React 19 | Pages Router legado, Remix, Astro |
| **Estilização** | CSS Nativo (`globals.css`, CSS Modules, Custom Properties) | **Tailwind CSS, Shadcn/UI**, Styled Components |
| **Acesso a Banco** | `postgres` (queries SQL parametrizadas em `garimpa.*`) | Prisma, Drizzle, TypeORM |
| **Marketplaces** | APIs Oficiais (GraphQL Shopee, TOP AliExpress) + Extensão | Puppeteer, Playwright, WAHA, bots emuladores de sessão |
| **Mensageria** | Composer web para cópia manual para WhatsApp / Telegram Bot API | Bots automatizados para WhatsApp Web, envio em massa não oficial |
