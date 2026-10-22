# Relatório de Execução — OS-035

**Data de execução:** 19/10/2026  
**Skill utilizada:** `/executor-blindado`  
**Baseline:** `main` `43700c59f4e24f68f3a2e32c20ee5147fa4816cd` + working tree local extenso preservado.  
**Origem:** BUG-019 / AC-028.3 de [OS-028](OS-028.md), [AUDITORIA-OS-034](AUDITORIA-OS-034.md) e [DIAGNOSTICO.md](../diagnosticos/os-034/DIAGNOSTICO.md).

---

## 1. Sumário Executivo

A OS-035 foi executada estritamente dentro da lista fechada de arquivos autorizados:
- `packages/web/lib/curation-contract.ts`
- `packages/web/lib/curation-db.ts`
- `packages/web/app/admin/curadoria/group-reviewer.tsx`
- `packages/web/test/curation-contract.test.mjs`
- `packages/web/test/curation-bulk-group.test.mjs`
- `tools/editorial-tests/comparison-flow.test.ts`
- `docs/implementation/contratos-fluxo-unico/RESULTADO-OS-035.md`

O achado **BUG-019** foi corrigido de ponta a ponta:
1. `validateGroupAction` agora exige estritamente a lista `expectedMemberProductIds` completa, válida, única e contendo todos os selecionados sempre que `retainRemainingAsSaturation: true`.
2. A UI em `group-reviewer.tsx` foi blindada para **nunca** substituir falha de leitura por `card.representatives`; na falha ou incompletude, impede a abertura e envio da confirmação, informando o erro ao operador.
3. `actOnGroup` no banco de dados verifica o conjunto antes de qualquer mutação: rejeita lista ausente, vazia ou divergente com `curation_group_members_changed`, sem modificar produtos ou eventos.
4. Cobertura completa implementada na fixture PGlite (`comparison-flow.test.ts`) e suítes unitárias.

---

## 2. Implementação por Critério de Aceite

### AC-035.1 / BUG-019 — Entrada Completa no Contrato
- **Arquivo modificado:** `packages/web/lib/curation-contract.ts` (linhas 276–320).
- **Antes:** Se `retainRemainingAsSaturation: true`, a justificativa era validada, mas `expectedMemberProductIds` era opcional e aceitava `null` ou ausência.
- **Depois:** Se `retainRemainingAsSaturation: true`, `expectedMemberProductIds` é obrigatório (`expected_members_required` se ausente, `null` ou vazio). Cada ID deve ser válido (`invalid_product`), sem repetição (`bulk_duplicate_product`), e deve conter obrigatoriamente todos os `selectedProductIds` (`expected_members_must_include_selected`).
- **Ações sem retenção (`retainRemainingAsSaturation: false`):** Mantêm compatibilidade integral; `expectedMemberProductIds` permanece opcional.
- **Testes unitários:**
  - `packages/web/test/curation-contract.test.mjs`: cenários de ausência, `null`, vazio, duplicatas, ID inválido, omissão de selecionado, caso válido e caso sem retenção.
  - `packages/web/test/curation-bulk-group.test.mjs`: cenário com justificativa válida e sem lista de membros falha com `expected_members_required`.

### AC-035.2 — Confirmação Visual e Blindagem da UI
- **Arquivo modificado:** `packages/web/app/admin/curadoria/group-reviewer.tsx` (linhas 50–78).
- **Antes:** Se `fetchGroupMembers` falhasse, o código caía em `members = card.representatives`, permitindo confirmação parcial.
- **Depois:** Se a leitura falhar, retornar vazia ou se `members.length < card.totalCount`, a UI emite mensagem de alerta informando a falha de completude e retorna sem abrir a modal nem enviar ação. O payload enviado na confirmação reflete exatamente os IDs dos membros completos exibidos na tela.
- **Estado de verificação:** A verificação estática de tipos e build passou (`tsc`, Next.js build). A verificação comportamental visual/interativa em navegador real fica categorizada como `NAO_VERIFICADA (UI interativa pendente de OS-031/harness de navegador)` conforme rito da OS.

### AC-035.3 — Conferência Transacional em `actOnGroup`
- **Arquivo modificado:** `packages/web/lib/curation-db.ts` (linhas 829–855).
- **Antes:** Só comparava `expectedMemberProductIds` se a lista existisse e não estivesse vazia. Se chamada com objeto fabricado sem a lista, aplicava a retenção cegamente.
- **Depois:** Se `input.retainRemainingAsSaturation: true`, exige `input.expectedMemberProductIds` presente e não vazio (`curation_group_members_changed` se ausente/vazio). Compara `memberIdSet.size !== expectedSet.size` e conferência bidirecional. Em qualquer divergência, lança `curation_group_members_changed` antes de qualquer mutação ou inserção de `curation_event`.
- **Registro:** Justificativa humana é gravada no `reasonDetail` de cada produto retido e persistida no evento de curadoria.

### AC-035.4 — Regressão e Prova PGlite
- **Arquivo modificado:** `tools/editorial-tests/comparison-flow.test.ts` (linhas 282–365).
- **Casos cobertos na fixture:**
  1. `validateGroupAction` com ausência de lista -> `expected_members_required`.
  2. `validateGroupAction` com lista vazia -> `expected_members_required`.
  3. `validateGroupAction` com duplicata -> `bulk_duplicate_product`.
  4. `validateGroupAction` omitindo selecionado -> `expected_members_must_include_selected`.
  5. `actOnGroup` direto com objeto fabricado sem lista (`expectedMemberProductIds: null`) -> rejeita com `curation_group_members_changed`.
  6. `actOnGroup` com lista desatualizada/divergente (`["caf_1"]` faltando `caf_2`) -> rejeita com `curation_group_members_changed`.
  7. `actOnGroup` válido com lista completa `["caf_1", "caf_2"]` e justificativa humana -> resolve selecionado como `approved` e retido como `held` com `family_saturation`, gravando snapshot v2 e justificativa.
  8. Isolamento entre contas: tenant B inalterado.

---

## 3. Resultados Reais dos Comandos

### 3.1. Testes unitários de contrato e grupo
```bash
node --test packages/web/test/curation-contract.test.mjs packages/web/test/curation-bulk-group.test.mjs
```
```text
ℹ tests 16
ℹ suites 0
ℹ pass 16
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 124.004388
```

### 3.2. Fixture PGlite do fluxo comparativo
```bash
(cd tools/editorial-tests && node --import tsx comparison-flow.test.ts)
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

### 3.3. Integração editorial
```bash
npm test --prefix tools/editorial-tests
```
```text
Editorial integration: 29 scenarios passed. PostgreSQL fixture only; no remote database touched.
```

### 3.4. Bateria de testes web
```bash
npm test --prefix packages/web
```
```text
ℹ tests 436
ℹ suites 0
ℹ pass 436
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2139.072128
```

### 3.5. Checagem de tipos e compilação
```bash
npm run typecheck --prefix packages/web
npm run build --prefix packages/web
```
- Typecheck: código de saída 0 (sem erros).
- Build Next.js: código de saída 0 (`✓ Compiled successfully`, static pages 22/22).

---

## 4. Estado de Conclusão da OS-035

- **BUG-019:** FECHADO com testes unitários, validação transacional e fixture PGlite.
- **UI:** Implementada no código com fail-closed para incompletude; interatividade visual declarada como `NAO_VERIFICADA (UI interativa pendente de OS-031)`.
- **Fronteira:** Nenhuma violação ou necessidade de `BLOQUEIO_DE_FRONTEIRA`.
- **Status:** CONCLUÍDO localmente, liberando o início da OS-036.

