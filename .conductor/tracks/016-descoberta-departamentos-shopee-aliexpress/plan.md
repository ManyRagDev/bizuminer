# Track 016 — Descoberta Ampliada por Departamentos (Shopee & AliExpress)

> **Status:** Em execução. Correção das duas lojas priorizada em 09/11/2026.  
> **Referência Técnica:** `docs/tecnico/plano-descoberta-shopee-aliexpress.md`

## Verificação de 9 de novembro de 2026

- O código local já tem entradas por departamento, ordenação e tamanho de página no painel, no worker e nos adaptadores. A revisão publicada `37e4855` ainda usa o plano anterior, com consultas por palavra-chave.
- A execução publicada da Shopee terminou parcial após as tentativas para o erro `10000`. Foram 5 consultas bem-sucedidas de 10, com 46 capturas e 34 itens novos. A execução do AliExpress completou 10 consultas, com 80 capturas e 79 produtos distintos com links de afiliado.
- Em uma captura posterior pela API oficial, a primeira página de Ferramentas (`100715`, ordem de vendas, limite 10) devolveu 10 ofertas válidas: 3 com preço exato e 7 com faixa. A API também gerou o link afiliado para a oferta de spray VedaTudo de R$ 23,67. A busca por palavra-chave retornou o erro GraphQL `10010` com a consulta local e `10000` com a versão sem os argumentos de departamento. A amostra ficou fora do catálogo de produção.
- Uma rodada isolada nos 12 departamentos da Shopee (até 2 páginas de 20, ordem de vendas) concluiu 19 páginas em 170 segundos. Retornou 350 ofertas válidas, 343 distintas, com 106 preços exatos e 237 faixas. Eletrônicos falhou na primeira página e a segunda não foi solicitada. Esporte e Lazer, Auto e Brinquedos falharam na segunda. As quatro falhas foram `10000`. O lote ficou em arquivo local, sem gravação no catálogo.
- O plano técnico sugere uma cota inicial de 8 novos por recorte e 5 por família. O código local usa 50 e 25 no modo por departamentos e desativa a interrupção por saturação. Resolver essa divergência antes do primeiro lote amplo. Validar também como o worker trata concorrência e falhas parciais.
- As suítes locais de captura, persistência, web e extensão passaram após repetir fora da sandbox os testes de subprocessos e interfaces de rede. O TypeScript do pacote web passou. Esses resultados não comprovam a qualidade dos recortes nas APIs nem a segurança do volume de um lote real.
- A migração local `20261109022751_balance_public_catalog_marketplaces.sql` precisa de verificação isolada da projeção e da paginação. O piloto amplo depende da validação do ambiente e da conta, conforme o plano técnico.
- A entrada padrão da vitrine usa a edição editorial quando há uma edição disponível. Em produção, essa entrada mostrou 22 ofertas do AliExpress e 2 da Shopee. Os filtros por loja abriram o catálogo paginado e retornaram 181 ofertas da Shopee, 106 do AliExpress e 41 do Mercado Livre. Validar a distribuição nas duas entradas. A migração do catálogo não cobre, por si só, a composição da edição inicial.

---

## 1. Contexto e Motivação

O catálogo do BizuMiner necessita de maior diversidade de produtos para além dos mais vendidos concentrados em poucas categorias.
Esta track finaliza e integra a descoberta por 12 departamentos raiz e subcategorias oficiais nas APIs da Shopee e do AliExpress, garantindo que produtos com variação de modelo/voltagem/cor sejam preservados e que a ingestão alimente adequadamente a triagem e a pauta da casa.

---

## 2. Tarefas do Plano

### Correção prioritária do fluxo de venda

- [ ] Reproduzir as falhas da Shopee na API oficial e testar a recuperação de consultas transitórias sem misturar parâmetros entre páginas. Preservar capturas parciais e reportar consultas que continuem falhando.
- [x] Garantir representação das lojas com ofertas aptas na Pauta automática, dentro do limite do canal e respeitando família, recência, curadoria, intervalo de divulgação e link de afiliado. Preservar a ordem manual.
- [x] Exibir faixa de preços confirmada pela Shopee com aviso de variação. Conservar o preço confirmado para uma opção específica e omitir alegações de desconto ou menor preço quando a opção não estiver identificada.
- [ ] Exigir conferência manual da opção e do preço em reais para a Pauta do AliExpress, conforme decisão do operador em 09/11. Dar acesso à conferência no histórico da Pauta e manter a captura no catálogo público conforme a curadoria existente.
  - [ ] Permitir que o operador registre opção e preço mesmo quando o anúncio não informa todos os campos acessórios. Marcar os dados desconhecidos como ausentes, avisar sobre as condições na loja e preservar a proteção do histórico comparável.
- [x] Conectar a primeira página da vitrine ao catálogo completo com paginação. Usar a edição editorial nos destaques e verificar a presença e os filtros das lojas no catálogo público.
- [ ] Conferir em produção a cadeia de links dos itens selecionados e a cobertura nos dois canais, distinguindo atribuição configurada de venda efetivamente registrada.
- A track 015 (GA4) fica para depois do aceite deste fluxo.

### Aceite da publicação `ca006cd`

- O catálogo inicial passou a paginar as 328 ofertas públicas. A primeira página mostrou oito itens de cada loja e a segunda mostrou os itens 25 a 48. O SQL de ordenação foi aplicado pelo SQL Editor do Supabase.
- A leitura da Pauta em produção confirmou Shopee com destino de afiliado `s.shopee.com.br`. A confirmação de opção do AliExpress passou no teste isolado para os dois canais e o formulário foi aberto numa oferta real. O aceite depende de registrar uma opção conferida na loja em produção.
- O teste com a API do AliExpress retornou `sku_id` no detalhe. O envio de `sku_id` ou `sku_ids` na requisição de detalhe não alterou os SKUs retornados. Os preços em reais divergiram entre busca e detalhe para os dez anúncios amostrados.
- A rodada de produção [42638752691](https://github.com/ManyRagDev/bizuminer/actions/runs/42638752691) completou 10/10 consultas da Shopee, com 167 capturas e 72 produtos novos. A nova tentativa com página menor preserva termo, ordem e tamanho nas páginas seguintes. O piloto de descoberta por departamentos segue separado.

- [ ] **1. Contratos de Consulta e Mapeamento (`capture`)**
  - [ ] Validar e finalizar suporte a `sourceQuery` (`department` e `campaign`) nos adaptadores Shopee e AliExpress.
  - [ ] Garantir resiliência a timeouts e retries com backoff em erros transitórios.
  - [x] Executar testes de unidade de adaptadores: `npm test --prefix packages/capture`.

- [ ] **2. Plano de Departamentos e Persistência (`persistence`)**
  - [ ] Consolidar o mapeamento de departamentos e categorias em `packages/persistence/src/department-plan.ts`.
  - [ ] Validar `sweep-shopee.ts` e `sweep-aliexpress.ts` respeitando isolamento de contas e cotas de novos itens.
  - [x] Executar testes de persistência e plano: `npm test --prefix packages/persistence`.

- [ ] **3. Integração com Workers e Triagem (`web`)**
  - [ ] Ajustar o acionamento em lotes via `run-capture-batch.ts` e painel admin.
  - [ ] Validar balanceamento de catálogo e eliminação de duplicatas idênticas mantendo variações legítimas.
  - [ ] Verificar a presença das lojas elegíveis na edição inicial da vitrine, as contagens nos filtros do catálogo paginado e a cobertura por loja em cada canal da Pauta. Registrar a causa das exclusões por preço e por corte editorial na track 014.
  - [x] Executar testes de curadoria e queries: `npm test --prefix packages/web`.

- [ ] **4. Verificação Real e Definition of Done**
  - [ ] Executar scripts de verificação derivados do banco.
  - [ ] Atualizar este `plan.md` e o `.conductor/tracks.md`.

### Lote amplo integrado em 09/11/2026

- O operador autorizou importar a amostra ampla, gerar afiliados, triar, conferir Pauta/vitrine e ajustar a recorrência. Lote `22dbc2f9-d39e-4ac8-aae8-4c0c8cedfaee`, captura `5c8be20b-3ad1-4a04-b941-07cf90f2e6f9`, conta `local` em produção.
- 343 anúncios únicos importados pelo `sweep` e `PostgresStore`, preservando o horário da coleta original. 122 novos, 221 já existentes, 20 mudanças de preço, zero descartados nesta importação. As quatro falhas da coleta original permanecem nos metadados `savedCapture`; o lote de importação concluiu todos os anúncios disponíveis.
- 122 links de afiliado gerados, zero falhas; 343/343 anúncios com publicação web e shortlink `s.shopee.com.br`.
- Triagem real `b3fb56a4-4b58-4ba2-8166-8c8020edb8c2`: 128 candidatos processados, 85 aprovados, 7 rejeitados, 36 anotados para revisão. O modelo principal retornou cota diária esgotada (429); a cadeia de fallback concluiu a avaliação.
- Estado final do lote: 246 aprovados, 79 pendentes já avaliados pela IA com nota 3, 18 rejeitados (13 baixa utilidade, 5 alegações enganosas). Não há candidato desse lote ainda sem avaliação. Decisões anteriores preservadas.
- A projeção pública retornou 292 ofertas Shopee, incluindo todos os 246 aprovados desse lote. A Pauta WhatsApp publicada mostrou 12 ofertas, incluindo 11 Shopee deste lote, com faixas e aviso de variação. A prévia executada com o código local ainda não publicado selecionou 1 item do lote, 244 abaixo do corte e 1 por prioridade de família; não confundir essa prévia com a seleção publicada. A limitação é de seleção do canal, não de ingestão nem de faixa de preços.
- Corrigida a soma dos resultados parciais: `SweepError` carrega o resumo dos itens persistidos antes de uma falha de página. O plano inclui esses contadores e continua os outros departamentos. Teste de regressão cobre falha após a primeira página.
- Nova descoberta agendada da Shopee preparada em workflow próprio, duas vezes ao dia, respeitando pausa da loja e exclusão mútua de lotes. Atualização por ID preservada. Evidências operacionais locais em `/tmp/bizu-shopee-import/verification.json`.

- Publicação seletiva `cf8e898ba431d01603b4ee1861e891fa7383f245`: push em `main`, deploy Vercel `dpl_6tCmyz9g2Jf4TNmX33rLbXTpxEyf` READY com os domínios de produção. Demais alterações locais de extensão/AliExpress/GA4 preservadas. Workflow de descoberta ativo; primeira execução de aceite `42702449012`. HTTP público retornou 292 ofertas Shopee, incluindo faixas, e `/go/shp-23997726120` retornou 302 para `s.shopee.com.br`.

### Aceite real da rotina publicada

- Workflow `42702449012` executado em `main` no commit `cf8e898`, lote `ae683616-55b7-4774-885a-c1bb41db40da` de 18:26 a 18:38 BRT. Foram 320 registros de ofertas, 313 produtos únicos, 12 novos, 4 mudanças de preço, zero descartes por política. Todos os 313 têm publicação web com link `s.shopee.com.br`.
- Seis consultas completas e seis com erro `10000`: Eletrônicos, Ferramentas, Beleza, Esporte e Lazer, Auto e Brinquedos. As consultas com erro preservaram 80 registros já capturados; estes entraram no resumo junto aos 240 das consultas completas. Lote terminou `partial`; o workflow ficou vermelho deliberadamente pelo exit code da captura parcial, sem omitir a falha externa.
- A triagem terminou `ok`, 14 avaliados, 11 aprovados, 3 anotados, zero rejeitados/retidos. A etapa posterior de atualização da vitrine terminou `success`, mesmo com captura parcial. HTTP 200 na API pública mostrou 303 ofertas Shopee depois desta rodada. Nenhuma compra realizada.
- Recorrência ativa em `discover-shopee.yml`, flags GitHub `MONITORING_ENABLED=true` e `SHOPEE_CAPTURE_ENABLED=true`. Horários 09:25/21:25 UTC; cron pode atrasar conforme o executor. A pausa por loja e a exclusão mútua da conta são respeitadas. Não foi alterada a nota mínima 4 de aprovação automática.

### Correção de Qualidade da Pauta, Famílias e Drenagem de Triagem IA (09/11/2026)

- [x] **Diagnóstico confirmado em produção (`local` / `aff_local`):**
  1. **Saturação de bolsas e câmeras na Pauta e nas filas:** O departamento `bolsas` (`100016`) era o último a executar em `INITIAL_DEPARTMENTS`, gravando os 40 `observed_at` mais recentes. Como `product-family.ts` não classificava bolsas/mochilas nem câmeras de segurança (`family_key = null`), o teto `familyLimit` tratava cada item como família independente (`product:<id>`). Além disso, `composeLivePauta` usava pontuação em degraus largos (`triageScore * 20`) com desempate por `observed_at desc` e um bônus local `mlBonus = 10`, resultando em 7 câmeras + 2 mochilas na Pauta e 40 bolsas no topo do histórico.
  2. **Benefício da IA ausente nos cards da Pauta:** A triagem semântica passou a gravar `publicBenefit` em `curation_event.metadata.automation.publicBenefit`, mas `pauta-db.ts` lia apenas `aiScore`, deixando `benefit` vazio nos produtos aprovados automaticamente pela IA.
  3. **Fila de triagem represada (119 pendentes + 81 retidos pelo antigo piso):** A consulta `loadAutomatedTriageCandidates` executava o `lateral join` de histórico comparável antes do filtro `never_triaged / automatic_price_hold` e do `LIMIT`, levando ~24s só no SQL, e ignorava órfãos de lotes anteriores quando chamada com `--batch`. Além disso, em `evaluateProductsBatch`, o modelo primário com cota 429 esgotada sofria 3 retries a cada sub-lote de 25 itens.
- [x] **Plano de ação executado e verificado:**
  1. Expandido `packages/persistence/src/product-family.ts` (`v3`) com famílias `bolsas_mochilas`, `cameras_seguranca`, `relogios_smartwatch`, `garrafas_termicas` e `calculadoras`, com backfill em 73 produtos e 53 categorias canônicas no banco.
  2. Reordenado `INITIAL_DEPARTMENTS` em `packages/persistence/src/department-plan.ts` para que `bolsas` não seja o último departamento coletado.
  3. Aprimorado `composeLivePauta` em `packages/web/lib/pauta-policy.ts` removendo o `mlBonus` artificial, incorporando sinais finos de catálogo (nota, desconto válido, vendas) e aplicando diversidade progressiva por loja e por categoria/departamento, além de hidratar `publicBenefit`/`aiJustification` em `packages/web/lib/pauta-db.ts` e intercalar famílias no histórico recente da Pauta.
  4. Otimizado `loadAutomatedTriageCandidates` em `packages/web/lib/triage-candidates-db.ts` e o reuso do modelo ativo na cadeia de fallback em `packages/web/lib/ai-curation-service.ts`. Drenados 201 candidatos pendentes/retry em produção (`triageRunId: 1acca469-9694-458c-863a-3ee6e7e02e14`: 115 aprovados, 19 rejeitados, 67 anotados; `triage: 0`, `retry: 0` na Pauta) e verificada a seleção da Pauta (6 Shopee + 6 Mercado Livre em WhatsApp, 4 Shopee + 4 Mercado Livre em Stories, com no máximo 1 bolsa/mochila e todos os 12 itens com `benefit` preenchido).
