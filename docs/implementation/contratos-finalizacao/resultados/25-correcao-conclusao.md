# Correção da conclusão OS-19 — resultado OS-020 a OS-025

18/10/2026. **Parecer independente final CONFORME: BUG-001…012 verificados no escopo técnico local. Não há homologação integral nova no ativo.** O resultado original 19-conclusao-blueprint.md e a auditoria 19-auditoria-entrega.md permanecem preservados como evidência histórica.

O proprietário autorizou arquitetura e execução sequencial. [Plano e contrato complementar](../correcoes-19/PLANO-ENTREGAS.md), [ordens OS-020…025](../correcoes-19/OS-020.md) e [auditoria independente de contrato](../correcoes-19/AUDITORIA-CONTRATO.md). CT-01 foi corrigido antes da execução crítica e aprovado na contraprova. R-01/R-02 foram reconciliadas explicitamente pelo arquiteto, sem mudança unilateral do executor e sem reescrita das OS históricas.

## Baseline, fronteira e preservação

`main 43700c59f4e24f68f3a2e32c20ee5147fa4816cd` com alterações locais preexistentes. Manifesto inicial de 959 arquivos SHA-256 `f4fb6cbd2b4b952d53093c479465eaf7448acaaa82b131487b2feb87b701c2a9`, cópia em `/tmp/bizuminer-correcao-os19/before/`. Deltas são comparados com essa cópia, não atribuídos integralmente ao diff contra HEAD. Sem commit, reset geral, migrations, alteração de ACL ou ação operacional remota.

As ordens fecham a lista de escrita. Revisões de fronteira documentadas: helpers de publicação (CT-01), consumidores de continuação por navegador/dispositivo, decoder QR dev-only e expectativa exata de canais no teste contratual. `verified-workflows` regenerou o PNG histórico `execucao-19-story.png`; ele foi restaurado byte a byte da cópia inicial. Nenhuma alteração desse artefato pertence à entrega.

## Resultado por achado

O parecer independente inicial verificou dez IDs e manteve BUG-004/008 parciais. Revisão6 das OS aprovada antes da tentativa #2; os testes foram ampliados para o POST real e o header HTTP real429. O parecer inicial contrário e o adendo final CONFORME permanecem em [AUDITORIA-ENTREGA.md](../correcoes-19/AUDITORIA-ENTREGA.md). A contraprova independente aprovou também a tentativa #2; todos os doze IDs estão verificados localmente. Não se converte teste local em homologação no ativo.

| Achado | Ordem e correção | Verificação comportamental local |
|---|---|---|
| BUG-001 | OS-020, delimitador único por header | CSV BR chega ao ledger com 15050/1505 centavos e status/moeda corretos |
| BUG-002 | OS-020, data inválida/ausente rejeitada honestamente | Lote misto conserva válidas/digest determinístico e motivos por linha |
| BUG-003 | OS-020, header-only sem fallback recursivo | Ambos entrypoints terminam com preview vazio |
| BUG-004 | OS-021, resolução compartilhada e worker com tenant do lote | POST real→preflight RLS→batch→dispatch A/B sem env house; body não muda autoridade; worker/helpers/negativas preservados |
| BUG-005 | OS-021, conta local também revalidada | Local suspensa/ausência/revogação não retornam credenciais; rechecagem antes do adapter |
| BUG-006 | OS-022, sem segredo padrão/herança de env | Resolver ausente/null/revogado faz zero HTTP; assinatura com segredo próprio |
| BUG-007 | OS-022, nomes canônicos/alias e fábrica no entrypoint | Kits Telegram/Webhook aprovam/agendam/executam no worker oficial com HTTP mockado |
| BUG-008 | OS-022, helper compartilhado de retry | next_attempt_at +66s/+132s no Telegram; webhook429 com Retry-After600 persiste piso600s; unidade cobre data HTTP e fallback |
| BUG-009 | OS-023, ratificação unificada | 1/29 casos e amostra duplicada/estrangeira recusados; 30 casos aceitos; critérios/digests/eventos imutáveis |
| BUG-010 | OS-024, contenção de diretório e rejeição de symlink | put/get/exists negam prefixo irmão, absoluto e symlink; bytes externos preservados |
| BUG-011 | OS-024, presets Story/Feed/Banner e seleção no serviço | Dimensões 1080×1920/1080×1080/1200×628; QR decodificado nos três PNGs; serviço persiste formato/template |
| BUG-012 | OS-025, consolidação corrigida | REQ-DOM-05 volta à identidade/matching; documentação separa software local, evidência e ativação real |

## Verificações executadas pelo executor

| Comando | Resultado final |
|---|---|
| `npm test --prefix packages/web` | 425/425, zero falhas, exit0 (tentativa #2) |
| `npm test --prefix packages/persistence` | 36/36, zero falhas, exit0 |
| `npm test --prefix packages/capture` | 127/127, zero falhas, exit0 |
| `npm test --prefix packages/extension` | 16/16, zero falhas, exit0 |
| `npm test --prefix tools/editorial-tests` | 29 cenários, exit0 |
| `npm run test:cf-regressions --prefix tools/editorial-tests` | CF-01…CF-18, exit0 |
| `npm run typecheck --prefix packages/web` | exit0 |
| `npm run typecheck --prefix packages/persistence` | exit0 |
| `npm run build --prefix packages/web` | exit0, rotas compiladas/geração concluída |

Na primeira bateria final, apenas o teste que congelava a lista antiga de canais falhou; a fronteira OS-022 foi revista e a lista exata atualizada, preservando `deepEqual`. Repetição completa da suíte web: 424/424. Após os dois retornos do auditor, nova execução integral:425/425; typecheck/build web repetidos para o delta. Demais pacotes, CF e regressões já aprovados não foram repetidos sem mudança que justificasse.

Integrações novas executadas com `node --import tsx <arquivo>` a partir de `tools/editorial-tests`: `account-credentials-flow.test.ts`, `capture-route-flow.test.ts`, `official-channel-flow.test.ts`, `rubric-ratification-flow.test.ts`, `artifact-isolation-flow.test.ts`, todas exit0. Regressões específicas: financial, capture-batch, dispatch, rubric, cockpit, verified-workflows; todas exit0 nos respectivos resultados das ordens. Onboarding, entitlements, experimentos pareados e evidência de preço também são conferidos no fechamento. Logs e resultados brutos em `/tmp/bizuminer-correcao-os19/`; cada resultado de OS identifica seus comandos e limites.

Story/Feed/Banner com dados sintéticos foram renderizados; Feed/Banner inspecionados visualmente. O QR foi decodificado dos pixels finais com `jsqr` 1.4.0, dependência **apenas de teste**, fixada no lock. Não houve câmera física nem uso de imagem de terceiro sem licença.

## Fronteiras operacionais preservadas

- **Captura multicliente:** APIs autenticadas Shopee/AliExpress implementadas e testadas localmente. ML multicliente sem adapter autenticado contratado permanece explicitamente indisponível; ML local mantém consentimento/gates. Nenhuma credencial da casa é fallback para conta externa.
- **Canal oficial:** CLI/factory compatíveis, mas envio real exige canal/destino/segredo/aprovação persistida/kill switch configurados. Esta execução não promoveu canal nem iniciou workflows externos.
- **E3/rubrica:** testes sintéticos não ratificam política real nem substituem calibração e amostra autorizadas no ativo.
- **Onboarding e quotas:** platform_admin provisiona conta/plano; owner convida membership; aceitação associa identidade verificada. `maxActiveCampaigns` controla campanhas ativas, sem nova quota mensal ou cobrança real. R-02 é decisão contratual explícita, não alegação de implementação do enunciado antigo divergente.
- **HTTP privado:** 401 sem sessão, 403 sessão/conta não autorizada, 404 para artefato de outra conta/inexistente. RLS e hash reais foram testados na fixture; sessão Supabase, Storage gerenciado, pooler e navegação no ativo não foram homologados novamente.

Estado de execução: **CONCLUIDO no escopo técnico local das OS-020…025**, após parecer independente final CONFORME para os doze IDs. Os resultados completos das seis ordens ficam em `correcoes-19/RESULTADO-OS-020.md` a `RESULTADO-OS-025.md`. O Blueprint não recebe selo novo de conclusão integral no ativo a partir desta bateria local.

Retorno de entrega, tentativa #2: revisão6 de fronteiras aprovada pelo auditor de contrato; corrigidos exatamente o veto externo/gate house do POST e a perda de Retry-After do webhook. Evidências os21-*-retry2.log, os22-*-retry2.log, final-web-retry2.log, final-web-types-retry2.log e final-build-retry2.log. Sem novos requisitos, envio externo ou operação remota.

Fechamento independente: manifesto de 983 arquivos SHA-256 f4e512c932a6c3de4f789afdd57aa5c6cc444bb3cd083811050a4546221da391, zero drift na conferência do auditor. Parecer inicial NAO_CONFORME preservado e superado por contraprova da tentativa #2. Os seis resultados de OS e as consolidações foram atualizados após o parecer apenas para registrar este estado; nenhuma fonte ou teste mudou após o congelamento. R-01/R-02 reconciliadas; sete capacidades com correções locais delimitadas verificadas. Permanecem as limitações operacionais listadas acima, inclusive ML multicliente indisponível. Sem selo de homologação integral no ativo.
