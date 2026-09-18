# Handoff — captura category-first v1

**Estado:** 🟡 implementada localmente em 03/09/2026; rodada real e julgamento da variedade ainda pendentes.

## 1. O que deveria mudar

Sem `--keyword`, os CLIs de AliExpress e Shopee deixam de fazer uma busca ampla única e executam `category-first-v1`: 8 consultas dirigidas e 2 exploratórias. Cada consulta tem orçamento próprio, registra a intenção em `capture_run.parameters` e avança para a seguinte quando encontra saturação.

O limite atua somente sobre anúncios novos. Um produto já existente sempre é persistido novamente para preservar a história de preço.

## 2. Onde olhar

- Plano e executor: `packages/persistence/src/capture-plan.ts`
- Famílias conservadoras: `packages/persistence/src/product-family.ts`
- Gate e auditoria: `packages/persistence/src/ingest.ts`
- Consulta em lote de produtos conhecidos: `packages/persistence/src/store.ts` e `pg-store.ts`
- Bordas: `packages/persistence/bin/sweep-aliexpress.ts` e `sweep-shopee.ts`
- Verificador real: `packages/persistence/bin/verify-capture-plan.ts`
- Testes: `packages/persistence/test/capture-plan.test.ts`, `product-family.test.ts` e `ingest.test.ts`

Contagem de testes persistence antes: **11** · depois: **18**.

## 3. O que não entrou

- Nenhuma chamada real a marketplace foi feita durante a implementação.
- Não há adaptação automática do orçamento usando aprovação ou vantagem de preço; faltam rodadas category-first reais para calibrar isso sem fabricar pesos.
- O Mercado Livre automatizado não foi reativado. A política é genérica, mas a borda `/ofertas` permanece sob o kill switch existente.
- Não há LLM nem agrupamento semântico; apenas famílias com termos explícitos.

## 4. PEDIDO DE CONFERÊNCIA — parcial

Não confie neste documento; derive cada resposta do código, dos testes e, quando autorizado, do banco.

| # | Afirmo que… | Como re-derivar | Evidência anexada |
|---|---|---|---|
| A1 | O plano padrão contém 8 consultas dirigidas, 2 exploratórias e nenhuma usa `achadinhos`. | `cd packages/persistence && node --experimental-strip-types bin/sweep-aliexpress.ts --dry-run` e teste `capture-plan.test.ts`. | Dry-run local; persistence 18/18. |
| A2 | Saturação limita candidatos novos, mas não bloqueia reobservação de produto conhecido. | Rodar `npm test`, inspecionar os dois últimos casos de `ingest.test.ts` e testar `findExistingExternalIds` contra um id conhecido. | Persistence 11→18; lookup read-only encontrou `MLB33269708` e recusou o id inexistente. |
| A3 | Uma consulta saturada encerra páginas seguintes. | Teste “interrompe páginas seguintes…” com duas páginas; conferir `pagesRead === 1`. | Teste automatizado. |
| A4 | A execução real deixa parâmetros íntegros e uma observação por produto. | Após uma rodada deliberada, executar `npm run verify:capture-plan`. | Pendente; nenhuma rodada real foi criada nesta entrega. |
| A5 | A fila resultante é mais variada e continua encontrando bons preços. | Comparar as decisões humanas e a distribuição de famílias com a rodada anterior. | Não verificável tecnicamente ainda; exige julgamento do dono. |

## 5. Onde desconfio desta entrega

- Os termos iniciais são hipóteses editoriais. Podem precisar de sinônimos específicos por marketplace após observar resultados reais.
- O limiar 60%/10 e os limites 8/5 são seguros para reduzir volume, mas ainda não são ótimos comprovados.
- Famílias não reconhecidas passam sem cota de família, embora ainda respeitem o teto total por consulta. Isso é intencional para evitar falsos agrupamentos, mas reduz a proteção até o vocabulário crescer.

## 6. Degraus cumpridos

1. Typecheck de capture e persistence: limpos.
2. Testes locais: capture 120/120; persistence 18/18.
3. Comportamento observável sem rede: dry-run de AliExpress e Shopee passou.
4. Fonte real: lookup read-only do catálogo passou; rodada deliberada ainda pendente e `verify:capture-plan` retornou `awaiting_real_run` com zero rodadas.
5. Julgamento humano: pendente.
