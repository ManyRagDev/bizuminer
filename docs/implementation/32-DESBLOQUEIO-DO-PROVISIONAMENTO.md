# 32 — Desbloqueio do provisionamento de staging

16/10/2026, America/Sao_Paulo. Pedido vigente: providenciar os recursos necessários e finalizar a implantação; manter login Google/OAuth2 existente. A autorização geral anterior e a condição de aprovação técnica independente permanecem. Nenhuma nova migration, deploy, contratação, mudança de login do aplicativo ou dado de produção foi realizada nesta rodada.

## Causa específica e ação executada

A conexão MCP existente usa `https://mcp.supabase.com/mcp?project_ref=spbuwcwmxlycchuwhfir`. O Supabase documenta que `project_ref` desabilita ferramentas de conta, entre elas `get_cost`, `confirm_cost` e `create_project`. Isso explica a incompatibilidade entre a exigência de confirmação de custo do branch e as ferramentas disponíveis. Referência: [MCP Supabase — ferramentas e configuração](https://supabase.com/docs/guides/ai-tools/mcp).

Foi adicionada a conexão oficial separada `supabase-management`, com URL `https://mcp.supabase.com/mcp?features=account,branching`, preservando a conexão do projeto. O comando CLI iniciou OAuth; seu processo posteriormente informou `Successfully logged in`. Não se atribui esse resultado a uma autorização humana explícita de escopos nesta conversa, nem se presume que os novos tools tenham sido carregados. Nenhuma ferramenta da nova conexão foi usada para operar recursos.

Verificação posterior: o host carregou o namespace `mcp__supabase_management`, incluindo `get_cost`, `confirm_cost`, `create_branch`, `create_project`, `list_projects` e `list_organizations`. A ausência das ferramentas foi resolvida; seu uso para provisionar continua aguardando a autorização específica exigida pela revisão automática. Até aqui, foram inspecionados apenas os nomes e schemas dos tools, sem consultar recursos pela nova conexão.

## Revisão automática e confirmação necessária

O fluxo padrão solicitou organizações/projetos, leitura/escrita de banco, leitura de secrets e funções, ambiente e Storage. A revisão automática rejeitou abrir esse OAuth por escopos amplos, exigindo confirmação explícita.

A tentativa seguinte foi reduzida a `organizations:read`, `projects:read`, `projects:write`, usando a opção oficial `codex mcp login --scopes`. A revisão automática rejeitou esse comando antes da execução porque os três escopos também precisam de autorização humana explícita. A rejeição não será contornada usando a sessão ampla, outro navegador, tokens ou outro transporte. A conexão antiga do projeto continua disponível para o escopo já autorizado.

Foram solicitadas ao usuário, em conjunto:

1. Autorização expressa desses três escopos, restrita à organização atual e à criação do staging.
2. Preferência entre usar somente uma opção gratuita ou autorizar até US$1 de uso temporário, sem upgrade de plano nem adicionais. A autorização geral para concluir não é tratada como orçamento ilimitado.

O custo concreto da conta será obtido antes de provisionar. A [documentação oficial de uso de branches](https://supabase.com/docs/guides/platform/manage-your-usage/branching) informa computação Micro a partir de US$0,01344/h e custos adicionais por uso; isso não é cotação da organização, nem teto automático de cobrança. Branching exige plano pago. Não foi criado recurso para descobrir o preço.

O painel Supabase no navegador interno solicitou login; a sessão MCP não equivale à sessão do painel. O Supabase CLI também retornou ausência de access token. Não foram solicitadas senhas ou copiadas credenciais. Não há Docker/Podman disponível nesse ambiente para substituir a homologação gerenciada por uma stack Supabase local.

## Google e pacote de implementação

O login Google/OAuth2 já estabelecido será preservado. Não é necessário criar outro mecanismo de autenticação. A conexão de gerenciamento da infraestrutura é distinta do login dos usuários do BizuMiner. No staging, conferir callbacks e isolamento de sessão conforme o ambiente realmente criado; não alterar credenciais Google ou callbacks de produção sem necessidade demonstrada e autorização correspondente.

Os 462 arquivos do pacote31 continuam com os mesmos hashes. O verificador A/B/C passou novamente; A33e037, B028103 e C111498 permanecem congelados. Os resultados39/21 nativos,21suítesSQL,379testesweb e buildNode24 são os resultados31 preservados, não foram reexecutados nesta rodada sem mudança de código.

## Retomada após as respostas

Confirmar os escopos aprovados e concluir OAuth limitado → usar as ferramentas de conta agora carregadas → confirmar organização com o usuário e consultar plano/opções gratuitas/custos → provisionar staging dentro do orçamento autorizado → conectar inequivocamente o novo alvo → executar homologação/recuperação e S0–S3 do relatório31 → revisão independente de produção → promoção e pós-verificações. A decisão técnica isolada31 não autoriza promover diretamente no ativo.

Esta etapa resolve a configuração de provisionamento, sem reabrir o plano ou considerar a implantação finalizada. Impedimento atual: confirmação explícita de escopos exigida pela revisão automática e definição do limite de custo; staging ainda não provisionado.
