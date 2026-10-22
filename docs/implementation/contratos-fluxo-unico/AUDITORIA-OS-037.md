# Auditoria de entrega — OS-037

20/10/2026. Modo `entrega`. **Veredicto: CONFORME** para fechamento local de BUG-021. Critérios: [OS-037](OS-037.md), [AUDITORIA-CONTRATO-OS-037.md](AUDITORIA-CONTRATO-OS-037.md), [reinvestigação de BUG-021](../diagnosticos/os-036/DIAGNOSTICO.md), [AUDITORIA-OS-036](AUDITORIA-OS-036.md) e [RESULTADO-OS-037](RESULTADO-OS-037.md). Baseline `main` `43700c59f4e24f68f3a2e32c20ee5147fa4816cd` mais working tree extenso não commitado (incluindo OS-035). Versão examinada e congelada por SHA-256:
- `packages/persistence/supabase/migrations/20261020002440_garimpa_comparative_evidence_event.sql`: `44f03a13ab420c94bdfc5456b72ff84322a4c5ddc9978842e096c7fc5b37b4a4`
- `packages/web/lib/comparison-evidence.ts`: `2bea9dca637db883d42dc3a8cb54fad5a79bf6181811041c8f899cc65cf31a07`
- `packages/web/lib/editorial-selection-db.ts`: `e356d0a589fd7d87722efcb6b4049ab03b9da1fd79d1802b7101df9d0be9da1d`
- `packages/web/lib/editorial-selection.ts`: `b6c37ef60537e047f32acf51d99dd6114258ed29e7ccd0dc4eba47fceafea808`
- `tools/editorial-tests/comparison-history-flow.test.ts`: `0fd27c96ad070df37bf03a15deec928fd57a66bf2f9f1b50cdb0b19e86682cdb`
- `tools/editorial-tests/comparison-flow.test.ts`: `69a8db446766345d04d74ff36bf159e856df26e8ff9fddd6ce4ef9def077aeb0`

Nenhum código de produção, contrato, migration ou teste foi alterado nesta auditoria.

---

## 1. Parecer Objetivo por Critério de Aceite

| Aceite / ID | Parecer objetivo e evidência independente |
|---|---|
| **AC-037.1 / Evento durável e privado** | **Conforme.** Migration aditiva cria `garimpa.comparative_evidence_event` com PK monotônica (`bigint generated always as identity`), isolamento por tenant via RLS forçado para `garimpa_app`, imutabilidade garantida (sem grants de INSERT/UPDATE/DELETE para a aplicação) e triggers transacionais com row lock (`FOR UPDATE` em `garimpa.product`) em mutações de `product` e `price_observation`. Teste independente comprovou rollback atômico em abort e negação de escrita direta com erro `42501`. |
| **AC-037.2 / Corte consistente v3 e concorrência** | **Conforme localmente.** `saveEditorialAssessment` adquire bloqueios explícitos determinísticos via `SELECT id FROM garimpa.product ... ORDER BY id FOR UPDATE` e fixa corte monotônico `latest_evidence_event_id` por produto na versão `"v3"` da base comparativa. Bases v1/v2 legadas com alegação de superioridade falham fechado até nova avaliação humana. Ausência da migration (`42P01`) degrada graciosamente: produtos descritivos continuam operando normalmente e alegações comparativas falham fechado sem mascarar outros erros SQL. Concorrência multi-processo/multi-sessão em PostgreSQL nativo segue `NAO_VERIFICADA` pelo ambiente monothread PGlite. |
| **AC-037.3 / Equivalência material** | **Conforme.** `isMateriallyEquivalent` e `normalizeUrl` diferenciam de forma pura e reproduzível mudanças de preço, variantes confirmadas/perdidas, marketplace, ID externo, URL do produto e URL/origem da fonte (incluindo descarte de tracking/UTMs e preservação de IDs canônicos). Recaptura idêntica mantém a validade da evidência. |
| **AC-037.4 / Suspensão aderente ao histórico** | **Conforme.** `validateSuperiorityClaimsInBatch` consulta eventos subsequentes aos cortes individuais em 1 única query em lote dentro da transação `repeatable read read only` existente, utilizando o índice `(tenant_id, product_id, id)`. Qualquer evento materialmente divergente suspende a alegação. A leitura pública omite o produto limpo sem vazar `editorialRationale` ou `editorialContext`. Ativação de item suspenso em `replaceEditorialSelection` falha fechado com `selection_item_blocked`. Cobriu ramo curado e catálogo. |
| **AC-037.5 / Fechamento de BUG-021** | **Conforme — BUG-021 FECHADO LOCALMENTE.** Execução de suíte dedicada e verificação independente efêmera comprovaram fechamento de todos os contraexemplos de AUDITORIA-OS-036 (CP1 a CP6) e positivos (CP7 a CP10). |

---

## 2. Verificação Independente das Contraprovas (BUG-021)

Em sessão efêmera isolada via script Node.js sobre `commercialFixture()` e PGlite, sem alterar os arquivos do repositório, reproduzi independentemente os cenários centrais que haviam falhado nas auditorias OS-028, OS-034 e OS-036:

1. **Contraprova 1 (Mudança de origem):** Inserção de observação da alternativa com mesmo preço (R$ 499) e mesma variante (`110v`), mas `source.url` alterado de `http://alt` para `http://different-seller`.
   - **Resultado:** `getPublishedEditorialSelection("home")` omitiu imediatamente o produto candidato (`products.length === 0`).
2. **Contraprova 2 (Timestamp retroativo):** Nova avaliação humana restabeleceu o corte. Inserida observação da alternativa a R$ 900 com `observed_at = now() - interval '2 hours'`.
   - **Resultado:** Como o trigger gravou o evento com ID superior ao corte da avaliação, a leitura pública omitiu o candidato (`products.length === 0`), neutralizando a fragilidade do relógio de captura.
3. **Contraprova 3 (Sobrescrita A→B→A):** Nova avaliação humana restabeleceu o corte. Executado `UPDATE` in-place na observação da alternativa para R$ 950 (estado B), e em seguida `UPDATE` de volta para R$ 499 (estado A).
   - **Resultado:** A leitura pública omitiu o candidato tanto em B quanto após o retorno a A (`products.length === 0`). A alegação permaneceu suspensa pela existência do evento intermediário não-equivalente.
4. **Contraprova 4 (Mutação de elegibilidade approved→rejected→approved):** Mudança de curadoria da alternativa de `approved` para `rejected` e retorno posterior para `approved`.
   - **Resultado:** A leitura pública continuou omitindo o candidato (`products.length === 0`), respeitando o histórico de `curation_event`.
5. **Positivo (Recaptura idêntica):** Nova avaliação humana com corte v3 atualizado. Inserida observação subsequente com mesmo preço, mesma variante e mesma URL de origem.
   - **Resultado:** O candidato permaneceu publicado com sucesso (`products.length === 1`), comprovando que rotinas normais de scraping sem alteração de oferta não derrubam alegações legítimas.

---

## 3. Baterias de Testes Executadas nesta Auditoria

Todas as baterias de verificação foram executadas nesta auditoria independente com resultados 100% aderentes:

- `node --test --experimental-strip-types tools/editorial-tests/comparison-history-flow.test.ts`: **9/9 suítes passaram** (3.405 ms).
- `node --test --experimental-strip-types tools/editorial-tests/comparison-flow.test.ts`: **5/5 testes passaram** (11.413 ms).
- `node --test packages/web/test/comparison-evidence.test.mjs`: **7/7 testes passaram** (75 ms).
- `node --test packages/web/test/editorial-selection.test.mjs`: **15/15 testes passaram** (88 ms).
- `npm test --prefix tools/editorial-tests`: **29/29 cenários de integração passaram**.
- `npm test --prefix packages/persistence`: **40/40 testes passaram**.
- `npm test --prefix packages/web`: **438/438 testes passaram**.
- `npm run typecheck --prefix packages/web`: **0 erros** (exit code 0).
- `npm run typecheck --prefix packages/persistence`: **0 erros** (exit code 0).
- `npm run build --prefix packages/web`: **Compilação bem-sucedida** (Next.js 15.5.23, 22/22 rotas compiladas estaticamente, middleware 93.7 kB).

---

## 4. Registro Consolidado do Achado

| ID | Tipo | Estado | Evidência / Reprodução | Critério de fechamento | Tentativas | Responsável | Versão |
|---|---|---|---|---|---|---|---|
| **BUG-021** | `implementacao` | **verificado** | Alegação pública de superioridade vazava após mudança de origem, inserção retroativa, sobrescrita A→B→A e alteração de elegibilidade em OS-028/034/036. | Tabela `comparative_evidence_event`, triggers com row lock determinístico, corte v3 monotônico e validação em lote na leitura/ativação. CP1–CP10 verdes em teste de histórico e roteiro efêmero independente. | 4 (OS-028, OS-034, OS-036, OS-037) | arquiteto (contrato v3) / executor (implementação) / auditor (homologação local) | `RESULTADO-OS-037.md` |

---

## 5. Limitações Ambientais e Encaminhamento

1. **PostgreSQL Nativo Concorrente:** A verificação em ambiente local utiliza `PGlite` in-memory. A comprovação de concorrência real multi-sessão e plano de execução em PostgreSQL nativo segue classificada como `NAO_VERIFICADA` para ser consolidada no ambiente de homologação OS-033/OS-031.
2. **Ambiente Remoto:** A migration `20261020002440_garimpa_comparative_evidence_event.sql` é estritamente aditiva e local; não foi aplicada em banco de dados remoto nem submetida a deploy.
3. **Desbloqueio:** Com o fechamento local e comprovado de **BUG-021**, encerra-se o ciclo corretivo da OS-037. A ordem **OS-029** (Projeção única, paginada, ordenável e isolada por conta) encontra-se **DESBLOQUEADA** para execução, conforme as dependências estabelecidas no [PLANO-ENTREGAS.md](PLANO-ENTREGAS.md).
