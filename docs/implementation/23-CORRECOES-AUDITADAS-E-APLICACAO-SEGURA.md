# Correções auditadas e aplicação segura — rodada 23

15/10/2026. **Correções locais verificadas; reparo independente de autoria aplicado via MCP; cadeia V2 completa ainda não liberada para o banco ativo.** Este documento atualiza o estado operacional do relatório 21. O [parecer independente 22](22-AUDITORIA-INDEPENDENTE-MIGRATIONS.md), especialmente seu adendo 7, registra a aprovação técnica por hash e seus limites.

## Autorização e decisão

O usuário autorizou a implementação e condicionou as migrations à conferência de um agente GPT-6.1 Sol com raciocínio Alto. Foi utilizado um subagente com `model=gpt-6.1-sol`, `reasoning_effort=high`, separado do executor, com leitura do código/banco e ensaios isolados. Ele não realizou escritas remotas.

O auditor encontrou defeitos reais e **não aprovou a aplicação imediata da cadeia original**. Após as correções, reexecutou independentemente os três novos verificadores e aprovou somente o complemento de autoria descrito abaixo. A migration ampla de RLS não foi reenviada, fracionada ou executada por outro transporte. A autorização humana está presente; as condições técnicas para o restante ainda não estão satisfeitas.

## Correções implementadas no workspace

| Achado | Correção | Verificação |
|---|---|---|
| Login sem contexto após RLS restrita | `auth-merge.ts` resolve a identidade pelo resolver interno existente, configura tenant/ator por fase na mesma transação e serializa callbacks pela identidade. Criação usa ID conhecido antes do INSERT. Não amplia policies nem usa papel privilegiado. | Adoção anônima, login repetido/novo, merge de favoritos/alertas/perfil com precedência da conta, cookie já vinculado a outra pessoa, homes diferentes, rollback e ausência de vazamento de contexto. Schema anterior a M1 também passou. |
| Autoria presa ao home da pessoa | Novo complemento troca as FKs de autoria de `product_curation` e `editorial_selection` por identidade global validada. As FKs de produto, tenant e itens continuam. | Pessoa com home B e membership em A consegue revisar em A; autor inexistente continua rejeitado. Complemento pode ser repetido localmente sem perder as FKs validadas. |
| Joins editoriais ocultavam membros de outro home | Os dois escritores de `editorial-selection-db.ts` verificam membership→conta sem depender da visibilidade da linha pessoal `app_user` do outro tenant. | Serviços reais `saveEditorialAssessment` e `replaceEditorialSelection` passam para membro cross-home e recusam ambos após revogação. |
| Convite podia misturar tenant e conta | M11 pendente ganhou chave única `(id,tenant_id)` da conta e FKs compostas em invitation, entitlement, onboarding_progress e lifecycle. O aceite verifica e bloqueia a conta coincidente e ativa antes de consumir o token/conceder membership. | Quatro tabelas recusam associação cruzada, inclusive em contexto de plataforma; conta suspensa não consome convite nem cria membership; onboarding e aceite legítimos continuam passando. |
| Tentativa de dispatch podia apontar para job de outro tenant | M10 pendente ganhou unicidade `(id,tenant_id)` do job e FK composta da tentativa. M12 não recria o mesmo índice único. | INSERT direto da role runtime em B referenciando UUID de job A falha por FK; fluxo positivo do worker preservado. Nenhum envio real. |
| Prontidão pública baseada em uma única função | `publicProjectionReady` exige as nove assinaturas consumidas, incluindo telemetria e shortlinks. Só consulta catálogo. | M1=false, M6=false, M8=true; remoção de stats=false; nenhum shortlink/clique criado pelo probe. |

A fixture passou a incluir as duas unicidades de favoritos/alertas que já existem na migration de agosto. Isso reproduz o contrato real do merge; não concede permissões substitutivas. Asserções do total de migrations foram atualizadas para **14 arquivos: 12 originais + 2 complementos**. Os hashes de todos os SQLs e dos arquivos desta correção estão no [manifesto 23](evidencias/manifesto-execucao-23.json). M1 e M2 não foram editadas; migrations antigas já aplicadas não foram reescritas.

As alterações locais de login, prontidão e integridade SaaS **não estão publicadas**. As correções dos SQLs pendentes M10/M11/M12 só existirão no remoto quando sua cadeia vier a ser tecnicamente liberada. Há uma única aplicação nova nesta rodada: o complemento abaixo.

## Migration aplicada e conferida

Alvo confirmado pelo MCP: `https://spbuwcwmxlycchuwhfir.supabase.co`, PostgreSQL 17.6, schema `garimpa`, banco ativo compartilhado. Preflight reconfirmou M1 + proteção de segredos já instaladas, M2 ausente, duas FKs antigas validadas e **zero autores órfãos globais** nas duas tabelas.

| Identidade | Valor |
|---|---|
| Arquivo gerado com Supabase CLI | `packages/persistence/supabase/migrations/20261015040727_garimpa_curation_membership_author.sql` |
| SHA-256 aprovado e executado | `da4c85fe662e644a7bf663152366eec4f06c9818f39b3ae53953a34779c1dd23` |
| Nome MCP | `garimpa_curation_membership_author` |
| Versão remota confirmada | `20261015041540` |
| Envelope da execução | `lock_timeout=5s`, `statement_timeout=45s`, aplicação atômica pelo MCP |
| Resultado da ferramenta | `success=true` |

O SQL adicionou e validou as duas novas FKs antes de remover as duas compostas de autoria. Não executou UPDATE/DELETE de dados, não alterou policies/grants e não exigiu ativar o runtime V2. É um reparo independente de autoria; não contém partes da migration 2 rejeitada.

SELECTs posteriores confirmaram `product_curation_reviewer_user_fkey` e `editorial_selection_actor_user_fkey` validadas, ambas antigas ausentes e as demais FKs dessas tabelas preservadas. Comparação estrutural antes/depois: **29 policies idênticas** (28 legadas + proteção de segredos) e **317 registros de grants idênticos**. Isso preserva o acesso observado; não comprova isolamento SaaS completo das policies legadas.

| Contagem | Antes | Depois |
|---|---:|---:|
| Produtos | 1.657 | 1.657 |
| Observações | 9.146 | 9.146 |
| Publicações | 1.494 | 1.494 |
| Cliques | 685 | 685 |
| Shortlinks | 172 | 172 |
| Curadorias | 1.657 | 1.657 |
| Edições editoriais | 0 | 0 |
| Autores órfãos nas duas relações | 0 | 0 |

A credencial real `garimpa_app` foi conferida em transações READ ONLY: acesso da casa preservado a 1.657 produtos/1.494 publicações; RLS da tabela de segredos ativa, zero segredos visíveis, sem SELECT anon/authenticated. O smoke HTTP antes/depois manteve título e os mesmos **24 links** da home, sem fallback de erro. Não foi gerado clique comercial para testar redirecionamento. Advisors não apontaram finding de garimpa; isso não substitui os testes negativos ou resolve o rollout.

O auditor voltou a consultar o histórico e o catálogo remoto após a aplicação e **aprovou independentemente essas pós-condições**, incluindo igualdade de contagens/policies/grants e ausência de M2. Essa conferência está na seção 8 do parecer22; a reprovação da cadeia completa no ativo continua vigente.

Evidências: [preflight](evidencias/mcp-23-author-baseline.json), [SQL de conferência](evidencias/mcp-23-verificacao.sql), [aplicação exata](evidencias/mcp-23-aplicacao.json), [pós-catálogo](evidencias/mcp-23-author-after.json), [histórico](evidencias/mcp-23-final-history.json), [role real](evidencias/mcp-23-runtime-selects.json), [smoke](evidencias/mcp-23-public-smoke.json), [resultado consolidado](evidencias/mcp-23-resultado.json).

## Verificação local e limites

Passaram **21 suítes SQL isoladas**, os **379 testes web**, typecheck web e build Next.js. As suítes incluem curadoria, preço, rubrica, radar, cockpit, financeiro, experimentos, dispatch, onboarding, upgrade e os novos negativos de login/integridade/prontidão. Os serviços e SQLs reais foram usados; o adaptador da fixture traduz a interface do cliente, sem simular resultados das queries.

O primeiro comando web dentro do sandbox terminou com dois arquivos de teste falhando: restrição de `os.networkInterfaces()` e saída de subprocesso vazia. Os diagnósticos foram reproduzidos, e a mesma suíte foi executada fora do sandbox, com credenciais removidas, **379/379 aprovados**. Não foram alterados os testes ou o produto para encobrir essas falhas. O log inicial permanece preservado e o resultado final referencia o rerun.

[Resultados completos e resolução das falhas de ambiente](evidencias/execucao-23-verificacao-final.json), [runner reproduzível](evidencias/execucao-23-checks.py), [log web nativo](evidencias/execucao-23-web-tests-native.log), [build](evidencias/execucao-23-web-build.log). Os artefatos históricos 19 com nomes fixos foram preservados; saídas novas foram guardadas com prefixo 23.

PGlite não comprova duas sessões independentes, pooler, OAuth real, Storage privado nem canais oficiais. Não foi provisionado staging. Não foi feito deploy, commit, convite externo, despacho, cobrança ou ativação comercial.

## Pendências para retomar a cadeia

1. **Identificar ambiente isolado:** projeto/branch de staging verificável, acesso e baseline restaurável. O MCP atual aponta ao banco ativo. Uma pergunta sobre staging foi enviada ao usuário; a ausência de resposta não será tomada como autorização nem como existência do ambiente.
2. **Identificar runtime publicado e workers:** o conector Vercel recusou o escopo na rodada anterior; o fallback CLI não encontrou credenciais, iniciou autenticação e foi interrompido. Não houve login concluído nem deploy. SHA de HEAD e `/convite` 404 não identificam o deployment. Captura, extensão e crons precisam entrar na matriz.
3. **Corrigir e ensaiar a implantação:** a ordem atual M2→M6→M8 restringe o caminho legado antes da superfície pública completa. A nova prontidão apenas evita escolher projeções parciais; não elimina essa janela. Preparar uma candidata de expansão que disponibilize os pré-requisitos/projeções sem apertar as policies existentes; comprovar código antigo + expansão, código novo + expansão e, só depois, código novo + isolamento final. A candidata precisa de novo parecer, hashes e avaliação automática; não é autorização para fracionar/reexecutar a rejeição existente.
4. **Homologar em staging:** dados sintéticos conhecidos, duas sessões reais A/B/A, login e merge, curadoria e seleção cross-home, quotas/convites concorrentes, lease/marker/reserva, Storage privado e recuperação de interrupções. Medir locks/custo da view com volume representativo. Manter automação desligada e não usar negócio real como fixture.
5. **Reavaliar e executar somente a nova candidata aprovada:** comparar pré-condições e novos hashes, preservar mapeamento de versões MCP, conferir catálogo/dados/runtime a cada unidade funcional. Não executar `db push` ou `migration repair` cegamente: os timestamps MCP diferem dos arquivos locais. M10/M11 reparadas são CONDICIONAIS; M2 continua REPROVADA para o ativo atual.

G-PRICE, G-RUBRIC, G-FIN, G-RIGHTS/G-PROGRAM, G-CHANNEL, G-EXPERIMENT e G-PILOT/G-PRIVACY/G-SEC continuam vinculados às respectivas capacidades. Operação própria e SaaS seguem compartilhando o motor comercial; nenhuma estratégia de negócio, quota ou threshold foi unilateralmente ratificada.

## Recuperação e conclusão objetiva

Se o complemento autoral tivesse falhado antes do commit, seria obrigatório confirmar rollback antes de retomar. Ele foi confirmado aplicado; não há motivo demonstrado para desfazê-lo. Conserva-se a expansão validada. Uma restauração futura das FKs de home exigiria procurar primeiro autores cross-home e preservar as evidências, pois esses registros passam a ser legítimos. Não apagar autores/eventos nem remover a FK global para acomodar código defeituoso.

**Concluído nesta rodada:** auditoria independente, reparos locais dos defeitos reproduzidos, checks da candidata, aplicação apenas do complemento aprovado e pós-conferência real. **Não concluído:** aplicação das 11 originais pendentes, homologação operacional e publicação V2. Sua liberação depende das condições acima; testes locais verdes não foram usados como substituto.
