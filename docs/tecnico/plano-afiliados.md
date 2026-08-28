# Plano — Camada de Afiliados

**Criado em 25/08/2026.** Como o BizuMiner deixa de ser "quem vende" e passa a ser "quem dá a estrutura para outros afiliados venderem" — um gerenciador de afiliados, não mais só um site B2C.

**Detalhamento executável da Frente D e de suas fundações:** [`plano-extensao-captura.md`](./plano-extensao-captura.md). Aquele documento fecha identidade, contratos de banco/API, extensão catalog-first e sequência E0–E8.

Status: ✅ feito e conferido · 🟡 parcial · ⬜ não iniciado

---

## 1. Diagnóstico estratégico

A visão do dono, registrada em 25/08/2026: **o BizuMiner começa como vitrine B2C (comissão da casa) para validar a estrutura, e evolui para uma plataforma onde vários afiliados assinam e vendem com a própria tag.** O negócio "diminui como vendedor de produtos e sobe como gerenciador de afiliados".

Isto **reabre** uma decisão que o documento mestre listava como "não se reabre sem o dono" (§6, "Modelo: B2C, comissão da casa, vocês são o único canal de distribuição"). Reaberta agora, pelo dono. A mudança de rumo precisa constar no mestre — não como acréscimo silencioso, mas como retratação registrada.

**O fato técnico que governa tudo:** cada afiliado precisa da **própria conta de afiliado no Mercado Livre** (próprio `matt_word`/`matt_tool`) para receber a própria comissão. O `matt_word` do dono não pode ser dado a terceiros — senão a comissão cai na conta errada. Hoje o link é gerado com credencial **global** do `.env` (`ML_TRACKING_ID`/`ML_TOOL_ID` em `lib/db.ts`). No modelo multi-afiliado, o link nasce **por afiliado, no momento do clique**, com a credencial de quem compartilhou.

**Decisões desta versão (do dono, 25/08/2026):**

| Decisão | Valor |
|---|---|
| Catálogo | **Por afiliado** (cada afiliado tem o seu; o produto capturado por um não aparece na vitrine do outro) |
| Cobrança | **Assinatura fixa — ainda não definida.** Deixar em aberto no plano; nenhuma entrega depende de fechar isso |
| Escopo do dono | Validação B2C continua enquanto o modelo multi-afiliado amadurece (as duas coisas coexistem) |

**O que já existe (fato, verificado no código em 25/08/2026):**

- `tenant_id` está em **todas** as 10 tabelas de negócio, valendo `"local"`. É pass-through, não capacidade: todas as funções do web já recebem `tenantId = "local"` como parâmetro.
- Auth real (Supabase Auth + Google OAuth), `app_user.auth_user_id` vinculado, `isAdmin` por e-mail.
- **Não existe** tabela `affiliate_credential` — é só um comentário em `oauth.ts`. Não há cadastro de tag de terceiros em lugar nenhum.
- `app_user` é o **comprador** (não o afiliado): `id`, `tenant_id`, `auth_user_id`, `display_name`, `email`, timestamps. Sem `tracking_id`/`tool_id`/papel.
- `publication` (slug `ml-<external_id>`, `channel='web'`) e `click_event` (IP hashado) existem, mas **sem** atribuição por afiliado/`via`.

---

## 2. Regras de integração (invariantes — derivadas das cicatrizes do projeto)

| Regra | Invariante | Origem |
|---|---|---|
| **R1** | **Não fingir multi-tenant antes de existir.** O `tenant_id` é coluna, não capacidade; só vira capacidade quando houver cadastro de credencial por afiliado. Documento/código não pode afirmar "é multi-tenant" enquanto for `"local"` fixo. | cicatriz "documentos descreviam um produto que não é" |
| **R2** | **Configuração de atribuição é autoritativa no servidor.** `tracking_id`/`tool_id` aparecem no link final e não são senha como `DATABASE_URL`, mas a extensão nunca os escolhe nem os recebe como configuração. O link é mintado no servidor; segredos OAuth futuros ficam cifrados e separados. | o client não pode escolher para quem cai a comissão |
| **R3** | **A comissão é de quem compartilhou.** O `matt_word` usado no clique é sempre o do afiliado que gerou aquela publicação. Nunca o do dono como fallback silencioso. | invariante de negócio — o modelo inteiro depende disso |
| **R4** | **Migration versionada não é migration aplicada.** Toda tabela nova nasce com migration aplicada e verificada contra o banco real (contagem de linhas/colunas). | cicatriz "`subscriber` existia só como arquivo" |
| **R5** | **Identidade primeiro.** Sem o cadastro de afiliado (passo 1), nenhum dos passos seguintes tem onde se apoiar. Nada de link por afiliado antes do afiliado existir. | sequenciamento, não gosto |

---

## 3. O que explicitamente NÃO entra

| Item descartado | Por quê |
|---|---|
| Catálogo **compartilhado** entre afiliados | decidido "por afiliado" em 25/08 — rejeitar para não reabrir seis meses depois |
| Afiliado usando o `ML_TRACKING_ID` do dono | R3 — comissão cairia na conta errada; é o erro fatal do modelo |
| Extensão antes da identidade/link por afiliado | entra como casca de distribuição (passo 4), depois das fundações; cedo demais vira shell sem lastro |
| Automação de WhatsApp | decisão antiga, segue valendo — nada muda aqui |
| Métricas de comissão real (leitura do painel do ML) | depende de cada afiliado expor o próprio relatório; não é pré-requisito do cadastro |

---

## 4. As frentes de trabalho

### Frente A — Identidade por afiliado

- **O quê:** cadastro de afiliado com `tracking_id` + `tool_id` próprios (e papel). É o pré-requisito de tudo.
- **Por quê:** sem afiliado não há multi-afiliado; sem credencial própria, a comissão cai no lugar errado (R3).
- **De onde vem:** nada existe hoje; `app_user` é o comprador. **Decisão fechada no plano detalhado:** preservar `app_user` como pessoa e criar `affiliate_account`, `affiliate_membership` e `affiliate_marketplace_config`.
- **Onde entra:** schema `garimpa` + migrations + `lib/` de acesso.
- **Critério de aceite:** criar afiliado com credencial, conferir que a linha existe no banco real e que a credencial **não** aparece em nenhum payload de client.

### Frente B — Link por afiliado

- **O quê:** `affiliateLink()` deixa de ler o env global e passa a mintar com a credencial do afiliado dono da publicação.
- **Por quê:** R3. É a mudança que transforma o produto de "um dono vendendo" em "gerenciador".
- **De onde vem:** `lib/db.ts` (função `affiliateLink` hoje global) + `app/go/[slug]/route.ts` (quem chama).
- **Onde entra:** `lib/db.ts`, `go` route, `publication` (precisa saber a qual afiliado pertence).
- **Critério de aceite:** dois afiliados distintos geram dois `matt_word` distintos no mesmo produto; nenhum caminho cai no `ML_TRACKING_ID` global.

### Frente C — Gestão de afiliados (painel do dono)

- **O quê:** onboard, status, métricas por afiliado.
- **Por quê:** é o "gerenciador" da visão — sem isso o dono não administra quem ele trouxe.
- **De onde vem:** painel do dono (`/admin`) já tem telemetria; estender para a dimensão afiliado.
- **Onde entra:** `app/admin/*`, `lib/admin-db.ts`.
- **Critério de aceite:** lista de afiliados com status e número de cliques/publicações de cada um.

### Frente D — Distribuição (extensão / bookmarklet por afiliado)

- **O quê:** a extensão de navegador (ou bookmarklet por afiliado) como canal de adoção.
- **Por quê:** para o afiliado leigo, instalar da Chrome Store é 1 clique; copiar código no favorito é barreira. E o botão "Compartilhar no BizuMiner" dentro do ML é o gatilho natural.
- **De onde vem:** o bookmarklet de captura já existe (25/08); a extensão é a casca sobre a mesma captura + mintagem por afiliado (B).
- **Onde entra:** novo pacote/pasta de extensão (Chrome MV3) + autenticação do afiliado dentro dela.
- **Critério de aceite:** um afiliado logado captura um produto e o link gerado carrega a **dele** tag (não a do dono).
- **Plano executável:** [`plano-extensao-captura.md`](./plano-extensao-captura.md), com botão no card do catálogo, token por dispositivo, outbox temporária e POST direto na API BizuMiner.

---

## 5. Sequenciamento

Dependências duras, na ordem. O que depende do dono está separado do autônomo para não travar.

| Passo | Frente | Depende de | Depende do dono? |
|---|---|---|---|
| 1 | A — identidade | nada | **decidido:** tabelas próprias; falta implementar e conferir |
| 2 | B — link por afiliado | A | nada |
| 3 | C — gestão | A, B | definir o que aparece no painel (gosto) |
| 4 | D — distribuição | A, B | aprovar UX da extensão; **registrar na Chrome Web Store** |

**Pendência que não trava nada, mas fica em aberto:** o modelo de cobrança (assinatura fixa) ainda não foi definido pelo dono. Nenhuma frente acima depende dele. Fechar depois.

---

## 6. Protocolo de trabalho

- **O dono decide (irredutivelmente dele):** modelo de cobrança, acabamento do painel de gestão e publicação/registro da extensão.
- **O plano já decidiu:** tabelas próprias de afiliado; catálogo por afiliado; configuração de atribuição no servidor; identidade antes de link; extensão só depois das fundações.
- **Uma entrega fechada por vez**, cada uma com pedido de conferência ao fim (regra do projeto).

---

## 7. Como construir

**Regras operacionais:**
- **RC1:** campo novo nasce com `tenant_id` e com default coerente (o padrão já existente).
- **RC2:** a credencial do afiliado nunca é lida de `process.env` global no caminho do clique — sempre do afiliado resolvido na request.
- **RC3:** toda função de web que hoje recebe `tenantId = "local"` continua assim até a Frente A existir; a troca de `"local"` para o id do afiliado é feita na Frente B, não antes (R1).
- **RC4:** nenhum afiliado externo entra antes de constraints de tenant, teste A/B e RLS/contexto de tenant serem conferidos.

**Mapa de impactos (derivado do código real):**

| Se mexer em | Afeta | Atenção a |
|---|---|---|
| `lib/db.ts` `affiliateLink` | `/go/[slug]` e todo clique afiliado | é o coração da comissão — R3, sem fallback pro global |
| `publication` (novo campo de afiliado) | `click_event`, telemetria, `/go` | slug continua determinístico; não quebrar `on conflict (slug)` |
| `app_user` | área do comprador, merge de auth | separar comprador de afiliado sem reaproveitar colunas com sentido errado |
| schema novo | `verify-*.ts` | R4 — migration aplicada e verificada |

**Escada de verificação (a deste projeto):**
1. typecheck + testes unitários — obrigatório para tudo
2. conferência contra o banco real (contagem de linhas/colunas via `verify-*.ts` ou SQL) — obrigatório para schema e link
3. dois afiliados distintos geram `matt_word` distintos — obrigatório para a Frente B
4. clique real no painel do ML — para confirmar comissão por afiliado (quando houver dado)
5. julgamento do dono — modelo de cobrança, UX do painel, estética da extensão

---

## 8. Como um implementador usa este documento

1. Lê o mestre (§1 e §6 — já atualizados com a mudança de rumo) e este plano.
2. Pega **um** passo da sequência (§5), na ordem, e confirma com o dono o item que for dele.
3. Implementa na ordem: contrato/tipos → núcleo → borda → interface → testes.
4. Verifica na escada (§7), registra no histórico do mestre e aqui, e emite o pedido de conferência.
5. Só marca ✅ após o veredito.

---

## Registro de decisão — 25/08/2026

- **Retratação registrada:** a seção 6 do mestre dizia "B2C, comissão da casa, vocês são o único canal". Reaberta pelo dono: o produto evolui para gerenciador de afiliados. Catálogo **por afiliado**. Cobrança por assinatura fixa **em aberto** (não definida).
- **Levantamento feito antes deste plano** (passo 2 pedido pelo dono): o que existe de suporte a multi-tenant é `tenant_id` pass-through + auth; não existe credencial por afiliado; `app_user` é comprador. Resumo completo no histórico desta sessão e na seção 1 deste plano.
- **Extensão de navegador:** reclassificada de "não justifica pelo volume" (decisão de 24/08) para **Frente D do roteiro** — entra como casca de distribuição depois da identidade, não como primeiro passo.
- **Plano detalhado aprovado para implementação:** identidade em tabelas próprias, publicação por afiliado, token revogável por dispositivo, persistência server-side e UX catalog-first. Execução em `plano-extensao-captura.md`; handoff em `handoff-extensao-captura-terra.md`.
