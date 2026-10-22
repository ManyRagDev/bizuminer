# Aplicação via MCP e conferência — rodada 21

15/10/2026. **Resultado parcial: primeira migration da sequência aplicada; migration 2 rejeitada pela revisão automática de aprovação; migrations 3–12 não tentadas.** Uma migration complementar protegeu exclusivamente a tabela nova e vazia de credenciais criada pela primeira. Não equivale à aplicação da migration 2 nem à liberação da arquitetura V2.

O usuário autorizou expressamente aplicar toda a sequência no projeto conectado e conferir com SELECTs. A autorização não foi tratada como ambígua nesta rodada. O alvo foi reconfirmado pelo MCP: `https://spbuwcwmxlycchuwhfir.supabase.co`, PostgreSQL 17.6, schema `garimpa`, role de aplicação `garimpa_app` sem BYPASSRLS. Não foi criado staging, efetuado deploy ou habilitado canal/piloto/E3.

## 1. Histórico confirmado

| Arquivo local / posição | Nome remoto | Versão registrada pelo MCP | Resultado |
|---|---|---|---|
| `20261014100000_garimpa_account_context_and_membership.sql` / 1 | `garimpa_account_context_and_membership` | `20261015034755` | APLICADA E CONFERIDA |
| `20261014101000_garimpa_tenant_rls_scoped.sql` / 2 | `garimpa_tenant_rls_scoped` | Não registrada | REJEITADA ANTES DA EXECUÇÃO |
| Arquivos 3–12 do catálogo 19 | Nomes originais | Não registradas | NÃO TENTADAS após o bloqueio da dependência |
| Complemento `20261015035001_garimpa_affiliate_secret_bootstrap_rls.sql` | `garimpa_affiliate_secret_bootstrap_rls` | `20261015035126` | APLICADA E CONFERIDA; proteção isolada da nova tabela |

Os doze arquivos da candidata 19 mantêm seus hashes originais. O catálogo atual tem esses doze mais o complemento independente. O MCP registra versões de aplicação próprias: os timestamps remotos acima diferem dos arquivos locais. Antes de qualquer execução futura pelo CLI, reconciliar explicitamente nome, conteúdo e histórico para não reaplicar a primeira migration por divergência de timestamp. Não executar `db push` cegamente. Nenhum repair de histórico ou reenvio foi feito.

A primeira migration adicionou revogação de membership, a tabela de credenciais cifradas, resolvers de identidade/conta/dispositivo e FKs de autoria global/membership. Os SELECTs confirmaram sua instalação e a validação das novas FKs.

## 2. Rejeição automática e limite da execução

A tentativa real de aplicação de `garimpa_tenant_rls_scoped` retornou `isError: true`, antes da execução, com a seguinte razão:

> Esta migração altera de forma ampla e persistente as políticas RLS, permissões, triggers e acesso de todas as tabelas tenantizadas em um banco ativo, podendo interromper ou expor operações; a autorização para aplicar a sequência não torna este passo amplo e potencialmente disruptivo uma alteração estreitamente delimitada sem staging validado.

O retorno proíbe contornar a rejeição por execução indireta. Não houve reenvio pelo CLI, execute_sql ou divisão da alteração ampla em chamadas menores. O histórico remoto, a ausência de `active_tenant`/role pública e a igualdade das políticas anteriores confirmam que a migration 2 não foi aplicada. As demais foram mantidas pendentes para preservar a ordem de dependências.

A revisão do rollout também encontrou que a rota pública `/convite` responde 404 no deployment atual, portanto a publicação da candidata local não pode ser presumida. A consulta de metadados do deployment pela integração Vercel retornou 403 por escopo; nenhum deploy ou tentativa de alterar credenciais foi feita. Um SELECT de banco não comprova compatibilidade de um código publicado que não foi identificado. A continuidade requer staging validado e conferência do runtime correspondente antes da ativação das permissões amplas.

## 3. Proteção da aplicação parcial

A primeira migration cria `affiliate_secret`; a ativação original de RLS dessa tabela viria na segunda, que foi rejeitada. A conferência detectou a tabela **vazia**, sem grants para anon/authenticated, mas inicialmente com RLS desativado.

Foi preparada e testada uma proteção estritamente menor: `20261015035001_garimpa_affiliate_secret_bootstrap_rls.sql`. Ela habilita RLS somente nessa nova tabela e exige conta ativa, tenant explícito e owner ou worker para leitura/escrita. Não altera qualquer política das 27 tabelas anteriores, não habilita a migração ampla rejeitada e não cria credenciais. A aplicação delimitada foi aceita pelo MCP e seu resultado conferido.

Esse complemento é independente da função `active_tenant` ainda ausente e pode ser instalado logo após a primeira migration. Também foi testado após toda a sequência original: a instalação cumulativa de 13 arquivos continua válida. Quando a migration ampla for autorizada pela revisão após validação, ela poderá substituir as policies correspondentes conforme seu script; não considerar o complemento como substituto da migração 2.

## 4. SELECTs e resultados

| Conferência | Antes | Depois | Resultado |
|---|---:|---:|---|
| Produtos | 1.657 | 1.657 | Contagem preservada |
| Observações de preço | 9.146 | 9.146 | Contagem preservada |
| Publicações legadas | 1.494 | 1.494 | Contagem preservada |
| Links curtos | 172 | 172 | Contagem preservada |
| Cliques | 685 | 685 | Contagem preservada |
| Avaliações humanas | 0 | 0 | Nenhuma avaliação sintética inserida |
| Policies das tabelas anteriores | 28 | 28 | Definições iguais, comparadas como JSON ordenado |
| Credenciais na tabela nova | Inexistente | 0 | Nenhum segredo criado |
| RLS de `affiliate_secret` | Inexistente | Ativo | Confirmado pelo catálogo e pela conexão runtime |
| Grants SELECT de segredo para anon/authenticated | — | Nenhum | Negados |
| FKs novas de autoria/membership | Ausentes | Validadas | Três constraints confirmadas |
| Publicação com tenant divergente de produto/conta | — | 0 | Integridade conferida |
| Atores órfãos de curadoria/avaliação | — | 0 | Integridade conferida |
| Memberships legítimas resolvidas | — | Todas as elegíveis | Conferência sem exportar IDs de pessoas |

Os resolvers existem e anon/authenticated não receberam EXECUTE. `garimpa_app` continua sem BYPASSRLS. As contagens não substituem backup nem prova de cada campo; os scripts aplicados não atualizam nem excluem registros comerciais históricos. Não foram criadas vendas, comissões, campanhas, convites, clientes ou mensagens para simular homologação.

O MCP não tem permissão para `SET ROLE garimpa_app` e retornou 42501 nesse teste. Não foi concedido privilégio adicional ao administrador. Como alternativa de leitura, a credencial existente da aplicação executou SELECTs em transações READ ONLY: `current_user=garimpa_app`, `row_security_active=true`, zero segredos sem contexto e leitura normal dos 1.657 produtos/1.494 publicações da casa com seu contexto. A tabela está vazia no remoto; os controles positivos e negativos com segredos sintéticos foram testados somente no banco isolado.

Os advisors retornaram zero findings específicos de `garimpa` após a proteção. Findings preexistentes de outros produtos/Auth não foram alterados. Ausência de finding do advisor não certifica isolamento completo: a segunda migration segue pendente.

## 5. Testes locais e continuidade pública

Passaram os três comandos focados, sem credenciais remotas: `test:secret-bootstrap`, `test:commercial` e `test:cf-regressions`. O primeiro verifica M1 + proteção isolada (sem contexto, operator, outra conta e conta suspensa negam; owner/worker próprios funcionam; insert cruzado é negado) e a instalação da cadeia completa de 13 arquivos em PGlite. O aceite de quantidade do teste comercial foi atualizado de 12 para 13; as assertions de comportamento foram preservadas.

A página `https://www.bizuminer.com.br` respondeu antes/depois com o mesmo título e os mesmos 24 links de produtos. Não houve compra, redirect para loja ou chamada de automação. Esse smoke não comprova todas as jornadas autenticadas ou a implantação das funcionalidades novas.

## 6. Estado para retomada

- **Concluído remotamente:** primeira migration original e proteção complementar da tabela nova.
- **Bloqueado:** migration 2 pela revisão automática; onze migrations originais ainda pendentes no total, contando 2–12.
- **Disponível localmente:** sequência completa e proteção adicional, com testes focados aprovados e plano de homologação existente.
- **Não realizado:** staging real, publicação de código, ativação de permissões amplas, E3, canal, piloto ou alterações em outros schemas.
- **Caminho para continuar:** preparar staging isolado, validar código/schema/runtime e só então retomar a alteração ampla mediante revisão com essas evidências. Não repetir o mesmo pedido bloqueado sem mudança material de evidência ou contexto.

Evidências: [resultado consolidado](evidencias/mcp-21-resultado.json), [aplicações e rejeição](evidencias/mcp-21-aplicacao.json), [SELECTs reproduzíveis](evidencias/mcp-21-verificacoes.sql), [catálogo após aplicação](evidencias/mcp-21-post_catalog.json), [integridade](evidencias/mcp-21-integridade.json), [role runtime](evidencias/mcp-21-runtime-selects.json), [histórico remoto](evidencias/mcp-21-final_history.json), [testes focados](evidencias/mcp-21-local-checks.json), [smoke público](evidencias/mcp-21-public-smoke.json) e [delta de fontes](evidencias/mcp-21-source-delta.json).
