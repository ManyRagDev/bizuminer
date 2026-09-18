# Pedido de conferência — rodagens agrupadas por execução

**Status:** 🟡 implementação concluída; exige conferência independente antes de ✅.

## Escopo

Confirmar que `/admin` mostra uma linha por execução disparada e que a expansão permite investigar cada busca sem perda de fatos operacionais.

## Invariantes a conferir

1. Duas execuções diferentes nunca são unidas por terem o mesmo horário ou plano.
2. Consultas de marketplaces diferentes nunca compartilham um grupo.
3. Rodagens antigas só agrupam quando `collector_run_id` termina exatamente em `:<captureQueryId>`; rodagem avulsa permanece isolada.
4. Novas consultas do mesmo plano compartilham `parameters.captureExecutionId`.
5. Totais do pai são a soma dos filhos; início é o menor, término é o maior e duração cobre a execução completa.
6. Mistura de sucesso e erro aparece como `parcial`; todos com erro aparecem como `erro`; filho em andamento torna o pai `rodando`.
7. A linha fechada mostra status, início, duração, buscas, itens, novos e mudanças de preço.
8. A expansão mostra categoria/consulta, modo, contadores, observações, páginas, limites, saturação/família dominante e erro.
9. Botão possui estado acessível `aria-expanded`, foco visível e alvo móvel de 44 px.
10. A API devolve todos os filhos das 20 execuções mais recentes, e não apenas as 20 linhas mais recentes.

## Evidência já produzida

- Banco real, AliExpress: 12 linhas recentes → 3 execuções; maior execução com 10 buscas.
- `packages/web`: teste específico `admin-run-groups.test.mjs` — 4/4.
- `packages/persistence`: 22/22 testes.
- Typecheck: zero erro em web e persistence.
- Inspeção visual local: linha recolhida e expansão com 10 buscas renderizaram corretamente.
- Suíte web completa: 173/177; quatro falhas já existentes fora deste escopo (contratos antigos de filtros/logos), sem falha na funcionalidade nova.

## Comandos

```powershell
cd packages/web
npm run typecheck
node --test --experimental-strip-types test/admin-run-groups.test.mjs

cd ../persistence
npm run typecheck
npm test
```

## Conferência humana no painel autenticado

1. Abrir `/admin` e localizar `Rodagens · AliExpress`.
2. Confirmar que a execução de 05/09 13:04 aparece em uma única linha com `10` buscas.
3. Expandir e conferir as dez consultas internas; recolher novamente.
4. Conferir Mercado Livre e Shopee: execuções avulsas permanecem em linhas próprias e planos multi-consulta agrupam apenas seus filhos.
5. Repetir em viewport móvel e verificar rolagem horizontal, alvo do botão e legibilidade dos detalhes.

## Veredito esperado

Registrar **aprovado** ou listar divergências reproduzíveis. Somente após aprovação independente mudar o item para ✅.
