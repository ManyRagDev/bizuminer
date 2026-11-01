# Aplicar migrations do Supabase

O projeto possui `.mcp.json` com o MCP Supabase escopado ao projeto `spbuwcwmxlycchuwhfir` e somente aos grupos `database`, `docs` e `debugging`. A migration M1-A já foi aplicada e registrada remotamente como `20260818213323_marketplace_evidence`.

Após recarregar a sessão do agente, use o MCP `execute_sql` com o conteúdo de:

`packages/persistence/supabase/migrations/20260818204528_marketplace_evidence.sql`

Depois valide com:

```sql
select column_name
from information_schema.columns
where table_schema = 'garimpa'
  and table_name = 'price_observation'
  and column_name in ('rating_star', 'sales_label', 'sales_count')
order by column_name;
```

O caminho CLI continua disponível para uma conexão owner:

```text
npx supabase db push --db-url <DATABASE_URL_OWNER_PERCENT_ENCODED>
```

Não use a `DATABASE_URL` da aplicação (`garimpa_app`) para DDL; ela não é proprietária da tabela.

## Histórico de aplicações remotas via MCP

- `20260818213323_marketplace_evidence` (M1-A)
- `garimpa_subscriber_repair` (19/08/2026) — cria `garimpa.subscriber`, que existia só como arquivo local desde 17/08; corresponde a `20260819180000_garimpa_subscriber_repair.sql`
- `garimpa_member_area` (19/08/2026) — `app_user`, `favorite`, `price_watch`, `buyer_profile`; corresponde a `20260819181000_garimpa_member_area.sql`

## Experiência do comprador — produção em 28/10/2026

Aplicadas pelo MCP no projeto `spbuwcwmxlycchuwhfir`, após conferir o histórico. O MCP atribuiu versões remotas diferentes dos timestamps dos arquivos locais:

| Arquivo local | Versão remota | Nome |
|---|---|---|
| `20261027030237_compose_homepage_editions.sql` | `20261027110848` | `compose_homepage_editions` (já instalada; não reaplicada) |
| `20261028041629_durable_product_presentation.sql` | `20261028230124` | `durable_product_presentation` |
| `20261028041849_watch_comparable_baseline.sql` | `20261028230135` | `watch_comparable_baseline` |
| `20261028042010_public_price_history_context.sql` | `20261028230150` | `public_price_history_context` |

As três aplicações usaram `lock_timeout=5s` e `statement_timeout=60s`. Foram conferidos campos de acompanhamento, funções públicas, triggers de invalidação e permissões; `anon` continua sem execução da projeção editorial e o runtime público não ganhou leitura direta das avaliações.

A aplicação do esquema não publica textos editoriais nem preenche moedas/configurações antigas por suposição. A simulação da primeira edição retornou zero produtos aptos, por isso ela não foi inicializada: o catálogo permanece disponível pelo caminho de transição. Antes de inicializar, publicar uma seleção válida e conferir `refresh-homepage.ts --tenant local --initialize` sem `--execute`.

Em futuras aplicações, conferir nomes e versões deste mapeamento; não reaplicar os arquivos só porque os timestamps locais diferem do histórico remoto.

## Renovação contínua da pauta — 01/11/2026

`20261101125432_renew_editorial_pauta.sql` foi aplicada via MCP no projeto `spbuwcwmxlycchuwhfir` como `20261101130216_renew_editorial_pauta`. Acrescenta histórico de última presença e estado privado de habilitação/tentativa, com RLS por conta e sem privilégios públicos. Conferida antes em PGlite e PostgreSQL 17.6 local. A conta da casa habilitou a rotina pelo painel, mas continua aguardando produtos aptos; isso não equivale a criar uma edição nem a publicar o código web/worker novo. Veja o estado completo no plano de integração da captura, curadoria, vitrine e pauta.


## Pauta melhorada — aplicada em produção em 01/11/2026

`20261101193221_improve_editorial_recommendations.sql` foi gerada com o CLI oficial e validada em PostgreSQL 17.6 descartável. Acrescenta opção de compra, canais/edições/arquivo, confirmação de divulgação e descoberta por conta, com RLS privado e projeções públicas restritas. Não contém backfill de variantes desconhecidas nem ativa políticas por conta.

**Dependência de publicação:** a unicidade antiga de observação por rodada/produto é substituída pela identidade com opção. Integrar os escritores compatíveis, encerrar jobs antigos e reiniciar as instâncias após a migration; código antigo com o alvo de conflito anterior falha depois da troca. Não usar rollback que reintroduza esse escritor sobre o novo esquema nem apagar observações para reverter a funcionalidade. As flags novas exigem configuração explícita. A configuração anterior de renovação não as habilita.

Aplicada via MCP no projeto `spbuwcwmxlycchuwhfir`, após autorização, como `20261101221820_improve_editorial_recommendations`. A primeira tentativa foi integralmente revertida por espera de lock; após terminar a leitura que bloqueava a alteração, a mesma migration foi aplicada. Os escritores compatíveis já estavam publicados e não havia capturas antigas em andamento. Foram preservadas as 11.096 observações e conferidos a nova unicidade com opção, RLS e ausência de leitura pública direta nas seis tabelas novas. O advisor de segurança não apontou achados no schema `garimpa`.

O [registro da integração](./plano-integracao-captura-curadoria-vitrine-pauta.md#integração-externa-publicada--01112026) contém versões publicadas, verificações e limites das fontes. A primeira ativação com ofertas reais permanece pendente: a migration não configura canais nem confirma opções ou avaliações por suposição. Não reaplicar o arquivo pela diferença entre o timestamp local e a versão remota.
