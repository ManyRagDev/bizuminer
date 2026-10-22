# Status de execução — BizuMiner V2

## Atualização de 21/10/2026 — Plano Unificado e Bancada de Trabalho Concluída

**Cadeia burocrática de OSs encerrada e substituída por plano técnico unificado.** A Bancada de Trabalho Unificada do Operador foi implementada e integrada de ponta a ponta (`packages/web/lib/workbench-contract.ts`, `packages/web/lib/workbench-db.ts` e `packages/web/app/admin/today-command-center.tsx`), entregando uma fila prioritária consolidada por produto âncora com cálculo de `actionableSince` e isolamento multi-tenant estrito via RLS.

Os três gargalos de navegação foram definitivamente sanados:
- **BUG-014:** Suporte canônico a `radar` e `direcionamento` em `admin-query-aliases.ts`, impedindo redirecionamento espúrio para a seleção geral.
- **BUG-015:** Destaque correto no shell de navegação (`admin-shell.tsx`) para as rotas `/admin/onboarding` e `/admin/governanca`.
- **BUG-016:** Transporte completo de `opportunityId`, `channel` e `audienceKey` do `radar-view.tsx` para `campanhas/page.tsx` e pré-preenchimento no `workspace.tsx`.

Verificação integral: **443/443 testes web**, **40/40 testes de persistência**, **29 cenários de integração editorial**, **4/4 testes de fluxo da bancada (PGlite/Postgres)**, typecheck e build Next.js com zero falhas. Nenhuma migration foi aplicada em produção.

## Atualização de 20/10/2026 — levantamento e contratos de conclusão

**Núcleo com implantação comprovada; correções recentes locais e conclusão integral ainda pendente.** O [levantamento atual](diagnosticos/estado-atual-2026-10-20/DIAGNOSTICO.md) separa implementação, instalação, homologação e ativação. BUG-021 fechou localmente na [auditoria OS-037](contratos-fluxo-unico/AUDITORIA-OS-037.md), desbloqueando a OS-029. OS-029/030/031/033 continuam sem resultados de conclusão; OS-030 cobre BUG-014–016.

O [plano de conclusão de 20/10](contratos-conclusao-2026-10-20/PLANO-ENTREGAS.md) reutiliza essas quatro ordens e adiciona OS-038–048 para provas nativas, candidata/implantação, homologação por capacidade e reconciliação final. **Somente contratos foram preparados nesta rodada**; nenhuma nova execução, migration, promoção, envio, convite ou deploy está autorizada por eles. Testes do levantamento: web 438/438 e persistence 40/40 em ambiente permitido; integrações locais verdes, com limites nativos/autenticados explícitos. Produção não foi novamente consultada no levantamento; último fechamento examinado é OS-10 de 16/10.

As atualizações datadas abaixo permanecem como histórico de suas rodadas. Não usar bloqueio antigo de staging/M2 ou status anterior da OS-037 como estado vigente.

## Atualização de 18/10/2026 — correções OS-020 a OS-025

**Correções técnicas locais implementadas; conclusão integral no ativo não certificada.** A auditoria da OS-19 encontrou BUG-001…012. O proprietário autorizou arquitetura e execução sequencial; ordens e critérios estão em [correcoes-19/PLANO-ENTREGAS.md](contratos-finalizacao/correcoes-19/PLANO-ENTREGAS.md), com auditoria independente de contrato e revisão de fronteira aprovada.

Parser, credenciais/isolamento dos workers, adapters oficiais/retry, ratificação e armazenamento/formatos receberam correções e testes locais. Resultado consolidado e verificações em [25-correcao-conclusao.md](contratos-finalizacao/resultados/25-correcao-conclusao.md). Parecer independente final [CONFORME no escopo técnico local](contratos-finalizacao/correcoes-19/AUDITORIA-ENTREGA.md), após contraprova da tentativa #2: BUG-001…012 verificados; OS-020…025 concluídas localmente. Nenhum deploy, migration, convite real ou envio externo foi executado nesta correção.

- **Implementação/teste local:** evidências por ordem em correcoes-19; bateria final registrada no resultado consolidado.
- **Homologação no ativo/ativação:** não inferida de testes sintéticos. APIs/canais, calibração/ratificação reais, ML multicliente e gates comerciais permanecem explicitamente condicionados à capacidade/destino autorizados.
- **Contratos reconciliados:** C-09 mantém 401/403/404 sem revelar artefatos de outra conta; onboarding preserva provisionamento de conta/plano separado de convite de membership; quota é maxActiveCampaigns. Nenhuma quota mensal nova foi criada.
- **Histórico:** [19-conclusao-blueprint.md](contratos-finalizacao/resultados/19-conclusao-blueprint.md) permanece como resultado original do executor, com sua declaração de fechamento contestada por [19-auditoria-entrega.md](contratos-finalizacao/resultados/19-auditoria-entrega.md). A declaração anterior de 100% não representa o estado vigente.

---

## Atualização operacional de 16/10/2026 — OS10 (Histórico de Rollout do Núcleo)

## Registro anterior preservado — não representa o estado atual


**Atualização33 — 16/10/2026:** o proprietário esclareceu que é o único usuário do BizuMiner e não há usuários externos ativos. O auditor reavaliou o risco e concedeu [aprovação técnica condicional para rollout direto](33-REAVALIACAO-DE-RISCO-E-ROLLOUT-DIRETO.md) dos mesmos hashes31, dispensando staging pago como condição obrigatória. Exige backup recuperável seletivo, pausa somente dos processos BizuMiner, aplicação A/B, publicação de web/writers compatíveis, C e verificações antes de reabrir. Não há defeito SQL novo identificado; essas pré-condições ainda precisam ser cumpridas. Nenhuma migration/deploy foi executada nesta análise. As perguntas32 de permissões de provisionamento e orçamento de US$1 deixam de ser pré-condições desse caminho. O login Google permanece como está.

**Atualização32 — 16/10/2026:** configurada conexão oficial separada `supabase-management` para resolver a ausência das ferramentas de custo/provisionamento no MCP limitado ao projeto. A revisão automática exige concordância explícita com `organizations:read`, `projects:read`, `projects:write`; a tentativa reduzida foi bloqueada antes da execução. Solicitados os escopos e a escolha entre opção gratuita ou orçamento temporário de até US$1, sem mudança de plano. [Registro32](32-DESBLOQUEIO-DO-PROVISIONAMENTO.md). Login Google do aplicativo preservado; pacote31 sem alteração de runtime/SQL. Staging continua ausente e nenhuma nova escrita em produção foi feita.

**Atualização vigente — rodada31:** acessos Supabase MCP e Vercel MCP/CLI confirmados por leituras reais; produção identificada no commit43700c59. A reconciliação encontrou defaults de privilégios omitidos na fixture e permitiu corrigir A/B/C antes de qualquer aplicação remota. As novas tabelas/view recebem somente os privilégios explícitos previstos, preservando os controles legados.

[Relatório31 e retomada](31-RECONCILIACAO-E-PACOTE-DE-HOMOLOGACAO.md), [auditoria31](31-AUDITORIA-INDEPENDENTE-RECONCILIACAO.md), [pacote de fontes](evidencias/execucao-31-release-fontes.json). Candidata selada59fontes: A33e037, B028103, C111498. Native39PASS, operacional21PASS, 21suítesSQL, web379PASS, testes/typechecks dos quatro pacotes e buildNode24PASS. Reruns ambientais e resultados intermediários estão preservados. Nenhuma nova migration/deploy/push/secret/contratação nesta rodada; produção ainda não aprovada.

**Impedimento atual:** não há staging identificado. A criação de branch foi interrompida pelo servidor Supabase, que exige confirmação de custo por get_cost/confirm_cost, ferramentas ausentes nesta conexão. É necessário disponibilizar projeto/branch isolado com custo aceito no dashboard ou habilitar as ferramentas requeridas. Depois: Auth/Storage/pooler e recuperação → S0–S3 com deployments/writers → parecer técnico de produção → promoção. O preview Vercel atual não tem isolamento de banco demonstrado. A autorização humana anterior persiste; não falta uma nova autorização geral para migrations.

## Registro da rodada28 — histórico

**Atualização histórica — 15/10/2026, rodada28: reparos locais implementados e conferidos; implantação impedida por acesso/homologação.** Ver [finalização e inventário28](28-FINALIZACAO-LOCAL-E-INVENTARIO-OPERACIONAL.md) e [parecer28](28-AUDITORIA-INDEPENDENTE-FINALIZACAO.md). B/C receberam novos hashes por regressões reais de captura/pareamento encontradas na revisão; os bytes27 foram preservados. O pacote atual exige B antes da publicação do backend compatível.

Passaram 26 verificações da cadeia + seis aplicações locais, 21 verificações operacionais, 21 suítes SQL, 379 testes web, 36 de persistência, typechecks e build. Backfill ficou contextual; bootstrap/config exigem conexão administrativa explícita e --apply; quatro rotinas legadas perigosas foram retiradas antes de conexão. Captura manual/navegador/extensão/dispositivos e autoridade herdada foram corrigidos. O auditor aprovou a candidata58fontes somente para ensaio isolado.

Acesso atual: zero ferramentas MCP Supabase; Vercel403 no projeto/equipe vinculados; nenhum staging comprovado. GitHub confirmou cron no HEAD43700c59, mas comparações de fontes mostram que ele não contém os reparos locais. Não houve SQL remoto, push/deploy, dispatch de job, alteração de secret ou recurso pago. A autorização humana persiste condicionada à decisão técnica; produção não foi autorizada. Próximo passo é disponibilizar acessos e homologar os artefatos exatos em staging antes da promoção. A execução automática multicliente continua condicionada à resolução validada de credenciais por conta, sem fallback para a casa.

## Registro da rodada27 — histórico

Atualizado em 15/10/2026, rodada27. **Candidata substituta implementada e aprovada para ensaio isolado. Produção ainda não autorizada nem alterada nesta rodada.**

Foram criadas três unidades novas A → B → C em `packages/persistence/supabase/rollouts/v2/`, com manifesto selado: preparação sem remover policies legadas, expansão completa com capacidades novas bloqueadas e corte explícito de 28 policies preservando as especializadas. Substituem as onze originais pendentes; os quatorze arquivos históricos e as três aplicações remotas anteriores foram preservados. A M2 original continua reprovada e não foi reenviada.

Conferência atual: [relatório27](27-MIGRATIONS-SUBSTITUTAS-E-VERIFICACAO.md), [auditoria independente27](27-AUDITORIA-INDEPENDENTE-ROLLOUT.md) e [guia das novas migrations](../../packages/persistence/supabase/rollouts/v2/README.md). O auditor GPT-6.1 Sol, raciocínio Alto, aprovou os hashes exatos **somente para ensaio isolado**. O ensaio final PostgreSQL17.6 passou 23 verificações mais seis aplicações locais; fechamento amplo e evidências estão no relatório27. Isso supera a pendência local de gerar a sequência substituta registrada na rodada26, sem transformar testes locais em homologação de produção.

O backend nega novas capacidades enquanto o controle persistido estiver ausente/falso; o monitoramento existente recebeu contexto e helpers agregados privados, sem impersonar owner nem expor compradores. O CLI nega usar credenciais da casa para executar outra conta. Permanecem sem demonstração após C quatro CLIs manuais de manutenção/bootstrap, explicitados no relatório. A versão publicada e todos os escritores ainda precisam de inventário verificável.

**Impedimentos de implantação:** reconferir o alvo por MCP, homologar Supabase staging com Auth/Storage/pooler e catálogo real (incluindo trigger legado de seed), identificar/publicar artefatos compatíveis, validar escritores e recuperação S0–S3, obter decisão técnica de produção. O MCP falhou na renovação OAuth e suas ferramentas foram removidas da sessão; não houve nova leitura/escrita remota nem transporte alternativo. O último snapshot remoto26 é histórico. Nenhum staging, deploy, convite externo, venda sintética ou envio foi feito nesta rodada.

A autorização humana anterior permanece condicionada à aprovação técnica. A condição de produção não foi satisfeita pelo parecer de ensaio. Retomada: executar as condições do relatório27 e do plano24; não executar a pasta histórica por ordem alfabética, não fazer `db push` nem reenviar M2 intacta. Os gates comerciais originais continuam por capacidade, para operação própria e SaaS.

## Registro da rodada26, preservado como histórico

A cadeia antiga foi reprovada no banco ativo; dez verificações nativas e 21 suítes SQL reproduziram os defeitos da M2 inicial e tardia. Naquela rodada não havia candidata substituta e staging não foi criado por depender de ferramentas de confirmação de custo indisponíveis. Ver [relatório26](26-VERIFICACAO-NATIVA-E-IMPEDIMENTOS-DE-IMPLANTACAO.md). Esse registro não descreve a candidata local nova.

## Registro da rodada23, preservado

Estado atual: [correções e aplicação 23](23-CORRECOES-AUDITADAS-E-APLICACAO-SEGURA.md), [auditoria independente 22 com adendo por hash](22-AUDITORIA-INDEPENDENTE-MIGRATIONS.md). Rodadas19/21 permanecem históricas. O usuário autorizou a aplicação condicionada à aprovação do auditor; essa condição foi atendida apenas para o complemento autoral independente.

| Item | Estado confirmado |
|---|---|
| Auditor solicitado | Subagente GPT-6.1 Sol, raciocínio Alto; revisão de SQL, código e catálogo real |
| Projeto Supabase | `spbuwcwmxlycchuwhfir`, banco ativo; não é staging |
| Migration original 1 | Aplicada; MCP `20261015034755`; não reaplicada |
| Proteção complementar de segredos | Aplicada; MCP `20261015035126`; não reaplicada |
| Novo complemento de autoria | APROVADO isoladamente pelo auditor, aplicado e conferido; MCP `20261015041540` |
| Original 2 / RLS amplo | REPROVADA para ordem/runtime atuais; rejeição automática anterior mantida; não reenviada |
| Originais 3–12 | CONDICIONAIS após reparos locais; nenhuma aplicação nesta rodada |
| Estrutura local | 12 originais + 2 complementos; 14 arquivos; 11 originais ainda pendentes |
| Correções locais23 | Login sob RLS, autoria/joins cross-home, integridade conta/tenant em convites/planos/progresso/lifecycle, tentativa/job e prontidão pública completa |
| Verificação local23 | 379 testes web, 21 suítes SQL, typecheck web e build aprovados; rerun nativo resolveu restrições do sandbox sem alterar código |
| Pós-conferência do banco | Duas novas FKs validadas, antigas ausentes; zero órfãos; contagens, 29 policies e 317 registros de grants preservados |
| Runtime/público | Role real garimpa_app em READ ONLY preservada; home com mesmo título e 24 links; sem finding de segurança garimpa no advisor |
| Deploy/homologação | Nenhum deploy; staging não identificado; Auth/Storage/sessões independentes ainda não homologados |

A aprovação estreita foi aplicada com `lock_timeout=5s` e `statement_timeout=45s`; não altera policies/grants nem instala parte do isolamento rejeitado. [Aplicação e pós-condições](evidencias/mcp-23-resultado.json), [testes e limites](evidencias/execucao-23-verificacao-final.json), [manifesto dos arquivos](evidencias/manifesto-execucao-23.json).

A ordem atual restringe as leituras legadas antes das projeções completas M6/M8. É preciso preparar e ensaiar expansão, publicação compatível e ativação final do isolamento. O deployment atual não foi identificado: conector Vercel sem escopo e CLI sem credenciais. Não basta aplicar rapidamente os arquivos ou publicar apenas o código atual.

Próximo passo: fornecer/identificar staging isolado e cumprir os critérios do parecer 22 e da seção de retomada23; reavaliar a candidata antes da execução no ativo. Não usar `db push` sem reconciliar os timestamps locais/remotos. Não há falta de autorização humana geral: faltam condições técnicas verificáveis.

G-PRICE, G-RUBRIC, G-FIN, G-RIGHTS/G-PROGRAM, G-CHANNEL, G-EXPERIMENT e G-PILOT/G-PRIVACY/G-SEC permanecem por capacidade. Nenhuma venda sintética, envio, convite externo, cobrança ou ativação comercial foi realizada.
