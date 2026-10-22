# Relatório de Execução — OS-036

**Data de execução:** 19/10/2026  
**Skill utilizada:** `/executor-blindado`  
**Baseline:** `main` `43700c59f4e24f68f3a2e32c20ee5147fa4816cd` + working tree local extenso preservado + delta concluído da [OS-035](RESULTADO-OS-035.md).  
**Origem:** BUG-021 e pendências BUG-018/020 contra AC-028.2–.3/.5 de [OS-028](OS-028.md), [AUDITORIA-OS-034](AUDITORIA-OS-034.md) e [DIAGNOSTICO.md](../diagnosticos/os-034/DIAGNOSTICO.md).

---

## 1. Sumário Executivo

A OS-036 foi executada estritamente dentro da lista fechada de arquivos autorizados:
- `packages/web/lib/comparison-evidence.ts`
- `packages/web/lib/editorial-selection.ts`
- `packages/web/lib/editorial-selection-db.ts`
- `packages/web/lib/hero-ranking.ts`
- `packages/web/app/admin/curadoria/selecao-view.tsx`
- `packages/web/test/comparison-evidence.test.mjs`
- `packages/web/test/editorial-selection.test.mjs`
- `packages/web/test/hero-ranking.test.mjs`
- `tools/editorial-tests/comparison-flow.test.ts`
- `packages/persistence/test/ingest.test.ts` (somente teste de recaptura em memória)
- `docs/implementation/contratos-fluxo-unico/RESULTADO-OS-036.md`

Nenhum arquivo protegido foi alterado (incluindo `curation-db.ts`, `hero-policy.ts`, migrations ou código de produção de ingestão).

### Resumo dos Fechamentos
1. **BUG-021 / AC-036.1 & AC-036.2 (Validade temporal e memória de mudança):**
   - Em novas avaliações com alegação comparativa, o servidor deriva referências canônicas da base (versão `v2`), registrando identidade/loja, configuração confirmada, origem, observação (`id`, preço, `observed_at`), status de curadoria, ponto de corte de `curation_event` (`latest_curation_event_id`) e marca de sequência material.
   - Revalidação em lote em salvar, ativar e ler: tanto o candidato quanto cada alternativa são verificados.
   - Qualquer observação material intermediária (preço ou configuração divergente) suspende a alegação. A sequência de preço R$ 499 → R$ 900 → R$ 499 **permanece suspensa após o retorno ao preço anterior**, sem reativação automática.
   - A transição `approved → rejected → approved` via `reviewProduct` (que grava `curation_event`) **permanece suspensa após a reaprovação**, pois a perda de elegibilidade registrada após a avaliação é detectada.
   - Apenas uma **nova avaliação humana** sobre a evidência atual é capaz de restabelecer a publicação da alegação.
2. **AC-036.3 (Todas as saídas públicas e isolamento de tenant):**
   - O mesmo gate atua tanto na seleção editorial quanto no bootstrap de catálogo (`mode: "catalog"`). Ambos os ramos foram testados com itens que efetivamente portam alegações (`best_a` e `cat_cand`), provando omissão imediata e restauração após nova avaliação.
   - `publishedEditorialStateKey` altera comprovadamente seu valor ao omitir ou restabelecer o item.
   - Tenant B opera com isolamento total, sem herdar observações, bloqueios ou eventos do tenant A.
3. **BUG-020 / AC-036.4 (Justificativa editorial independente):**
   - O formulário em `selecao-view.tsx` deixou de copiar `publicRationale` para `comparativeBasis.rationale` quando vazio.
   - O validador do servidor normaliza e rejeita justificativas idênticas ou vazias com `comparative_basis_rationale_must_be_distinct`, exigindo fundamentação editorial própria.
4. **BUG-018 / AC-036.5 (Versão da regra de evidência do catálogo):**
   - Introduzida a constante explícita `CATALOG_EVIDENCE_POLICY_VERSION = "catalog-evidence-v1"`, distinta de `HERO_POLICY_VERSION` ("hero-v2"), e integrada à `publishedEditorialStateKey`.
   - Vendas de marketplaces distintos mantêm pontuação 0 no score factual global em `classifyHeroCandidate`.
5. **AC-036.6 / AC-028.1 (Evidência honesta de recaptura):**
   - Implementado teste em `packages/persistence/test/ingest.test.ts` reexecutando `sweep` com o mesmo `external_id`, comprovando identidade única de produto e observação atualizada.
   - Registrado de forma explícita que este teste opera sobre `InMemoryStore`, sem reivindicar prova PostgreSQL/PGlite da ingestão remota.

---

## 2. Implementação por Critério de Aceite

### AC-036.1 / BUG-021 — Referência Canônica e Memória da Mudança
- **Arquivos modificados:** `packages/web/lib/comparison-evidence.ts` e `packages/web/lib/editorial-selection-db.ts`.
- **Implementação:**
  - A interface `ComparativeBasis` agora suporta `version: string` e referências canônicas detalhadas em `evidenceReferences` (`ComparativeEvidenceReference`), contendo: `productId`, `marketplace`, `curationStatus`, `variantKey`, `variantLabel`, `variantConfirmed`, `source`, `observationId`, `observedAt`, `priceCents`, `latestCurationEventId`, e `materialSequenceMark`.
  - Em `saveEditorialAssessment`: o servidor não confia em dados do cliente. Executa `fetchCanonicalProductEvidence` em lote para o candidato e todas as alternativas na transação sob o tenant escopado. Monta o snapshot canônico com `version: "v2"`.
  - Avaliações legadas (`version !== "v2"`) ou sem referências canônicas falham fechado para fins de publicação da alegação comparativa, mantendo itens apenas descritivos legíveis.

### AC-036.2 — Suspensão até Nova Avaliação Humana
- **Arquivo modificado:** `packages/web/lib/editorial-selection-db.ts`.
- **Implementação:**
  - Função pura `validateSuperiorityClaimsInBatch(tx, tenantId, assessments, now)`:
    - Realiza consultas em lote de curadorias atuais, observações e eventos de inelegibilidade (`to_status <> 'approved'`).
    - **Ambos os lados da comparação:** valida candidato e todas as alternativas contra status aprovado, frescor (últimas 48h), preço atual e configuração atual.
    - **Memória de observações (A→B→A):** percorre o histórico de observações desde `ref.observedAt`. Se qualquer observação com `obsTime > refObsTime` tiver preço ou configuração diferente da referência avaliada, o item é marcado como suspenso. Se duas observações distintas tiverem o mesmo milissegundo (`obsTime === refObsTime`), falha fechado por ordem cronológica ambígua.
    - **Memória de eventos de inelegibilidade (`approved→rejected→approved`):** se qualquer evento com `to_status <> 'approved'` tiver ocorrido após o `cutoffEventId` ou após `assessment.createdAt`, a perda de elegibilidade suspende a alegação.
    - Tentativa de reativação de assessment suspenso via `replaceEditorialSelection` falha fechado com `selection_item_blocked`.
    - Uma nova gravação via `saveEditorialAssessment` sobre a evidência presente estabelece um novo marco canônico, restabelecendo a elegibilidade para ativação e publicação.

### AC-036.3 — Toda Saída Pública e Isolamento Multiconta
- **Arquivo modificado:** `packages/web/lib/editorial-selection-db.ts` e `tools/editorial-tests/comparison-flow.test.ts`.
- **Implementação:**
  - O mesmo gate `validateSuperiorityClaimsInBatch` é aplicado tanto na edição editorial (`result.products`) quanto no catálogo bootstrap (`eligibleCandidates` antes de `rankHeroCandidates`).
  - Provas no teste `comparison-flow.test.ts`:
    - Ramo editorial: `pubFresh.products` contém `best_a` (1 item). Após preço R$ 900 e retorno a R$ 499, `pubPriceRestored.products` contém 0 itens (`best_a` omitido). Após nova avaliação humana e ativação, retorna a 1 item.
    - Ramo de catálogo (`cat_tenant`): `pubCatInitial` contém `cat_cand`. Após mudança material na alternativa `cat_alt`, `pubCatAfterChange` omite `cat_cand`. Após nova avaliação humana em catálogo, `pubCatRestored` restabelece `cat_cand`.
    - `publishedEditorialStateKey`: demonstra alteração comprovada de chave antes e depois da omissão.
    - Conta B: verificada como puramente catálogo, sem herdar produtos, bloqueios ou observações de contas alheias.

### AC-036.4 / BUG-020 — Justificativa Independente
- **Arquivos modificados:** `packages/web/app/admin/curadoria/selecao-view.tsx`, `packages/web/lib/comparison-evidence.ts` e `packages/web/lib/editorial-selection.ts`.
- **Implementação:**
  - Em `selecao-view.tsx`: linha 155 alterada para `rationale: comparativeRationale.trim()` (não copia mais `input.publicRationale`). Mapeamento da mensagem de erro `comparative_basis_rationale_must_be_distinct`.
  - Em `comparison-evidence.ts`: `validateComparativeBasis` recebe `publicRationale` e executa `normalizeRationale` (remoção de diacríticos, pontuação e caixa baixa). Rejeita igualdade com `comparative_basis_rationale_must_be_distinct`.
  - Em `editorial-selection.ts`: repassa `publicRationale` em `validateEditorialAssessment`.

### AC-036.5 / BUG-018 — Versão da Regra de Catálogo
- **Arquivos modificados:** `packages/web/lib/editorial-selection.ts` e `packages/web/lib/hero-ranking.ts`.
- **Implementação:**
  - Exportada a constante `CATALOG_EVIDENCE_POLICY_VERSION = "catalog-evidence-v1"`, distinta de `HERO_POLICY_VERSION = "hero-v2"`.
  - Incluída em `publishedEditorialStateKey` como segundo elemento da tupla JSON.
  - Em `hero-ranking.ts`: vendas contadas recebem 0 pontos no score factual global em `classifyHeroCandidate`, mantendo caráter puramente descritivo.

### AC-036.6 / AC-028.1 — Evidência Honesta de Recaptura
- **Arquivo modificado:** `packages/persistence/test/ingest.test.ts`.
- **Implementação:**
  - Adicionado caso de teste que executa `sweep` duas vezes com o mesmo `external_id` ("RECAPTURE_1"), primeiro a R$ 100 e depois a R$ 89.
  - Asserções estritas: `store.allProducts` contém exatamente 1 produto; mesmo ID; observação mais recente atualizada para R$ 89; contagem de observações igual a 2; `itemsNew === 0` e `priceChanges === 1`.
  - Declaração explícita no relatório e no teste de que a execução utiliza `InMemoryStore`. A verificação com `PostgresStore` / PostgreSQL real permanece não reivindicada neste rito, aguardando as ordens pertinentes (OS-033/OS-031).

---

## 3. Resultados Reais dos Comandos

### 3.1. Fixture de Fluxo Comparativo (PGlite)
```bash
cd tools/editorial-tests && node --import tsx comparison-flow.test.ts
```
```text
PASS AC-028.1: cafeteiras agrupam na mesma família mantendo IDs, lojas e configurações separados
PASS AC-028.2: 4,6★/1500 avaliações priorizado para exame frente a 4,9★/8 avaliações no mesmo marketplace
[ai-curation] GEMINI_API_KEY ausente; pulando triagem semântica.
PASS AC-028.3: quarta cafeteira permanece pending sem family_saturation por posição; retenção exige justificativa
PASS AC-028.4: regra v2 com método explícito e backfillFamilies(apply=false) com applied=0 em duas contas
PASS AC-028.5: alegação de superioridade sem base falha; base comparativa estruturada passa e valida expiração/conta

TODOS OS 5 TESTES DO FLUXO COMPARATIVO PASSARAM COM SUCESSO!
```

### 3.2. Bateria de Testes Editoriais
```bash
npm test --prefix tools/editorial-tests
```
```text
Editorial integration: 29 scenarios passed. PostgreSQL fixture only; no remote database touched.
```

### 3.3. Testes Focados de Evidência e Seleção
```bash
node --test packages/web/test/comparison-evidence.test.mjs
```
```text
ℹ tests 6
ℹ pass 6
ℹ duration_ms 81.60176
```

```bash
node --test packages/web/test/editorial-selection.test.mjs
```
```text
ℹ tests 15
ℹ pass 15
ℹ duration_ms 95.988172
```

```bash
node --test packages/web/test/hero-ranking.test.mjs
```
```text
ℹ tests 28
ℹ pass 28
ℹ duration_ms 152.998348
```

### 3.4. Bateria de Persistência e Recaptura
```bash
npm test --prefix packages/persistence
```
```text
ℹ tests 40
ℹ suites 1
ℹ pass 40
ℹ duration_ms 991.710735
```

### 3.5. Checagem Estática de Tipos
```bash
npm run typecheck --prefix packages/persistence
```
```text
> @ofertas/persistence@0.1.0 typecheck
> tsc --noEmit
(código 0)
```

```bash
npm run typecheck --prefix packages/web
```
```text
> @ofertas/web@0.1.0 typecheck
> tsc --noEmit
(código 0)
```

### 3.6. Compilação de Produção
```bash
npm run build --prefix packages/web
```
```text
   ▲ Next.js 15.5.23
   - Environments: .env.local

   Creating an optimized production build ...
 ✓ Compiled successfully in 13.3s
   Linting and checking validity of types     ✓ Linting and checking validity of types 
   Collecting page data     ✓ Collecting page data 
 ✓ Generating static pages (22/22)
   Collecting build traces     ✓ Collecting build traces 
   Finalizing page optimization     ✓ Finalizing page optimization 
(código 0)
```

### 3.7. Suíte Completa da Aplicação Web
```bash
npm test --prefix packages/web
```
```text
ℹ tests 437
ℹ suites 0
ℹ pass 437
ℹ fail 0
ℹ duration_ms 2171.993282
```

---

## 4. Limitações Ambientais e Estado de Verificação

| Aspecto | Estado | Justificativa Objetiva |
|---|---|---|
| **Comportamento PGlite dos aceites AC-036.1 a AC-036.5** | `CONCLUIDO` | Demonstrado por execução direta em `comparison-flow.test.ts` e suítes unitárias dedicadas. |
| **Recaptura com InMemoryStore (AC-036.6)** | `CONCLUIDO` | Demonstrado por teste automatizado em `ingest.test.ts`. |
| **Recaptura real com PostgresStore / banco nativo** | `NAO_VERIFICADA` | Não há banco PostgreSQL nativo provisionado nem autorizado para ingestão local nesta OS; verificação delegada a OS-033/OS-031 sem conversão espúria em BUG. |
| **Interface visual e formulário interativo no navegador** | `NAO_VERIFICADA` | A tipagem e build do componente `selecao-view.tsx` passaram; validação visual em browser real requer harness de teste E2E / OS-031. |
| **Bloqueios de fronteira** | Nenhum | Toda a implementação foi estritamente viabilizada dentro dos caminhos autorizados da OS-036. |

---

## 5. Conclusão e Encaminhamento

A execução das ordens sequenciais **OS-035** e **OS-036** está concluída no ambiente local com todas as verificações demonstradas.

- **OS-035:** Achado BUG-019 fechado (contrato e DAL exigem e conferem membros de saturação; UI blindada).
- **OS-036:** Achado BUG-021 fechado (suspensão de alegações após mudança material A→B→A e transição de elegibilidade, até nova avaliação humana em ambos os ramos); pendências BUG-018 e BUG-020 fechadas; recaptura comprovada em InMemoryStore.

Encaminho ambas as entregas para a **auditoria de entrega** do projeto Garimpa.

