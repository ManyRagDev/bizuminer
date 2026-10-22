# Auditoria independente dos contratos corretivos OS-020 a OS-025

18/10/2026; modo `contrato`; skill auditor-red-team v2.0. Baseline `main 43700c59f4e24f68f3a2e32c20ee5147fa4816cd` com alterações locais preexistentes. Revisão avaliada: contrato complementar revisão 1. Inspeção de contratos, auditoria original, consumidores, scripts reais e SQL/RLS local; sem execução remota ou alteração de produção/testes. Este parecer não é auditoria de entrega.

**Veredicto: NAO_CONFORME para iniciar OS-021 na revisão examinada.** Um impedimento de fronteira exige ajuste documental mínimo. OS-020 pode avançar; OS-022/023 não têm impedimento próprio identificado, mas conservam a dependência da OS-021.

## Achado obrigatório

| ID | Tipo / estado | Requisito e cenário | Evidência verificável | Correção mínima / responsável |
|---|---|---|---|---|
| CT-01 | `contrato` / confirmado | AC-021.3 e contrato complementar exigem mesma conta na persistência e revalidação antes de cada pedido, preservando o fluxo dos sweeps. Os helpers pós-captura estão protegidos pela lista de escrita. | `packages/persistence/bin/sweep-shopee.ts` chama `ensureShopeeAffiliateLinks`; este cria seu próprio `ShopeeAdapter` e repete `buildAffiliateLink(opts.credential,...)` em `packages/persistence/src/shopee-links.ts:84`, sem resolver por pedido. O helper e `src/aliexpress-links.ts:37` usam default `aff_local`, abrem conexão própria e fazem SQL sem `withMonitoringDb`. Alterar somente o Credential inicial no sweep não contextualiza essas conexões e não revalida a credencial entre chamadas do helper Shopee. Nenhum desses helpers consta no escopo de escrita OS-021. | Arquiteto inclui os dois helpers e testes pertinentes na OS-021; explicita seleção de affiliate da própria conta, SQL contextualizado em transações curtas e resolução/rechecagem antes de cada chamada de geração de link, fora da transação. Teste A/B deve atravessar também publicação/link e suspensão/revogação entre pedidos. Preservar o fluxo local. Alternativa só mediante exclusão explícita da geração de links multicliente e sem declarar seu fechamento; não retirar silenciosamente o passo existente. |

CT-01 não é novo BUG de implementação nem declaração de vazamento remoto: é uma incompatibilidade comprovável entre fronteira autorizada e comportamento contratado. Vincula-se ao fechamento de BUG-004/005. Zero tentativas de correção avaliadas.

## Conformidade das demais fronteiras

| Ordem | Parecer de contrato |
|---|---|
| OS-020 | Aceites cobrem delimitador, data, digest, arquivo vazio e ledger; caminhos e comandos existem. Não exige redesign financeiro. |
| OS-021 | Extração da criptografia para persistence preservando AES-GCM/AAD/envelope tem fronteira real. Worker deve usar tenant explícito em todos os métodos do store; `CaptureBatchStore` já aceita o parâmetro. Triagem já aceita `--tenant`, que o chamador autorizado pode propagar. Não há necessidade demonstrada de abrir esses arquivos à escrita. CT-01 impede o avanço desta versão. |
| OS-022 | Lista comporta canal canônico/alias, factory aprovada, CLI, payload congelado e helper de retry; mantém aprovação, marker, kill switch e unknown sem retry. Resolver é contextualizado no CLI e não herda ambiente. Integração deve demonstrar essa composição real, não apenas factory isolada. |
| OS-023 | Ambos os caminhos e os respectivos serviços estão autorizados; membership owner atual, 30–50 casos, critérios/método congelados, digest e evento transacional são aceites observáveis. Nenhuma necessidade de migration demonstrada: `governance_decision.method` e payload existentes permitem snapshots versionados. |
| OS-024 | Contenção real de diretório, symlinks, três presets explícitos e HTTP 401/403/404 têm fronteiras/testes autorizados. R-01 é reconciliada de forma explícita e preserva ocultação entre contas; não altera retrospectivamente a OS original. |
| OS-025 | Separa evidência local de homologação no ativo e restaura identidade de REQ-DOM-05. R-02 é reconciliação contratual explícita sob a autorização do proprietário: preservar provisionamento separado, convite de membership e campanhas ativas; não alegar cumprimento literal dos aceites originais divergentes. Auditoria seletiva é condição anterior ao fechamento dos BUGs. |

R-03 permanece melhoria opcional; R-04 permanece limitação ambiental. Não converter estas referências em defeitos obrigatórios.

## Baseline documental congelada

SHA-256 da versão examinada:

```text
PLANO-ENTREGAS.md 75b2981b8bd1449f4f2a646d25c5337155c10168968d66dca987966f92997333
OS-020.md e8847953ec4102facf14c33a32b4b2030f220612f086e66980212685419c5ddb
OS-021.md da385640765b6a0838d31c760d3f918ca1f66a9ebb099a483fb52dd82bcd17c6
OS-022.md 22d0263387a3c3d5e65513959d72599cfea55047bc4f03ee85e8e31e222e419b
OS-023.md 331d2e8f8ec24e8212dca83f678b8881170bffc5a24ef7c8ca1a7ba30de6728d
OS-024.md 46a2cdf22f3775a2c54ca8ff4519c6ed2848a738dd610e975d9f2f6c68dbcd64
OS-025.md 26460ad0ad2e392362b95d715ef1b36219f064b98ea932e4b321b9dc1d55a349
```

Verificações independentes nesta etapa: `git status`, branch/HEAD, leitura dos contratos/código/SQL e `sha256sum`; não foram reexecutadas as suítes de entrega, pois esta etapa julga a viabilidade contratual anterior à implementação. Nenhuma API de captura/envio foi chamada. Foi consultada a [documentação oficial de RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), que distingue privilégios de tabela de políticas por linha; isso não certifica runtime do projeto. A página de monitoring-and-debugging retornou erro de acesso pelo navegador.

Para liberação: revisar apenas CT-01, apresentar a revisão ao auditor e manter o encadeamento sequencial. Sem autorização adicional de operações remotas, deploy, migration ou ativação de canais.

## Adendo — contraprova CT-01, revisão corretiva 2

18/10/2026; mesmo HEAD. Leitura independente restrita ao achado CT-01 e às versões revisadas do plano e OS-021. O parecer e hashes anteriores acima permanecem como histórico da revisão 1.

**Veredicto contratual após a revisão: CONFORME. CT-01 verificado e encerrado na revisão 2.** A OS-021 agora autoriza explicitamente `packages/persistence/src/shopee-links.ts` e `packages/persistence/src/aliexpress-links.ts`; AC-021.3 obriga affiliateId da própria conta, sem default house para conta externa, SQL sob `withMonitoringDb`, revalidação de segredo/conta antes de cada geração Shopee e I/O fora da transação. A integração `account-credentials-flow.test.ts`, autorizada, inclui as publicações; AC-021.4 conserva A/B e suspensão. O plano registra a alteração e mantém a ausência de operações remotas autorizadas.

Essa alteração resolve a incompatibilidade de fronteira apontada. O teste de entrega deverá simular suspensão/revogação entre pedidos no helper Shopee para comprovar a revalidação por pedido já contratada; não basta verificar a credencial inicial do sweep. Nenhum BUG-004/005 foi fechado por esta revisão documental.

Hashes SHA-256 da contraprova:

```text
PLANO-ENTREGAS.md f543677183ce258814e91e2e3a9d9b1dc3307ad3aa59e0fc1fe1e06f5f666c7d
OS-021.md 76e148bc6f13202c6712e0cc894e8f5a73f8f6c2becb91cefa0a57c6a56e14be
```

Liberação para implementação sequencial das ordens conforme a autorização existente, dependências e escopos. Esta contraprova não certifica implementação, testes de runtime nem homologação no ativo; a auditoria seletiva de entrega permanece obrigatória antes de fechar os BUGs.

## Adendo — revisão 6, retorno seletivo BUG-004/008

18/10/2026; modo `contrato`, mesma baseline. **CONFORME para a tentativa #2 restrita a BUG-004 e BUG-008.** Leitura de PLANO-ENTREGAS revisão6 e AC-021.5/AC-022.5 após o parecer de entrega, sem alterar contratos ou produção.

AC-021.5 fecha precisamente a lacuna observada: handler real com auth/transporte injetados, preflight real com SQL/RLS, A/B sem credencial house no ambiente; contexto autorizado antecede resolução e os casos negativos não criam/despacham lote. O arquivo `tools/editorial-tests/capture-route-flow.test.ts` está expressamente autorizado; resolver e rota já estavam no escopo. Preserva flags, consentimento, ML externa indisponível e códigos de erro seguros. A composição deve manter o preflight real nos testes; substituir a função inteira por um sucesso artificial não satisfaz esse aceite.

AC-022.5 cobre o mesmo piso do429 omitido pelo adapter: header segundos/data HTTP, fallback30 para ausente/inválido e teste de600 segundos no `next_attempt_at` real persistido; os arquivos de adapter e integração já estão autorizados. MaxAttempts/unknown permanecem preservados. Não se exige operação remota ou novo componente.

Hashes SHA-256 da revisão examinada:

```text
PLANO-ENTREGAS.md 4915f3f55f74d3c3ebd0ce72bbd04b413ade5cf8eedc66820eeb54fc8b718145
OS-021.md f36bdef8e7003cdc80dc7140e22bdccf6917ffe1a68ff2898256fccd57293eb0
OS-022.md 4eb99d3aed408a8802ea7180dbf076ca71b8556b706b1112175188d627deef46
```

Próxima etapa autorizada: implementar sequencialmente e apresentar versão congelada para contraprova dos mesmos004/008; o parecer de entrega inicial permanece válido para seu manifesto anterior. Uma segunda tentativa de correção sem fechamento requer reinvestigação antes de terceiro patch, como já registrado no plano.
