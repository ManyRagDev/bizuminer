# Preflight para aplicação via MCP

15/10/2026. Pedido: aplicar a migration via MCP. Foram executadas somente consultas de identificação, histórico, branches e pré-condições; nenhuma escrita remota foi tentada.

## Resultado confirmado

- Projeto conectado: `spbuwcwmxlycchuwhfir`, URL `https://spbuwcwmxlycchuwhfir.supabase.co`.
- Branches retornadas pelo MCP: nenhuma. O ambiente conectado não foi comprovado como staging.
- Histórico remoto não contém nenhuma das doze migrations V2 de 14–15/10/2026.
- Schema `garimpa` tem 27 tabelas. `affiliate_account` e `editorial_assessment` existem. `comparison_review`, `price_evidence_policy_version`, `import_batch`, `policy_experiment`, `experiment_assignment`, `experiment_evaluation`, `audience_policy_version` e `dispatch_job` não existem.
- Funções `active_tenant(text)` e `prevent_tenant_mutation()` ausentes; bucket `bizuminer-private` ausente.
- Os hashes dos doze arquivos locais continuam iguais aos do catálogo da candidata 19.

A expansão `20261015021300_garimpa_verified_workflows.sql` não pode ser aplicada isoladamente nesse estado: seu ALTER de comparison_review e as demais dependências falhariam. Aplicar as onze anteriores constitui a sequência integral, com mudanças em RLS, funções, views, contas e modelo comercial; não se trata apenas da expansão final.

## Próxima ação a definir

Confirmar se o destino será staging isolado, conforme o plano aceito, ou se o usuário está autorizando explicitamente a sequência completa das doze no projeto conectado, incluindo o banco em uso. Não criar branch com custo nem alterar o projeto principal por suposição. Depois da definição, revalidar alvo/pré-condições, aplicar em ordem por MCP e conferir schema/histórico/segurança após a aplicação.

O bloqueio é de alvo e escopo, não de autenticação. O pedido atual autoriza aplicar a migration; a inspeção revelou que faltam onze pré-requisitos e não há staging identificado. A [skill codex-executor](/home/many/.codex/skills/codex-executor/SKILL.md), seção Migrations e MCP, orienta: “Se o alvo for ambíguo [...] não faça a escrita remota”.

Evidências: [retornos MCP](evidencias/preflight-20-mcp.json), [ordem e hashes](evidencias/execucao-19-migrations.json), [roteiro de homologação e recuperação](19-HOMOLOGACAO-E-RECUPERACAO.md).
