# 27 — Migrations substitutas e verificação da candidata

15/10/2026. **A candidata substituta foi implementada localmente e aprovada para ensaio isolado pelo auditor independente GPT-6.1 Sol, raciocínio Alto. Não foi aprovada nem aplicada no banco de produção.** Esta rodada materializa a preparação local da entrega2 do [plano24](24-CAMINHO-SEGURO-PARA-CONCLUSAO.md); sua homologação operacional continua pendente. Os [contratos e objetivos originais25](25-ADERENCIA-AO-PLANO-ORIGINAL.md) permanecem normativos.

## Resultado e motivo da substituição

Foram gerados três SQLs novos, com timestamps obtidos pelo Supabase CLI, em `packages/persistence/supabase/rollouts/v2/`. Eles substituem explicitamente as onze migrations originais ainda pendentes para o estado parcial conhecido. As três instalações anteriores são pré-condições preservadas, não etapas para reaplicar no ativo. Os quatorze arquivos históricos não foram alterados nesta rodada.

A M2 original misturava a preparação de dependências com a troca de permissões antes de todas as leituras públicas estarem disponíveis. Movê-la intacta para o fim também apagava regras especializadas. A substituição separa preparação, expansão e restrição final; não é apenas uma renomeação nem uma tentativa de reenviar a operação rejeitada por outro transporte. Nenhuma solicitação remota foi feita nesta rodada.

| Ordem | Nova unidade | Resultado observável |
|---|---|---|
| A | [Fundação](../../packages/persistence/supabase/rollouts/v2/20261015194719_garimpa_v2_foundation.sql) | Confere a base conhecida, cria o papel público restrito, helpers e controle administrativo persistido inicialmente desligado. Mantém as policies e leituras legadas. |
| B | [Expansão](../../packages/persistence/supabase/rollouts/v2/20261015194748_garimpa_v2_expansion.sql) | Instala contratos comerciais e projeções públicas completas antes de restringir o legado. As 37 tabelas comerciais novas têm bloqueio restritivo enquanto o controle estiver desligado. Preserva regras específicas e acrescenta compatibilidade do monitoramento existente. |
| C | [Corte delimitado](../../packages/persistence/supabase/rollouts/v2/20261015194759_garimpa_v2_scoped_cutover.sql) | Confere a expansão e seus privilégios, substitui somente as 28 policies legadas enumeradas e conserva as especializadas. Liga o controle no fim da mesma transação, exigindo exatamente uma linha atualizada. |

Em linguagem comum: A prepara a infraestrutura sem desligar a operação atual; B acrescenta as estruturas necessárias mantendo as capacidades novas bloqueadas; C troca as regras antigas de acesso depois de comprovar a compatibilidade dos consumidores. **C ainda altera policies**, porque separar os dados das contas exige regras de acesso, além da organização dos registros. A mudança limita quais regras podem ser substituídas e quando isso pode acontecer.

Nenhuma tabela de negócio é apagada para recuperar uma execução. Não foram fabricados vendas, comissões, calibrações, aprovações editoriais, direitos ou termos comerciais. Operação própria e SaaS usam os mesmos contratos e o mesmo motor; o controle técnico não concede liberação comercial.

## Identidade da candidata

| Unidade | SHA-256 |
|---|---|
| A | `579fa86e8696d7bfcee701ed61e6c8b43b9538dfafa93f146883633bd3682c57` |
| B | `e2c2dc82c2a9fd562d326f68414bf7337541f86cfc26c5126e36a11e88a75611` |
| C | `28e08ebbb89d4d453eb0149d93f22d0e4084ea93e3ca60a87b38a5963367fa8b` |

O [manifesto de rollout](../../packages/persistence/supabase/rollouts/v2/manifest.json) registra ordem, dependências, hashes dos três arquivos instalados, dos onze substituídos, das fontes de compatibilidade e dos envelopes transacionais. `sealed=true` indica integridade do pacote local, **não** aprovação de produção; `productionApproved=false` permanece explícito.

O catálogo de expansão capturado em PostgreSQL17.6 tem digest `c5be5467176006212661059da04977ac15128aa439844599d238a342e97c377e`, vinculado ao manifesto e ao cabeçalho de C. O gerador é uma ferramenta local de preparação: não deve ser executado durante implantação. Uma alteração em A/B exige nova captura e novo selo; mudança de bytes exige nova conferência do parecer.

C confere inventário e definições completas de funções, incluindo overloads, STRICT, owner, configurações e ACL; views e opções; tabelas, owner, RLS/FORCE e ACL; constraints novas/alteradas e validação; estrutura de todas as FKs; triggers instalados pela cadeia e seu estado. Verifica também herança de roles, SET ROLE efetivo, USAGE do schema e privilégios diretos/por coluna de relações privadas, inclusive views. O corte falha antes de remover policies se encontrar divergência.

## Integração com o código

`packages/web/lib/commercial-rollout.ts` lê exclusivamente o controle do banco. Ausência ou falso nega as novas capacidades; ambiente e GUC não o substituem. Os serviços de workflow comercial, financeiro, governança, experimentos, artefatos, kit, dispatch e onboarding usam esse guarda. Os caminhos diretos de provisionamento/aceite e as entradas de IA/revisão humana também foram protegidos. O CLI de dispatch testa o controle antes de importar/construir o adapter externo. Não basta esconder botões.

`public-offer-db.ts` somente seleciona as projeções quando as nove funções, a role, SET/USAGE e as permissões necessárias estiverem presentes. A verificação não cria links nem cliques como sonda. As leituras públicas e destinos monetizados foram exercitados em B, em C e após desligar o controle.

A auditoria encontrou uma dependência real do cron de monitoramento: consultas sem contexto e contagens de interesses de compradores. Foi criada `packages/persistence/src/monitoring-db.ts`; o worker abre transação com tenant e identidade de trabalhador, sem se passar por owner. `monitor-prices.ts`, `monitoring-plan.ts` e a persistência contextualizam as operações de banco, mantendo chamadas ao marketplace fora da transação.

B inclui três contratos privados mínimos: agregados de interesses por produto, estado da própria conta/política e registro idempotente de skip com motivo conferido. Eles preservam monitoramento durante expansão e depois de C, sem liberar favoritos/alertas individuais ao worker. O cron da casa mantém seu caminho; execução externa para outra conta é negada até existir resolução comprovada das credenciais da conta. Isso evita usar credenciais da casa em um tenant SaaS; não muda a decisão de manter ambos os negócios.

Há CLIs manuais ainda sem demonstração de compatibilidade com C: `backfill-family.ts`, `curate-initial-catalog.ts`, `seed-house-marketplace-config.ts` e `bootstrap-affiliate-house.ts`. Não foi afirmado que todos os escritores estão validados. O inventário operacional deve identificar quais permanecem suportados, corrigir/testar esses ou retirá-los expressamente do procedimento antes do corte. O cron corrigido não serve como prova desses scripts.

## Verificação e evidências

O ensaio final em **PostgreSQL17.6 nativo descartável** concluiu 23 verificações e seis aplicações locais, todas PASS, nos hashes acima. Usou duas conexões reais `garimpa_app`, sem superuser/BYPASSRLS, além da conexão administrativa separada. O servidor foi encerrado e removido no fim. Evidência: [resultado nativo final](evidencias/execucao-27-replacement-native.json).

Foram provados: S0 sem instalação; A preservando legado; B com falha injetada no fim e rollback integral; retomada; continuidade pública/monetização; bloqueio efetivo no backend/SQL/definer; desvios de policy, privilégios, view, função, role, singleton, RLS, FK e trigger; preservação integral de policies especializadas; A/B/A e limpeza de contexto; separação operator/owner; reativação da plataforma; monitoramento agregado, suspensão e skips idempotentes; corrida da última quota e do convite; recuperação conservando isolamento e público.

O [parecer independente27](27-AUDITORIA-INDEPENDENTE-ROLLOUT.md) registra revisão por hash, nove contraprovas próprias e exercício dos serviços reais de monitoramento em banco isolado. Seus achados intermediários foram corrigidos antes do congelamento dos SQLs atuais. A aprovação tem escopo de ensaio, sem autorização do ativo.

O fechamento amplo está em [checks finais](evidencias/execucao-27-fechamento-checks.json): 21 suítes SQL, 379 testes web, 35 testes de persistência, typechecks web/persistência e build web. O [consolidado](evidencias/execucao-27-verificacao-final.json) registra os resultados finais por comando e as limitações. As fixtures completas comerciais usam a cadeia substituta; diagnósticos de estados parciais e upgrade histórico continuam explicitamente separados. Não certificam a ordem antiga para produção.

O [verificador local](../../tools/editorial-tests/verify-replacement-rollout.ts) valida selo, hashes, fontes históricas, catálogo e envelopes; não conecta nem aplica SQL. O [manifesto dos artefatos27](evidencias/manifesto-execucao-27.json) permite identificar os arquivos desta conferência. Falhas de ambiente e asserções intermediárias estão registradas separadamente; o JSON nativo final substitui a execução anterior do mesmo script, sem inventar um log bruto que não foi preservado.

## Limites e impedimentos para produção

1. **Reconferência remota indisponível nesta rodada.** O MCP inicialmente falhou na renovação OAuth e suas ferramentas foram removidas da sessão. Não foi usado transporte alternativo. O último snapshot real é [round26, 13:45:44 UTC](evidencias/mcp-26-r26finalSql.json): 1.657 produtos, 9.146 observações, 1.494 publicações, 712 cliques, zero segredos, 29 policies e duas constraints autorais validadas. É referência histórica; não congela o banco nem identifica o deployment.
2. **Baseline local reconstruído, não dump integral.** A fixture contém `seed_product_curation()`, mas não instala seu trigger legado de seed. A semântica integral dos triggers e ações/defaults legados, inclusive ON DELETE não capturado, precisa ser conferida no alvo. O selo de triggers demonstra os instalados pela cadeia ensaiada. Não ajustar o banco real para imitar a fixture.
3. **Staging Supabase ainda não homologado.** Os ensaios não comprovam Auth, Storage, Supavisor, configurações nem volume/locks reais. A criação/conferência do bucket privado de B só é executada onde existe o schema Storage; o PostgreSQL descartável não o possui. A tentativa histórica de criar staging não criou recurso, por ausência das ferramentas de confirmação de custo.
4. **Deployment e escritores publicados ainda não identificados.** Build e testes locais não provam qual versão está servida. A versão compatível, seus workers/extensão e o inventário de manutenção precisam passar em S0–S3 antes de C. Isso inclui os CLIs manuais acima.
5. **Recuperação operacional ainda depende do ambiente.** Snapshot/backup, artefato compatível de contingência, teste de restauração e observação da operação existente precisam ser demonstrados em staging, com isolamento de outros produtos do banco compartilhado.
6. **Aprovação de produção não concedida.** A autorização humana persiste condicionada à decisão técnica. O auditor aprovou somente ensaio isolado. Uma futura aplicação exige alvo confirmado, baseline real compatível, homologação e parecer correspondente aos bytes exatos, além da revisão automática aplicável.

Não foram feitos deploy, SQL remoto, envio, convite externo ou criação de recurso pago nesta rodada. A rejeição automática histórica da M2 original continua válida e não foi contornada. Não houve nova rejeição automática de aplicação desta candidata, pois não foi solicitada aplicação.

## Sequência de retomada e recuperação

1. Conferir o pacote com `npm run rollout:verify --prefix tools/editorial-tests` e reconciliar, por leitura, o alvo e as três instalações prévias. Nunca `db push` da pasta histórica inteira.
2. Identificar deployment/escritores, obter staging isolado e recuperação verificável. Conferir o catálogo real, incluindo os triggers legados. Uma diferença exige análise e nova candidata/auditoria quando necessária; não flexibilizar o preflight para fazê-la passar.
3. Ensaiar A e B, uma transação integral por unidade, com `lock_timeout=5s` e `statement_timeout=45s`. Conferir legado, público, autores, comprador e bloqueio V2; conservar controle falso.
4. Publicar a versão compatível no ensaio, atualizar/encerrar escritores anteriores e testar os fluxos com Auth/Storage/pooler. Comprovar a compatibilidade antes do corte.
5. Ensaiar C e conferir S3, isolamento e concorrência; desligar administrativamente o controle para provar recuperação sem reabrir dados. Registrar artefatos/hashes e SELECTs de catálogo/dados antes/depois. O parecer27 lista consultas concretas.
6. Submeter o resultado para decisão de produção por hash. Somente então executar a promoção correspondente, registrar versões remotas e reconferir catálogo, dados e operação.

Uma falha exige confirmar rollback/histórico antes de retomar; os arquivos não são scripts para repetição cega. Após C, a recuperação preserva isolamento e estruturas, desativa as capacidades novas pelo controle administrativo e usa um artefato compatível. Não restaurar policies globais nem voltar ao código sem contexto. Os gates E3/rubrica/financeiro/direitos/canais/experimentos/piloto continuam individuais, conforme o plano original.
