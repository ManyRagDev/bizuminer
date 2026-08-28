# Plano — Extensão de captura e operação multi-afiliado

**Criado em 25/08/2026.** Plano executável para transformar a captura manual já existente em uma extensão Chromium MV3, com botão no próprio catálogo do Mercado Livre, persistência imediata no BizuMiner e atribuição correta da comissão ao afiliado dono da publicação.

Status: ✅ feito e conferido · 🟡 parcial, com falta explícita · ⬜ não iniciado

Documento-pai: [`plano-afiliados.md`](./plano-afiliados.md). Handoff para a sessão implementadora: [`handoff-extensao-captura-terra.md`](./handoff-extensao-captura-terra.md).

---

## 1. Resultado esperado

O afiliado instala e conecta a extensão uma vez. Depois:

1. abre uma listagem do Mercado Livre (`/ofertas`, busca ou categoria);
2. clica no ícone da extensão para **Ativar nesta página**;
3. cada card passa a exibir **Adicionar ao BizuMiner**;
4. o clique explícito lê somente aquele card e envia o produto à API do BizuMiner;
5. a API identifica o dispositivo e o afiliado, grava produto + observação + publicação e devolve a URL compartilhável;
6. o botão mostra `Salvando…` e depois `✓ Adicionado`;
7. se a rede falhar, a extensão guarda temporariamente a solicitação e reenvia sem duplicar a observação.

O Supabase/Postgres é a fonte de verdade. A extensão nunca é o catálogo definitivo e nunca fala diretamente com Supabase.

---

## 2. Estado real herdado

### 2.1 O que já existe

- 🟡 Bookmarklet BM1 que lê uma PDP aberta e envia para `/api/capture`, com fallback de copiar o bloco.
- 🟡 Endpoint `/api/capture` com `CAPTURE_TOKEN`, CORS `*`, rate limit mínimo em memória e persistência em `tenant_id = "local"`.
- 🟡 Persistência manual em `packages/web/lib/manual-capture.ts`: upsert de `product` + nova `price_observation`, sem `capture_run`.
- ✅ Parser puro do HTML de cards do ML em `packages/capture/src/adapters/mercadolivre/deals.ts`, já capaz de extrair href real, `wid`/ID no path, preço atual/original por `aria-label` e imagem.
- ✅ Supabase Auth/Google vinculado a `garimpa.app_user`; acesso a dados do app continua no servidor por `DATABASE_URL` e role `garimpa_app`.
- ✅ `tenant_id` está nas tabelas de negócio, mas hoje todos os caminhos usam o literal `"local"`.
- ✅ Link de afiliado funciona, porém lê `ML_TRACKING_ID` e `ML_TOOL_ID` globais.
- ✅ `publication.slug` é global e derivado como `ml-<external_id>`; `/go/[slug]` cria a publicação apenas no primeiro clique.

### 2.2 Achados que mudam a solução

1. **O slug atual colide entre afiliados.** Dois afiliados capturando o mesmo anúncio teriam produtos distintos por `tenant_id`, mas disputariam o mesmo `publication.slug` global.
2. **`app_user` já é identidade de comprador.** Colocar `tracking_id`, `tool_id` ou um único papel diretamente nessa tabela mistura pessoa, perfil de compra e conta de afiliado.
3. **`tenant_id` não possui entidade-pai.** Ele escopa consultas, mas não há tabela `tenant`/`affiliate_account` nem FK que impeça uma linha de apontar para o tenant errado.
4. **O token atual está no cliente.** O bookmarklet gerado contém o `CAPTURE_TOKEN`; ocultá-lo como variável separada não o torna secreto. Esse token global não serve para terceiros.
5. **O adapter de `/ofertas` faz requisições automatizadas.** Cadência baixa não muda a natureza automatizada do acesso. Ele não pode permanecer como pilar operacional se a interpretação adotada dos termos proíbe esse acesso.
6. **Existe uma credencial de banco em texto numa migration histórica.** O valor não deve ser reproduzido em relatório. A role precisa de rotação antes de expor captura multi-afiliado; reescrita do histórico Git é decisão separada do dono.

---

## 3. Decisões fechadas

| Tema | Decisão |
|---|---|
| Identidade | `app_user` permanece pessoa; `affiliate_account` e tabelas relacionadas são novas. |
| Catálogo | Cada `affiliate_account` possui um `tenant_id`; produtos e observações continuam isolados por esse tenant. |
| Credencial ML | `tracking_id`/`tool_id` são configuração autoritativa do servidor. Eles aparecem em URLs e não são tratados como senha, mas nunca são aceitos do client nem enviados como configuração da extensão. Segredos OAuth futuros ficam em armazenamento cifrado separado. |
| Publicação | Nasce na captura, não no primeiro clique. O slug é estável e exclusivo por publicação. |
| Comissão | `/go/[slug]` resolve `publication → affiliate_account → affiliate_marketplace_config`; não existe fallback silencioso para a tag global. |
| Extensão | Chromium/Chrome MV3 primeiro, TypeScript sem framework de UI. Firefox/Safari ficam para depois. |
| Permissões | `activeTab`, `scripting`, `storage` e `alarms`; host permission somente para a API BizuMiner. Sem permissão permanente para ler todos os sites do ML. |
| Ativação | O usuário clica no ícone e ativa a página atual. O `MutationObserver` apenas decora cards novos; dados são lidos/enviados só no clique de cada botão. |
| Persistência | POST imediato na API. `chrome.storage.local` guarda token, outbox temporária e estados de UX; nunca é fonte de verdade. |
| Autenticação | Token opaco por dispositivo, retornado uma vez, guardado só em `chrome.storage.local`, hash no banco, revogável. |
| Pareamento | Código curto de uso único, validade de 10 minutos, gerado no painel autenticado e colado na extensão. |
| Idempotência | `requestId` UUID gerado antes da primeira tentativa e preservado em todos os retries. Unicidade por `(extension_device_id, client_request_id)`. |
| Captura automática | Fora. Sem varrer cards, sem “adicionar todos”, sem aba oculta, sem interceptar API interna, sem navegar em background. |
| Cobrança | Fora deste plano; assinatura fixa continua em aberto e não bloqueia implementação. |

---

## 4. Invariantes

| Regra | Invariante verificável |
|---|---|
| **I1 — gesto humano** | Cada POST de produto decorre de um clique explícito em um card ou na PDP; observer e injeção não enviam produto. |
| **I2 — identidade server-side** | `affiliate_id`, `tenant_id`, `tracking_id` e `tool_id` usados na gravação/link vêm do token do dispositivo e do banco, nunca do payload. |
| **I3 — comissão correta** | Dois afiliados no mesmo `external_id` geram publicações e `matt_word` diferentes. Config ausente/suspensa retorna erro; nunca usa a conta do dono como fallback. |
| **I4 — idempotência** | Repetir a mesma requisição, inclusive após timeout, devolve o mesmo resultado sem nova `price_observation`. |
| **I5 — catálogo isolado** | Uma query ou rota de afiliado nunca lê nem grava produto de outro `tenant_id`. |
| **I6 — token mínimo** | Nenhum token bruto de dispositivo, código de pareamento ou URL de banco aparece no banco, log, telemetria, resposta posterior ou bundle versionado. |
| **I7 — preço honesto** | Captura manual registra fato pontual e frescor; não fabrica histórico contínuo nem selo de menor preço verificado. |
| **I8 — falha recuperável** | Network/5xx/429 permanece na outbox; 400 sai da fila com erro visível; 401/403 pausa a fila e pede reconexão. |
| **I9 — sem coleta em lote** | Não existe botão “adicionar todos”, POST em loop sobre cards ou chamada automática de `/ofertas` pelo BizuMiner. |
| **I10 — migration real** | Migration criada, aplicada e consultada no banco real; arquivo versionado sozinho mantém a entrega 🟡. |

---

## 5. Arquitetura alvo

```text
Pessoa autenticada no painel
  └─ gera código de pareamento (10 min)
       └─ extensão troca o código uma vez
            └─ chrome.storage.local: token bm_ext_* bruto
                 └─ clique explícito no card ML
                      ├─ content script extrai somente o card clicado
                      ├─ service worker cria/preserva requestId
                      └─ POST /api/extension/captures
                           ├─ autentica hash do token e verifica revogação
                           ├─ resolve affiliate_account + tenant_id
                           ├─ valida/normaliza payload
                           ├─ transação: product → observation → publication
                           └─ responde slug/URL compartilhável

/go/[slug]
  └─ publication → affiliate → marketplace config
       ├─ grava click_event no mesmo tenant
       └─ gera matt_word/matt_tool no servidor → 302 ML
```

Fronteiras:

- `packages/extension`: DOM, UX, outbox e chamada à API; não conhece banco nem configuração de comissão.
- `packages/web/app/api/extension`: autenticação do dispositivo, CORS, rate limit e contratos HTTP.
- `packages/web/lib/extension-*`: validação, hash, pareamento e orquestração.
- `packages/web/lib/manual-capture.ts` ou um novo núcleo de persistência: transação reutilizável para bookmarklet e extensão.
- `packages/persistence/supabase/migrations`: schema, constraints, índices, grants e políticas.
- `packages/capture`: utilitários puros do Mercado Livre compartilháveis; o fetch automatizado fica operacionalmente desligado.

---

## 6. Contratos de dados

Os nomes abaixo são contrato. Mudança durante a implementação deve ser registrada neste plano antes do código consumidor.

### 6.1 `garimpa.affiliate_account`

| Campo | Tipo/regra |
|---|---|
| `id` | `text` PK, `gen_random_uuid()::text` |
| `tenant_id` | `text not null unique`; chave de isolamento usada pelas tabelas atuais |
| `public_slug` | `text not null unique`; 4–32 caracteres, `[a-z0-9-]`, não contém credencial ML |
| `display_name` | `text not null` |
| `status` | `text not null`, check `active`, `suspended` |
| `created_at`, `updated_at` | `timestamptz not null default now()` |

Bootstrap legado: criar `id = 'aff_local'`, `tenant_id = 'local'`, slug reservado da casa. Antes da migration, consultar todos os `tenant_id` distintos e bloquear se existir valor sem conta correspondente.

### 6.2 `garimpa.affiliate_membership`

| Campo | Tipo/regra |
|---|---|
| `affiliate_id` | FK para `affiliate_account`, `on delete restrict` |
| `app_user_id` | FK para `app_user`, `on delete restrict` |
| `role` | check `owner`, `operator`; MVP cria somente `owner` |
| `created_at` | `timestamptz not null default now()` |

PK composta `(affiliate_id, app_user_id)`. Índice em `(app_user_id, affiliate_id)`. O bootstrap da casa é feito por script server-side que procura o `app_user` do `ADMIN_EMAIL`; se a conta ainda não existir, o dono precisa fazer login antes. Nenhum e-mail é gravado na migration.

### 6.3 `garimpa.affiliate_marketplace_config`

| Campo | Tipo/regra |
|---|---|
| `id` | `text` PK |
| `affiliate_id` | FK para `affiliate_account`, `on delete restrict` |
| `marketplace` | `text`, inicialmente somente `mercadolivre` |
| `tracking_id` | `text not null` |
| `tool_id` | `text not null` |
| `status` | check `active`, `invalid`, `suspended` |
| `validated_at` | `timestamptz null` |
| `created_at`, `updated_at` | `timestamptz` |

Unique `(affiliate_id, marketplace)`. A API nunca devolve os valores; devolve apenas `configured`, `status` e `validatedAt`. OAuth secrets futuros não entram nessa tabela.

### 6.4 `garimpa.extension_device`

| Campo | Tipo/regra |
|---|---|
| `id` | `text` PK |
| `affiliate_id` | FK para `affiliate_account` |
| `created_by_app_user_id` | FK para `app_user` |
| `name` | `text not null`, máximo 80 |
| `token_hash` | `text unique null`; SHA-256 do token de alta entropia |
| `token_prefix` | `text null`; somente identificação segura em painel/log |
| `pairing_code_hash` | `text unique null` |
| `pairing_expires_at` | `timestamptz null` |
| `paired_at`, `last_used_at`, `revoked_at` | `timestamptz null` |
| `created_at` | `timestamptz not null default now()` |

O estado é derivado: pendente enquanto o código é válido e não há token; ativo quando há token e `revoked_at is null`; revogado quando `revoked_at` existe. O token bruto (`bm_ext_` + 32 bytes aleatórios em base64url) é retornado apenas no exchange.

### 6.5 Evolução de `price_observation`

Adicionar:

- `capture_source text not null` com check `sweep`, `bookmarklet`, `extension`, `legacy`;
- `extension_device_id text null` FK `on delete restrict`;
- `client_request_id uuid null`;
- `source_page_url text null`;
- `client_captured_at timestamptz null`;
- `received_at timestamptz not null default now()`.

Criar índice único parcial em `(extension_device_id, client_request_id)` quando ambos não forem nulos. O `observed_at` da extensão usa o relógio do servidor; `client_captured_at` preserva a informação do browser sem torná-la autoridade.

### 6.6 Evolução de `publication`

Adicionar `affiliate_id text` FK para `affiliate_account`, backfill para `aff_local`, tornar `not null` depois da validação e criar unique `(affiliate_id, product_id, channel)`. `slug` permanece globalmente único, mas deixa de ser sintetizado pelas queries.

Formato para novas publicações: `ml-<external_id>-<affiliate_public_slug>`. Slugs legados `ml-<external_id>` continuam válidos e pertencem à casa. A resolução de `/bizu/[slug]` e `/go/[slug]` passa a começar por `publication.slug`, sem parsear `external_id` do slug.

### 6.7 Integridade multi-tenant

Antes de abrir cadastro externo:

- cada `tenant_id` existente precisa ter `affiliate_account` correspondente;
- FKs de negócio devem carregar o tenant junto quando houver relação entre tabelas (`price_observation → product`, `publication → product`, `click_event → publication`, favoritos/alertas → usuário/produto);
- índices devem cobrir todas as FKs e predicados de tenant;
- constraints grandes devem ser adicionadas de forma segura (`NOT VALID` + `VALIDATE CONSTRAINT` quando apropriado);
- queries de runtime usam um helper `withTenantDb(tenantId, fn)` e continuam incluindo o tenant explicitamente;
- RLS com contexto de tenant é gate obrigatório antes do primeiro afiliado externo. A política final deve ser testada com dois tenants e não pode depender de `user_metadata`.

O schema `garimpa` não é consumido pelo Data API. Não conceder `anon`/`authenticated` às tabelas; Supabase Auth serve para identidade, e o servidor continua a única borda de dados.

---

## 7. Contrato HTTP

### 7.1 Criar código de pareamento

`POST /api/extension/pairing-codes`

- autenticação: cookie Supabase + membership ativa;
- body: `{ "deviceName": "Chrome do notebook" }`;
- resposta 201: `{ "deviceId", "pairingCode", "expiresAt" }`;
- o código bruto aparece uma vez; o banco guarda somente hash;
- invalidar códigos pendentes anteriores do mesmo dispositivo/usuário;
- limite: 5 códigos/hora por usuário e IP.

### 7.2 Trocar código por token

`POST /api/extension/pair/exchange`

- CORS restrito às origens configuradas da extensão;
- body: `{ "pairingCode", "extensionVersion" }`;
- resposta 200: `{ "deviceId", "deviceToken", "affiliate": { "displayName" } }`;
- troca atômica: código válido, não consumido, dentro do prazo; grava hash do token, limpa hash do código e marca `paired_at`;
- código inválido/expirado usa mensagem genérica; limite por IP evita enumeração.

### 7.3 Capturar produto

`POST /api/extension/captures`

Headers:

```text
Authorization: Bearer bm_ext_<alta-entropia>
Idempotency-Key: <requestId UUID>
Content-Type: application/json
```

Body v1:

```json
{
  "version": 1,
  "requestId": "UUID",
  "marketplace": "mercadolivre",
  "clientCapturedAt": "ISO-8601",
  "page": {
    "kind": "offers|search|category|product",
    "url": "https://www.mercadolivre.com.br/..."
  },
  "product": {
    "externalId": "MLB1234567890",
    "title": "...",
    "productUrl": "https://produto.mercadolivre.com.br/...",
    "imageUrl": "https://http2.mlstatic.com/...",
    "priceCents": 19990,
    "originalPriceCents": 24990
  }
}
```

Resposta 200, tanto na primeira gravação quanto no retry idempotente:

```json
{
  "ok": true,
  "duplicate": false,
  "productId": "...",
  "observationId": "...",
  "publication": {
    "slug": "ml-MLB1234567890-afiliado",
    "url": "https://www.bizuminer.com.br/bizu/..."
  }
}
```

Erros estáveis: `invalid_payload` 400, `unauthorized` 401, `device_revoked` 403, `rate_limited` 429 com `Retry-After`, `server_error` 500. A resposta não inclui tenant, IDs do ML do afiliado nem material de autenticação.

Validação mínima: hosts permitidos do ML/CDN; `externalId` compatível com `wid` ou path; URL sem `matt_*` recebido do client; título 3–250; preço inteiro positivo e com teto defensivo; original maior que o atual ou nulo; timestamps dentro de janela razoável. O servidor normaliza de novo antes de persistir.

---

## 8. Contrato da extensão

### 8.1 Estrutura prevista

```text
packages/extension/
  manifest.json
  package.json
  tsconfig.json
  src/
    background/service-worker.ts
    content/activate-catalog.ts
    content/catalog-observer.ts
    content/card-extractor.ts
    content/bizu-button.ts
    popup/index.html
    popup/popup.ts
    lib/api.ts
    lib/contracts.ts
    lib/outbox.ts
    lib/storage.ts
  test/
    card-extractor.test.ts
    outbox.test.ts
    fixtures/
  scripts/
    verify-manifest.mjs
```

### 8.2 Manifesto MV3

- `permissions`: `activeTab`, `scripting`, `storage`, `alarms`;
- `host_permissions`: somente `https://www.bizuminer.com.br/*` e host local explicitamente separado no build de desenvolvimento;
- sem content script permanente; injeção via `chrome.scripting.executeScript` após clique;
- sem código remoto, `eval`, permissão de histórico, cookies ou tabs amplas;
- Content Security Policy compatível com Chrome Web Store.

### 8.3 Decoração e extração

- ativação encontra cards já renderizados e instala um `MutationObserver` limitado ao container do catálogo;
- cada card recebe um custom element idempotente com Shadow DOM para não herdar CSS do ML;
- observer marca/decora, mas não transforma o card em payload;
- clique no botão chama `stopPropagation()`/`preventDefault()`, extrai somente o card pai e envia mensagem ao service worker;
- seletores ficam centralizados e possuem estratégias alternativas por semântica (`href`, `aria-label`, imagem), não por posição visual;
- preço é lido do `aria-label`; nunca inferido concatenando partes visuais sem teste;
- href real é normalizado removendo tracking interno, mas preservando o path verdadeiro;
- card incompleto mostra `Abrir produto para completar`; PDP é fallback, não fluxo principal.

Estados do botão: `Adicionar` → `Salvando…` → `✓ Adicionado`; erros recuperáveis mostram `Tentar novamente`; 401/403 mostra `Reconectar extensão`. O botão nunca promete desconto verificado.

### 8.4 Outbox

- chave local contém no máximo 200 itens e TTL de 7 dias;
- payload já nasce com `requestId`; retry nunca gera outro;
- network/5xx: backoff 5 s, 30 s, 2 min, 10 min; depois tenta em nova ação/alarme;
- 429 respeita `Retry-After`;
- 400 sai da fila e fica no histórico de erro local;
- 401/403 pausa toda a fila até reconectar;
- 200 remove o item, mesmo quando `duplicate: true`;
- token fica em `chrome.storage.local`, nunca `sync`; logout/revogação apaga token local depois da confirmação ou ao receber 403.

---

## 9. Entregas sequenciais

### E0 — Conformidade e contenção do legado — 🟡

**Objetivo:** retirar a automação de acesso ao ML do caminho operacional e documentar o que permanece como parser offline.

Parcial porque o bookmarklet/manual já existe; faltam o kill switch, a coerência dos caminhos operacionais e a rotação externa da credencial observada.

Entram:

- kill switch com default seguro para `bin/sweep.ts` e `/api/admin/rodagem` no marketplace ML;
- painel sem promessa de cron/sweep do ML;
- `MercadoLivreDealsAdapter` mantido para fixtures, parser e investigação, sem execução de produção;
- bookmarklet continua temporariamente só para a conta da casa;
- rotação da credencial da role do banco e atualização dos ambientes, sem imprimir o segredo;
- inventário dos locais que ainda dizem que baixa cadência torna scraping aceitável.

Não entram: apagar histórico, apagar adapter/testes ou concluir interpretação jurídica. A linguagem correta é “limite técnico adotado para reduzir risco”, não parecer jurídico.

Arquivos prováveis: `packages/persistence/bin/sweep.ts`, `packages/web/app/api/admin/rodagem/route.ts`, `packages/web/app/admin/capturador.tsx`, docs vivos e variáveis de ambiente.

Aceite: nenhuma ação de produção faz request automatizada à listagem ML por default; parser puro continua testado; bookmarklet ainda funciona para `local`; credencial rotacionada fora do código. Conferência total obrigatória.

**Registro de implementação — 26/08/2026 (🟡 aguardando conferência):**

- Kill switch central criado em `packages/capture/src/automated-capture.ts` (`mlAutomatedCaptureEnabled`): ligado somente com `ML_AUTOMATED_CAPTURE_ENABLED=true` E `NODE_ENV=development`; produção e flag ausente falham fechadas. Espelho web em `packages/web/lib/automated-capture.ts` (o pacote web não importa `packages/capture`).
- `packages/persistence/bin/sweep.ts` aborta ANTES de instanciar adapter/store/`capture_run` e ANTES de qualquer rede quando desligado (execução real confirmada: exit 1, mensagem `[bloqueado]`, zero request).
- `/api/admin/rodagem` devolve erro estável `ml_automated_capture_disabled` (409) sem simular rodagem; o painel desabilita o botão e explica que a captura vigente é manual.
- Parser puro (`parseDealsHtml`), fixtures e testes do adapter **intactos** — só o comentário de "cadência 30–60 min" foi reescrito para a linguagem de limite técnico.
- Linguagem do painel (`capturador.tsx`) e da doc (`mercadolivre-engenharia-reversa.md` §3, `plano-motor-curadoria.md` M1-C) deixou de afirmar violação de termos e passou a "limite técnico adotado para reduzir risco".
- **Bloqueio externo registrado:** rotação da credencial de role do banco exposta em migration histórica — não executada; ação externa do dono. Nenhum valor reproduzido.
- Testes: capture 72→77 (+5 kill switch), web 72→76 (+4 kill switch), persistence 11/11 inalterado; typecheck limpo nos três; build web limpo.

> **Reconciliação pendente (26/08/2026):** o dono decidiu em `DECISAO-PENDENTE-SCRAPING-CONSENTIDO.md` que o scraping automatizado **permanece disponível como opt-in por afiliado** (aviso + consentimento versionado + revogação individual + kill switch global) — **não** "desligado definitivamente". O objetivo desta entrega deve ser relido como **"conter e tornar opt-in"**. O kill switch aqui entregue é a base compatível (default off + global); o fluxo de consentimento versionado é uma **nova entrega**, não implementada, a planejar em seguida.

### E1 — Fundação de afiliados — 🟡

**Objetivo:** criar identidade de conta sem alterar ainda o link público.

Ordem: migration → tipos/queries → bootstrap local → verificador → testes.

Cria `affiliate_account`, `affiliate_membership`, `affiliate_marketplace_config`; cria `aff_local`; script liga o administrador; painel mínimo permite ver/configurar status da conta sem devolver valores. Migração deve nascer via comando atual descoberto com `supabase ... --help`, não com timestamp inventado.

Aceite: banco real possui as tabelas/constraints/índices; `aff_local` aponta para `tenant_id=local`; exatamente um owner ativo após bootstrap; configuração ML pode ser criada no servidor e nunca aparece em payload client. Status 🟡 até consulta derivada do banco e conferência.

**Registro de implementação — 26/08/2026 (🟡 aguardando conferência; migration aplicada em 26/08 e verificada):**

- Migration `20260826010000_garimpa_affiliates.sql` criada à mão seguindo a convenção do repo (`YYYYMMDDHHMMSS_nome.sql`), com guarda `DO` que aborta se existir tenant de negócio ≠ `local` sem conta (verificado: único `tenant_id` no banco é `local`, 346 produtos). **A CLI `supabase` não está instalada neste ambiente** — a migration foi escrita à mão na convenção do repo e **aplicada via MCP** (`garimpa_affiliates`) em 26/08, com autorização do dono; verificada por `verify:affiliates`.
- Tabelas: `affiliate_account` (tenant_id unique, public_slug unique + check `[a-z0-9-]{4,32}`), `affiliate_membership` (PK composta, índice `(app_user_id, affiliate_id)`), `affiliate_marketplace_config` (unique `(affiliate_id, marketplace)`). Grants explícitos para `garimpa_app`. Bootstrap `aff_local` (tenant `local`, slug `bizuminer`).
- Tipos/queries server-only em `packages/web/lib/affiliate-db.ts`: nunca devolvem `tracking_id`/`tool_id` — só `configured`/`status`/`validatedAt`.
- Bordas: `GET /api/admin/affiliates` e `POST /api/admin/affiliates/config` (admin-only; o POST aceita os valores mas a resposta não os devolve). Painel mínimo em `app/admin/affiliates.tsx`.
- Scripts: `bin/bootstrap-affiliate-house.ts` (liga owner via `ADMIN_EMAIL`) e `bin/verify-affiliates.ts` (verificação derivada do banco); npm scripts `verify:affiliates` e `bootstrap:affiliate-house`.
- Verificação local: typecheck limpo (persistence + web), testes inalterados (persistence 11/11, web 76/76), build web limpo com as 2 novas rotas. **Verificação contra o banco real é degrau 4 — só após a migration ser aplicada (autorização externa).**

### E2 — Integridade e isolamento por tenant — 🟡

**Objetivo:** transformar `tenant_id` de convenção em barreira verificável antes de cadastrar terceiros.

Entram: constraints compostas, índices de FKs, helper transacional de tenant, migração das queries web/persistence e RLS/contexto de tenant para a role runtime. Admin cross-tenant deve usar fronteira server-only e privilégio mínimo próprio; não resolver permissão com `SECURITY DEFINER` público ou `service_role` no app.

Aceite: fixture com tenants A/B prova leitura e escrita isoladas; tentativa cruzada falha no banco; queries da casa continuam; advisors/consultas de FK/índice sem achado crítico. Nenhum afiliado externo antes do ✅.

**Registro de implementação — 26/08/2026 (🟡 aguardando conferência; migrations aplicadas em 26/08 e verificadas):**

- **Achado de auditoria:** `anon`/`authenticated` NÃO têm grant em nenhuma tabela do schema `garimpa` (query `information_schema.role_table_grants` retornou vazio). Ou seja, o schema NÃO está exposto ao Data API — a fronteira real segue sendo o servidor/`garimpa_app`. A RLS é defesa em profundidade, não a borda.
- Migration `20260826020000_garimpa_tenant_integrity.sql`: `tenant_id` passa a referenciar `affiliate_account.tenant_id` (NOT VALID + VALIDATE) nas 10 tabelas de negócio; chaves `unique (id, tenant_id)` em product/capture_run/app_user/publication; FKs compostas (relação nunca cruza tenant) substituindo as single-column (mesma semântica de delete); índices de tenant/FK.
- Migration `20260826030000_garimpa_tenant_rls.sql` (GATED): `ENABLE ROW LEVEL SECURITY` + política `tenant_scope` para `garimpa_app` via `current_setting('garimpa.tenant_id', true)`; **não depende de `user_metadata`**; marcada como NÃO aplicar antes da adoção completa de `withTenantDb`.
- Helper `packages/web/lib/tenant-db.ts`: `validTenantId`, `assertSameTenant`, `withTenantDb` (contexto transacional). Testes puros em `test/tenant-db.test.mjs`.
- Verificador A/B `bin/verify-tenant-isolation.ts` (fixture descartável test_a/test_b + limpeza) — **degrua 4, só após aplicar E1+E2**.
- Verificação local: typecheck limpo (persistence + web), web 76→79 testes (+3 tenant-db), persistence 11/11, build web limpo.

### E3 — Publicação e link por afiliado — 🟡

**Objetivo:** fechar a atribuição de comissão e eliminar colisão de slug.

Entram: `publication.affiliate_id`, backfill, criação de publicações faltantes, queries por slug, função `affiliateLink` recebendo config explícita e `/go` sem env global. A feature fica atrás de flag até `aff_local` ter configuração válida; depois da ativação, config ausente falha fechada.

Aceite: o mesmo `external_id` em tenants A/B produz dois slugs, dois produtos e dois `matt_word`; slugs antigos continuam abrindo; clique grava `click_event` no tenant correto; nenhuma chamada de link lê `ML_TRACKING_ID` como fallback.

**Registro de implementação — 26/08/2026 (🟡 aguardando conferência; migration aplicada em 26/08 e verificada):**

- Migration `20260826040000_garimpa_publication_affiliate.sql`: `publication.affiliate_id` (FK → affiliate_account), backfill `aff_local`, `not null`, unique `(affiliate_id, product_id, channel)`. Verificado: 0 duplicatas `(product_id, channel)` no banco — o unique aplica limpo.
- `affiliateLink(productUrl, subId, config)` em `lib/db.ts` deixou de ler `ML_TRACKING_ID`/`ML_TOOL_ID` — a credencial agora é parâmetro explícito. Teste prova que dois afiliados geram `matt_word` distintos e que a função não toca o env global.
- `resolvePublicationForLink(slug)` (publication → product → affiliate → marketplace config) — devolve `trackingId`/`toolId` do dono da publicação ou `null`.
- `/go/[slug]` refatorado: caminho V2 (flag `AFFILIATE_LINKS_V2_ENABLED`) resolve a comissão por afiliado e **falha fechado** (404 sem fallback) quando config ausente/suspensa; caminho legado (flag off) preserva os links antigos e passa a gravar `affiliate_id='aff_local'`.
- `lib/flags.ts` (flags server-only, sem `NEXT_PUBLIC_`).
- Verificação local: typecheck limpo, web 79→84 testes (+5: affiliate-link + flags), build limpo. Degrau 4 (dois slugs/dois matt_word no banco) pendente de aplicação de E1–E3.

### E4 — Pareamento e API de captura — 🟡

**Objetivo:** substituir o token global pela identidade revogável de dispositivo.

Entram: evolução de `price_observation`, `extension_device`, rotas de pareamento/captura, CORS allowlist, hash/token, rate limits e transação idempotente. Extrair um núcleo de persistência comum; não duplicar SQL entre bookmarklet e extensão.

Aceite: token bruto aparece somente no exchange; retry idêntico gera uma observação; dispositivo revogado recebe 403; payload com tenant/tag forjados é ignorado/rejeitado; dois dispositivos resolvem seus próprios afiliados. `/api/capture` fica marcado deprecated e ainda limitado à casa.

**Registro de implementação — 26/08/2026 (🟡 aguardando conferência; migration aplicada em 26/08 e verificada):**

- Migration `20260826050000_garimpa_extension_device.sql`: `extension_device` (token_hash/pairing_code_hash únicos, revogável), evolução de `price_observation` (`capture_source` com backfill `sweep`/`legacy` + check, `extension_device_id`, `client_request_id`, `source_page_url`, `client_captured_at`, `received_at`) e índice único parcial `(extension_device_id, client_request_id)`.
- Núcleo puro: `lib/extension-token.ts` (`bm_ext_` + 32 bytes base64url, SHA-256, código de pareamento 8 chars, comparação em tempo constante), `lib/extension-contract.ts` (validação v1 sem aceitar tenant/tag — identidade vem do dispositivo), `lib/extension-cors.ts` (allowlist exata, sem `*`).
- Bordas: `POST /api/extension/pairing-codes` (admin, 5/hora), `POST /api/extension/pair/exchange` (troca atômica, mensagem genérica, 10/min por IP), `POST /api/extension/captures` (Bearer token, `EXTENSION_CAPTURE_ENABLED`, idempotência, 401/403/429). `lib/extension-db.ts` com `authenticateDevice` (distingue revogado), `exchangePairingCode`, `persistExtensionCapture` (transação produto+observação+publicação idempotente).
- `/api/capture` marcado DEPRECATED (token global da casa até a extensão estabilizar).
- Verificação local: typecheck limpo, web 84→102 testes (+18: token/contract/cors), build limpo com as 3 novas rotas. Degrau 4 (retry idempotente + revogação no banco) pendente de aplicação de E1–E4.

### E5 — Extensão mínima: catálogo → API — 🟡

**Objetivo:** entregar o gesto principal sem outbox sofisticada.

Entram: pacote, manifest, popup de conexão/ativação, injeção, observer, botão, parser de card, chamada ao service worker e estados básicos. Testar `/ofertas`, busca e categoria com fixtures reais recentes.

Aceite: ativar não envia nada; scroll infinito recebe botões; clicar um card gera exatamente um POST; card incompleto usa fallback; o bundle não contém segredo/config ML; permissões batem com o manifesto documentado.

**Registro de implementação — 26/08/2026 (🟡 aguardando conferência):**

- Novo pacote `packages/extension` (MV3, TypeScript sem framework de UI, esbuild). Manifesto com `activeTab`/`scripting`/`storage`/`alarms`, `host_permissions` só para a API BizuMiner, sem content script permanente, CSP sem código remoto — verificado por `scripts/verify-manifest.mjs` (8/8 PASS).
- `src/lib/contracts.ts` (tipos + `newRequestId` + `pageKindFor`), `src/lib/api.ts` (POST captura + exchange), `src/lib/storage.ts` (chrome.storage.local), `src/lib/outbox.ts` (fila pura, esqueleto completo para E6).
- `src/content/card-extractor.ts` (puro, HTML→card, href real + aria-label, ignora "Antes" como preço atual), `bizu-button.ts` (Shadow DOM, único gatilho de envio no clique), `catalog-observer.ts` (MutationObserver), `activate-catalog.ts` (entrada injetada).
- `src/background/service-worker.ts` (CAPTURE/PAIR/LOGOUT, POST imediato, 401/403→reconexão, falha→outbox), popup (conexão + ativar).
- Testes 13/13 (card-extractor 5, outbox 6, contracts 2); typecheck limpo; build limpo (dist/); verify:manifest PASS.
- **Design (frontend-autoral, degrau 5 do dono):** âncora "confiança de garimpo"; botão-pílula ácido `#dfff70`/tinta `#151515`, popup em papel `#f3f0e8` — mesma identidade da vitrine. Manifesto visual + wireframe registrados abaixo; sujeito ao veredito do dono.
- **Bloqueio externo:** teste em Chrome real (unpacked) e registro na Chrome Web Store são do dono (E8).

**Manifesto visual da extensão (frontend-autoral, E5):**

- **Âncora emocional:** confiança de garimpo — cada clique é uma decisão sua, sem mágica.
- **Paleta:** herda a identidade BizuMiner — papel `#f3f0e8`, tinta `#151515`, azul `#2563eb`, ácido `#dfff70`. Botão-pílula ácido sobre tinta; estado "✓ Adicionado" em azul; erro em `#a52a24`.
- **Tipografia:** system-ui (a injeção vive na página do ML; nada de fonte externa).
- **Tom:** Shadow DOM isola o botão do CSS do ML; sem sombra pesada, só uma pílula clara.
- **Elemento surpresa:** o estado "✓ Adicionado" vira um convite a abrir o link copiado (E6) — a recompensa do gesto, não um selo de desconto.
- **O que não é:** não é um selo de "menor preço"; não promete desconto verificado; não é um painel de curadoria dentro do ML.

**Wireframe ASCII (popup + botão no card):**

```text
┌─ popup (300px) ──────────────┐
│ ◆ BizuMiner                   │
│ ● conectado como BizuMiner…   │
│ [ Ativar nesta página ]       │
│ (— se desconectado —)         │
│   "Gere o código no painel"   │
│   [  CÓDIGO  ] [ Conectar ]   │
│                       [ Sair ]│
└───────────────────────────────┘

┌─ card do ML (canto sup. direito) ─┐
│  [imagem do produto]               │
│  [ Adicionar ao BizuMiner ]  ←pílula ácido, aparece só após "Ativar"
│  título · preço · desconto         │
└────────────────────────────────────┘
```

### E6 — Resiliência e acabamento de UX — 🟡

**Objetivo:** tornar captura confiável em rede imperfeita.

Entram: outbox, backoff, alarmes, cache de estados, retry/reconexão, contador de pendências e copiar/abrir link devolvido. Limites de armazenamento e expiração são testados.

Aceite: simulação offline → online persiste uma única observação; 400 não faz loop; 401 pausa; 429 respeita servidor; reload do service worker preserva fila.

**Registro de implementação — 26/08/2026 (🟡 aguardando conferência):**

- Outbox pura (`src/lib/outbox.ts`) já nasceu em E5 e está testada (6 testes: preserva requestId, backoff 5s/30s/2min/10min, TTL 7d, teto 200, dueForRetry).
- Service worker ganhou `chrome.alarms` (retry a cada 1 min), `processDueOutbox()` (200→dequeue; 401/403→limpa sessão e esvazia; 400→dequeue; rede/5xx/429→markRetry) e badge com contador de pendências.
- Popup mostra contador de pendências; botão do card ganhou estado "Salvo — envio pendente" e copia o link devolvido (clipboard) no sucesso.
- Verificação local: 13/13 testes, typecheck limpo, build limpo, verify:manifest PASS. Degrau 3 (offline→online real no Chrome) é externo (E8).

### E7 — Gestão e revogação — 🟡

**Objetivo:** o afiliado e o dono enxergarem e controlarem instalações.

Entram: painel de dispositivos (nome, prefixo, versão quando disponível, último uso, status), renomear/revogar, métricas por afiliado sem token bruto e auditoria mínima. Admin não pode editar tag de outro afiliado por ID forjado.

Aceite: revogação interrompe captura no próximo request; lista está escopada; logs contêm `requestId`, `deviceId`, `affiliateId` e resultado, nunca credenciais.

**Registro de implementação — 26/08/2026 (🟡 aguardando conferência; migration aplicada em 26/08 e verificada):**

- `lib/extension-admin.ts`: `listDevices` (nome, `token_prefix`, datas, status — nunca token/hash), `revokeDevice`/`renameDevice` (escopados a `affiliate_id`, não agem por ID forjado), `affiliateMetrics` (publicações/cliques 7d/dispositivos).
- Rota `GET|POST /api/admin/extension/devices` (admin-only). Painel `app/admin/devices.tsx`: lista, revogar, e geração de código de pareamento (fecha o loop com E4).
- Verificação local: typecheck limpo, web 102/102, build limpo. Degrau 4 (revogação interrompe o request no banco) pendente de aplicação de E1–E4.

### E8 — Verificação ponta a ponta e distribuição — 🟡

**Objetivo:** provar o fluxo real e preparar publicação sem ampliar permissões.

Entram: build reproduzível, ZIP versionado por release, checklist Chrome Web Store, política de privacidade, screenshots, teste em Chrome real e relatório derivado do banco. Registro na loja depende do dono e não bloqueia teste unpacked.

Aceite real: afiliado A e B conectam dispositivos, capturam o mesmo anúncio no catálogo, banco mostra isolamento/idempotência, URLs abrem e `/go` gera tags diferentes. Compra/comissão real continua um degrau separado de validação externa.

**Registro de implementação — 26/08/2026 (🟡 aguardando conferência; execução real é externa):**

- `scripts/package.mjs`: release reproduzível `release/bizuminer-extension-v0.1.0/` com `RELEASE.txt` (hashes SHA-256 por arquivo, derivados por máquina). Rodado: 6 arquivos + RELEASE.txt.
- `PRIVACY.md` (política de privacidade) e `CHROME_WEB_STORE.md` (checklist) criados — exigidos pela loja.
- `bin/verify-extension-e2e.ts` (persistence): relatório derivado do banco (idempotência, isolamento por tenant, publicação-na-captura, amostra de requestId/deviceId/affiliateId/productId/observationId/publicationId/slug). `npm run verify:extension-e2e`.
- **Externo (não bloqueia unpacked):** teste em Chrome real, screenshots, conta de dev da Chrome Web Store, aplicar E1–E4, `EXTENSION_ALLOWED_ORIGINS` + `EXTENSION_CAPTURE_ENABLED`.

## Estado final do plano (26/08/2026)

E0–E8 implementados localmente, todos 🟡 aguardando conferência. As migrations de E1–E4 (`20260826010000`…`20260826050000`) **foram aplicadas em 26/08 via MCP (autorização do dono) e verificadas** por `verify:affiliates` + `verify:tenant-isolation` + `verify:extension-e2e` (todos PASS). A migration de RLS (`20260826030000`) segue GATED, para aplicar depois. Nenhum commit/deploy/publicação realizado.

---

## 10. Mapa de impactos

| Se mexer em | Afeta | Atenção obrigatória |
|---|---|---|
| `tenant_id`/helper de DB | todas as consultas web e persistence | migração gradual pode vazar ou bloquear a casa; teste A/B |
| `publication.slug` | vitrine, PDP, OG, composer, área do cliente, `/go` | compatibilidade de links antigos e geração de metadados |
| `affiliateLink()` | comissão de todo clique | sem fallback global; config suspensa falha fechada |
| `app_user`/auth merge | comprador e afiliado dono | membership separada; não usar `user_metadata` para autorização |
| `price_observation` | histórico e selos | idempotência; manual não vira histórico contínuo |
| parser de card | captura, título, preço e URL | fixture real e caso sabotado para cada fallback |
| service worker/outbox | duplicação e percepção de sucesso | preservar `requestId`; nunca mostrar sucesso antes do 200 |
| CORS/origens | pareamento e captura | sem `*`; separar dev/prod; token continua sendo a autenticação |
| migrations/grants/RLS | todo runtime | aplicar e verificar no banco; índices em FKs e políticas |
| bookmarklet legado | dono atual | não quebrar antes do rollout; remover token global ao final |

---

## 11. Verificação por entrega

Comandos-base existentes:

```text
cd packages/capture     && npm test && npm run typecheck
cd packages/persistence && npm test && npm run typecheck
cd packages/web         && npm test && npm run typecheck && npm run build
```

O pacote da extensão deve nascer com `npm test`, `npm run typecheck`, `npm run build` e `npm run verify:manifest`.

Para schema:

1. conferir versão e ajuda da Supabase CLI antes de usar comandos;
2. verificar changelog/docs Supabase atuais relevantes a migrations, RLS e Auth;
3. criar migration pelo fluxo real do projeto;
4. aplicar no alvo explicitamente confirmado;
5. rodar query derivada de colunas, constraints, índices, policies e grants;
6. rodar verificador A/B e idempotência contra o banco real;
7. rodar advisors quando a versão permitir;
8. emitir pedido de conferência total para E0–E4 e parcial para E5–E8, salvo achado de risco.

O relatório de E8 deve ser gerado por script a partir de `requestId`, `deviceId`, `affiliateId`, `productId`, `observationId`, `publicationId` e slug reais. Não montar evidência manualmente.

---

## 12. Rollout, flags e rollback

Variáveis server-only previstas:

- `ML_AUTOMATED_CAPTURE_ENABLED=false` por default;
- `EXTENSION_CAPTURE_ENABLED=false` até E4;
- `AFFILIATE_LINKS_V2_ENABLED=false` até o bootstrap/config da casa;
- `EXTENSION_ALLOWED_ORIGINS` com lista explícita;
- `EXTENSION_TOKEN_PEPPER` somente se o desenho final optar por HMAC além da alta entropia do token.

Nenhuma delas começa com `NEXT_PUBLIC_`.

Rollout:

1. E0 contém legado;
2. E1–E3 migram a casa sem mudar URLs antigas;
3. E4 habilita dispositivo apenas para o dono;
4. E5–E6 usam extensão unpacked;
5. E7 libera primeiro afiliado piloto;
6. E8 libera lote pequeno e só depois Chrome Web Store.

Rollback preserva dados: flags desligam novas bordas; tokens são revogados; migrations aditivas não apagam tabelas/colunas; slugs legados permanecem. Não reverter schema com deleção automática.

---

## 13. Riscos e decisões externas

| Risco/decisão | Tratamento |
|---|---|
| Interpretação dos termos do ML | Manter gesto explícito e zero requisição automatizada pelo BizuMiner; revisão jurídica continua externa. |
| DOM do ML mudar | seletores centralizados, fixtures reais, erro visível e fallback PDP; nunca “capturar vazio” em silêncio |
| Extension ID mudar em dev | origem de desenvolvimento configurada separadamente; produção aceita somente ID publicado |
| Token roubado | privilégio limitado a captura daquele afiliado, hash no banco, rate limit, revogação e logs sem valor bruto |
| RLS quebrar runtime | entrega própria E2, flag, teste A/B e conferência antes de afiliado externo |
| Link antigo quebrar | backfill e testes de compatibilidade com slugs reais existentes |
| Chrome Web Store atrasar | distribuição unpacked para piloto; registro é tarefa do dono |
| Assinatura/preço em aberto | não entra no contrato técnico de identidade/captura |

---

## 14. Protocolo para a sessão implementadora

1. Ler o documento mestre, `plano-afiliados.md`, este plano e o handoff.
2. Inspecionar o working tree e preservar alterações existentes.
3. Executar **uma entrega por vez**, na ordem E0 → E8.
4. Dentro da entrega: contrato/migration → núcleo → borda → interface → testes.
5. Não começar a próxima entrega enquanto a atual não tiver veredito de conferência.
6. Ao terminar, atualizar o status para 🟡, registrar achados no mestre e emitir `PEDIDO DE CONFERÊNCIA` com afirmações falsificáveis.
7. Somente outra sessão/conferente pode promover para ✅.
8. Não fazer commit, push, deploy, rotação ou migration remota sem a autorização correspondente do dono.

---

## 15. Definição de concluído do plano

O plano inteiro só fica ✅ quando:

- automação de acesso ao ML está fora do caminho de produção;
- identidade, tenant e link por afiliado foram provados com duas contas;
- token global de captura foi aposentado;
- extensão catalog-first funciona em Chrome real com outbox/idempotência;
- dispositivos são revogáveis e auditáveis;
- o mesmo anúncio gera comissão atribuída a cada afiliado correto;
- migrations estão aplicadas/verificadas, testes/builds passam e cada entrega recebeu conferência;
- o documento mestre descreve exatamente o estado observado, sem antecipar a intenção.
