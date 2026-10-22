# Verificação integral e referência de comandos

Esta é a suíte de aceite **a implementar/executar futuramente**, salvo os testes registrados como realizados em 01-RECONCILIACAO. Não confundir script existente com cobertura suficiente.

Complementos da revisão de viabilidade: 01-0 testa supressão de claims também em ranking/filtro, exceção comercial, membro, view consumida pela aplicação e material gerado, mantendo compra e preços observados (S-PRECO/T18). A view no banco só será corrigida em M-01. G-EVIDENCE exige exemplo real com fonte/configuração para comparação, não só fixture sintética. S-FIN inclui assinatura faturada→recebida→estornada, sem duplicar receita, entrar em despesas ou aparecer na conta do assinante. 10B cobre a versão candidata inteira, incluindo onboarding antes de convites; EP-09 não precisa existir para realizar o teste.

## Comandos reais encontrados

Da raiz do repositório:

- `npm test --prefix packages/web`
- `npm test --prefix packages/persistence`
- `npm test --prefix packages/capture`
- `npm test --prefix packages/extension`
- `npm run typecheck --prefix packages/web` (e persistence/capture/extension)
- `npm run build --prefix packages/web` somente no ambiente de implementação, com env seguro e um único processo usando .next.
- `npm test --prefix tools/editorial-tests`
- `npm run test:triage-price --prefix tools/editorial-tests`
- `npm run test:capture-batch --prefix tools/editorial-tests`

Os três últimos usam PGlite, fixture local e SQL real; não provam concorrência multi-conexão/pooler. Não foram executados neste planejamento, que não aplica migrations. Os testes novos devem entrar nos runners existentes ou ter comando novo explicitamente criado na implementação; esta spec não afirma que existam scripts npm adicionais.

Scripts verify:* de persistence existem mas alguns escrevem fixtures/transações e usam env remoto. Revisá-los antes de execução; jamais presumir read-only pelo nome. monitoring:run, sweep, purge, cleanup, bootstrap, seed e APIs de captura não são comandos de diagnóstico sem efeitos.

## Matriz de casos do blueprint

| Caso | Dono / entrega | Procedimento e resultado observável |
|---|---|---|
| T01 impressora R$5.299, 1 obs, IA5 | 02-B/03-A | Mesmos fatos, políticas generalista/maker; sem pauta automática generalista, avaliação de nicho possível; preço não é veto universal |
| T02 organizador R$13,99 | 02-B/03-A | Sinais de qualidade adequados; deixa de ser held só pelo piso, ainda exige valor/integridade |
| T03 R$19,99 histórico | 00-B/03-C | Comparar preço atual e snapshot no evento; preservar aprovação humana/antiga, não recontar como bug sem evidência |
| T04 4,9 com poucos reviews | 02-B | Contrapor reviewCount=2 e 2000 com mesma média; justificar confiança/limites, desconhecido não vira 0 |
| T05 marca desconhecida | 02-B | Reviews sustentados e qualidade contextual permitem recommendable/good_buy |
| T06 70% alegado e reputação baixa | 01-B/02-B | Não ganha gold; claim seller_claimed separado do histórico |
| T07 110/220V/capacidades | 01-A/B | Mesmo listing, séries distintas; unknown não entra como mesma variante |
| T08 gaps | 01-B/05-C | Lacuna visível, coverage e maxGap corretos, sem selo de janela sem cobertura |
| T09 preço estável/valor bom | 03-A | Boa compra por valor com razões, temporal sem queda; sem urgência |
| T10 preço muda após aprovação | 06-C/11-B | Mudar preço entre preview, approve e dispatch; invalidated/retido, sem arte divergente |
| T11 link/credencial inválida | 06-B/07-C/10-B | Bloquear ready/redirect, nenhuma tag da casa como fallback |
| T12 IA inventa urgência | 06-B | Rejeitar claim sem sourceRef/validade, edição humana também revalida |
| T13 exportado não postado | 04-B/07-A | Copiar/download gera exported; métrica de publicadas continua zero observado |
| T14 dois canais | 07-B | Códigos distintos, CTA preserva origem, cliques segregados; sem c é desconhecido |
| T15 venda sem origem | 08-A | Registrar declaração/documento, campaign null, sem atribuição inventada |
| T16 CSV repetido | 08-B | Mesmo arquivo, reordenado, correção e duas submissões concorrentes; nenhum fato duplicado |
| T17 isolamento | 10-A/B/12-C | A/B/casa, pessoa em duas contas, URL adulterada, API/SQL/Storage/worker; acesso negado e nada inferível |
| T18 continuidade comercial | todas, especialmente 01/07/10 | Home, /bizu, OG, /p, /go, membro, captura e callbacks reais do deployment; comparar preço/dono/link, sem escritos sintéticos em produção |

## Suítes adicionais obrigatórias

**S-PRECO:** fixtures com moeda diferente, faixa, cupom/frete/Pix desconhecidos, seller trocado, desempate por id, replay, captura velha, nova variante com mesmo preço em 20h, revogação de identidade. Verificar a MESMA evidência em web, membro, view de curadoria, populares/composer, seleção e Story. `db.ts`, `member-db.ts` e view antiga eram divergentes.

**S-RUBRICA:** 30–50 casos reais autorizados, seleção estratificada por loja/ticket/família/histórico e aprovados/rejeitados/retidos; labels humanas não inventadas. Comparar legado e v2 em sombra com denominadores e discordâncias. Não promover apenas por teste de prompt.

**S-KIT:** revisão concorrente, aprovação superada, substituição de imagem, link revogado, TTL durante export, texto editado com claim novo, rollback de transação, falha Storage e assinatura de acesso de outra conta. Render PNG da revisão e inspecionar preço, disclosure, recorte, acentos e contraste em 1080×1920/mobile; template versionado sem buscar preço ao vivo no download.

**S-LINK:** legado 4 caracteres e novo 12; dono correto ML/Shopee/AliExpress; dois canais, preview não aumenta clicks, slug/c adulterados, classificação limitada de crawler, falha de analytics sem perder destino monetizado. Usar mocks dos provedores e contas de teste, depois smoke consentido sem compra.

**S-DB:** versão antiga/nova da aplicação, migration parcial, backfill interrompido/reexecutado, FK cruzada, falta de grant, RLS sem contexto, A/B/A em conexões do pooler, chamada fora de tx, tentativa de alterar tenant em UPDATE, view/func/trigger, member bootstrap, plano de execução e lock_timeout. PostgreSQL real isolado obrigatório para multi-conexão; PGlite sozinho insuficiente.

**S-FIN:** moeda e centavos, relatório sem pedido, correção/reversão após recebimento, origem desconhecida, collision parser, CSV inválido/fórmula/export seguro, lote parcialmente rejeitado com preview, idempotência concorrente, ausência de receita ≠ receita zero. Custos e faturamento SaaS separados.

**S-DISPATCH:** restart depois do envio e antes de finalize, lease vencido, timeout desconhecido, 429 com retry conhecido, suspensão após enqueue, clique e preview sem envio, quota disputada, cooldown e kill switch por conta/global, cancelamento concorrente. Nunca prometer exactly-once externo sem suporte do provedor.

## Jornadas finais

J1 casa: captura fixture autorizada→histórico/qualidade→política→oportunidade→campanha→kit validado→aprovação humana→exportação→confirmação→clique de teste isolado→venda manual/documentada→comissão e custos→experimento em sombra. Mostrar fonte, versão e próxima ação em todas as telas. Nenhum passo automático converte “copiou” em “publicou”.

J2 SaaS: provisionar duas contas sintéticas isoladas, membership owner/operator, secrets diferentes e uma pessoa em duas contas; cada uma percorre J1 sem dados da outra ou fallback house; suspender B sem afetar A/casa. Validar leitura direta DB, storage URLs, workers, exports e payloads de erro.

J3 regressão: comparar comportamento legado com flags novas desligadas e com casa habilitada; links antigos preservados, histórico original intacto e filtros/editorial coerentes. Não afirmar regressão inexistente se baseline tem falha: registrar diferença atribuível e resolver bloqueio do fluxo antes de ativação.

## Evidência de conclusão

Cada entrega deve produzir relatório com commit/hash de migration, ambiente, testes executados/resultados, capturas/redações sem PII/segredos, consultas de pós-verificação, flag/conta ativada e procedimento de retorno. Precondições rotineiras se reconfirmam na execução; novos fatos que contradigam contrato fundamental exigem revisão localizada, nunca execução às cegas.
