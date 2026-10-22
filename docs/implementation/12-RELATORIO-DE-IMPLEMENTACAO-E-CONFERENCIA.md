# Implementação corretiva e conferência — 14/10/2026

## Resultado e limite da entrega

A rodada fecha as correções locais dos caminhos comerciais apontados em RC-01–06: serviços transacionais com autorização revalidada, interface de campanha e resultados, aprovação humana persistida, exportação revalidada, confirmação manual, fronteira pública, propagação do token, predicados E3 e auditoria sem falso positivo. A validação local passou. **Isso não encerra a implementação integral de todos os épicos nem autoriza ativar a cadeia de migrations em produção.** A adoção de contexto nos consumidores legados e a homologação operacional continuam pendentes.

O pedido atual autorizou implementação local; as restrições de planejamento anteriores não foram usadas para impedir os reparos. Foram aplicadas as skills codex-executor, codex-investigador, Supabase/Postgres e react-best-practices. As alterações preexistentes do usuário foram preservadas. Não houve commit, deploy, envio comercial, convite externo, mudança de flags de produção ou aplicação remota de migrations.

## Mudanças implementadas

- `/admin/campanhas`: conta autorizada, campanha com público/objetivo explícitos, oferta aprovada, rascunho com fatos do banco, revisão imutável, validação, aprovação humana, cópia e confirmação manual. Publicar não é inferido de exportar. Oportunidades desta entrada são manuais/unclassified; não se fabricam notas de qualidade nem se ratifica a rubrica.
- `commercial-workflow.ts` e Server Actions: preços, moeda, configuração, links e evidência vêm do servidor. Membership e role são revalidadas na mesma transação. Comandos possuem digest completo, idempotência, controle de versão e eventos atômicos. Preço ou condições alterados invalidam a aprovação antes da exportação. Uma nova revisão conserva publicações já confirmadas. Assets permanecem bloqueados até homologação real dos direitos; metadata de captura não autoriza imagem.
- `/admin/financeiro`: venda manual, comissão/ajuste, custos medidos e receita SaaS da conta operadora. Valor ausente permanece desconhecido; tempo sem tarifa permanece tempo. Predecessores consolidam obrigações sem somar pendente, confirmada e recebida como três receitas. Fonte/identificador, moeda e valores são validados. Repetir um identificador com outro conteúdo falha.
- `/p` e `/go`: handlers usam projeções públicas restritas após instalação; códigos de quatro e doze caracteres continuam distintos. CTA, botão fixo e banner preservam `c`. Slug é resolvido pela publicação, incluindo namespace e marketplace. Código de outro produto não altera o dono da monetização; preview/HEAD não geram clique no novo handler. Infraestrutura indisponível não é apresentada como validação de segurança bem-sucedida.
- Leitura pública: catálogo, detalhe, categorias/contadores, candidatos de hero e links curtos possuem projeções mínimas. Os caminhos anteriores continuam usados quando a nova fronteira ainda não existe. As imagens/atributos/seleções editoriais e demais consumidores antigos não foram certificados integralmente sob a nova RLS.
- Migrations locais: substituição de todas as policies irrestritas do baseline observado, inclusive relações por affiliate_id; tenant imutável; suspensão restritiva também nas tabelas criadas depois; autoria de pessoa transversal; FKs de revisão/kit/campanha/validação; FKs financeiras compostas de conversão, predecessor e lote. A cadeia preserva os nomes/ordem/tipos existentes da view. A primeira execução encontrou incompatibilidade no nome de coluna da view; ela foi corrigida.
- Preço: configuração desconhecida não vira comparável; quantidade e estados materiais são explícitos. TS/SQL verificam janela, moeda, aprovação, cobertura e lacunas. Política aprovada exige autoria/data e não admite alteração dos thresholds em seu lugar. E3 permanece sem ativação comercial até G-PRICE. Digest inclui fatos aninhados e política; E3 sozinho não autoriza texto de recorde sem claim correspondente.
- `verify-remote-compatibility`: alvo explícito, sem carregar `.env.local` da operação; ausência de URL/objetos/colunas/fronteiras/permissões necessárias resulta em falha. Inspeção read-only, role runtime, policies, exposição de definers, FKs e contexto na mesma transação. Seu PASS significa **preflight estrutural**, nunca certificação de browser, pooler, Storage, workers ou release.

A expansão para novas telas e leitores públicos foi necessária para integrar as ações antes sem consumidores e para evitar que a correção de RLS deixasse o caminho público dependente de consulta privada sem contexto. A colisão de código passou a usar `ON CONFLICT DO NOTHING`; capturar 23505 e repetir dentro da mesma transação deixava a transação abortada.

## Verificações executadas

| Verificação | Resultado | Evidência |
|---|---|---|
| Web, runner nativo | 367 testes passaram, zero falhas | [Log](evidencias/web-tests-final.log) |
| Capture | 127 testes passaram | [Log](evidencias/capture-tests-final.log) |
| Persistence | 35 testes passaram | [Log](evidencias/persistence-tests-final.log) |
| Extension | 16 testes passaram | [Log](evidencias/extension-tests-final.log) |
| Seleção editorial SQL | 29 cenários passaram | [Log](evidencias/editorial-selection-final.log) |
| Preço/triagem SQL | 22 cenários passaram | [Log](evidencias/triage-price-final.log) |
| Captura persistida SQL | 20 cenários passaram | [Log](evidencias/capture-batch-final.log) |
| Jornada comercial SQL + handlers HTTP | 31 cenários passaram; onze migrations executadas | [Log](evidencias/commercial-sql-final.log) |
| Typecheck dos quatro pacotes | Exit 0; web também verificado pelo build | [Persistence](evidencias/persistence-typecheck-final.log), [Capture](evidencias/capture-typecheck-final.log), [Extension](evidencias/extension-typecheck-final.log) |
| Build Next | Exit 0, novas páginas compiladas | [Log](evidencias/web-build-final.log) |
| CLI sem alvo | Exit 1 e passed=false, resultado esperado | [Log](evidencias/audit-without-target-final.log) |

Os testes web completos foram executados sem DATABASE_URL e fora do sandbox quando necessário para subprocessos e interfaces de rede. No sandbox, os arquivos de QR/subprocesso falharam por limitações do ambiente; a execução nativa os exercitou e passou. O build usou URL local sem banco conectado, substituindo a URL do ambiente; não certifica dados ou sessão reais.

O novo runner `npm run test:commercial --prefix tools/editorial-tests` executa SQL/RLS efetivos em PostgreSQL WASM/PGlite. A fixture reconstrói 27 tabelas, policies observadas e chaves necessárias, não um dump completo de triggers/Auth/Storage. O adapter apenas traduz consultas; não fabrica respostas. Os comandos usam garimpa_app e garimpa_public_runtime, incluindo casos positivos e negativos. A instância é serializada: **não demonstra sessões concorrentes nem Supavisor**. Os handlers `/p` e `/go` são exercitados; a renderização autenticada no navegador e o efeito temporal do banner continuam exigidos em staging.

Os antigos mocks são mantidos como testes de contrato em `commercial-flow-contract.test.mjs` e `security-isolation-matrix.test.mjs`. Não foram usados como evidência de SQL/RLS nem como certificação E2E.

## Conferência remota via MCP

A autenticação passou a funcionar e o MCP confirmou `https://spbuwcwmxlycchuwhfir.supabase.co`, schema garimpa. Foram lidos migrations, tabelas, advisors, contagens agregadas e fontes de logs. A consulta exata confirmou **1 conta, 3 app_users e 1 membership**, runtime sem superuser/bypassrls e ausência da tabela campaign. Os números de `list_tables` são estimativas; não substituem essas contagens exatas.

As onze migrations V2 não estão no histórico remoto. `list_branches` retornou lista vazia. Não existe staging identificado neste acesso. **Criadas/revisadas: onze migrations locais. Executadas: somente no banco isolado. Aplicadas remotamente nesta rodada: zero.**

[Evidências remotas](evidencias/conferencia-remota-2026-10-14.json), [consulta exata de compatibilidade](evidencias/compatibilidade-remota-mcp-2026-10-14.json). O inspector MCP executa como postgres; suas leituras não constituem ensaio de isolamento como runtime. As policies permissivas continuam no alvo atual, pois não houve DDL remoto.

Os advisors filtrados não apontaram novos findings específicos de garimpa. Há aviso global de proteção contra senhas vazadas desabilitada; sua revisão fica com a configuração de Auth do projeto compartilhado: [orientação oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Nenhuma configuração de Auth ou schema de outro produto foi alterada. A consulta de logs agregou fontes do projeto nas últimas 24h; não associou eventos ao deployment BizuMiner nem provou ausência de incidentes.

## Impedimentos e critérios de saída

| Impedimento | Situação e saída objetiva |
|---|---|
| Adoção de contexto legada — EP-10A/G-SEC | admin-db, curation-db, member-db, extension-db, editorial-selection-db e PgStore/CLIs ainda contêm consumidores privados sem o novo contexto. [Inventário](evidencias/inventario-contexto-legado-pendente.json). Adaptar cada fronteira com identidade/membership ou credencial de worker/dispositivo comprovada; testar fluxos legítimos da casa, comprador, extensão e cron sob RLS. Não resolver com policy ampla ou tenant implícito global. **Impedimento técnico, não decisão comercial pendente.** |
| G-ENV | Identificar staging isolado e deployment/commit; aplicar a cadeia somente nele depois de cobrir os consumidores. Pergunta de identificação enviada ao usuário. Não usar o banco conectado com vendas como staging. |
| EP-10B/G-SEC | Executar matriz owner/operator/nonmember/suspended para dados, arquivos, exports e jobs, A/B/A com sessões independentes e pooler; demonstrar Auth/Storage e browser. Localmente apenas a superfície comercial ensaiada está verificada. |
| G-EVIDENCE/G-PRICE | Coletar configuração/currency confiáveis, executar EXP-02 e homologar thresholds com responsável editorial antes de E3 comercial. Valores desconhecidos não recebem padrão que simule comprovação. |
| G-RUBRIC | Ratificar rubrica e amostra de 30–50 avaliações humanas; sombra não equivale a assistência ratificada. |
| G-RIGHTS/G-PROGRAM | Homologar licença de assets e regras de monetização/canal por material; texto manual não autoriza artes automaticamente. |
| G-FIN | Arquivo sanitizado da primeira venda necessário ao parser EP-08B. Registro manual não substitui importação validada de fornecedor. |
| G-CHANNEL | Escolher canal oficial/destino controlado e limites; outbox SQL não constitui worker de envio implementado/homologado. |
| G-PILOT/G-PRIVACY | Aprovar termos, quotas, suporte e dados do piloto; onboarding estrutural não autoriza convite real. |
| G-EXPERIMENT | Homologar métricas/coortes e promoção humana; contratos puros não constituem experimento operacional nem prova causal. |

A conferência permite usar as novas jornadas comerciais em homologação isolada. Não permite declarar EP-10 concluído, todos os épicos finalizados ou a aplicação pronta para rollout integral. O bloqueio de staging não elimina o trabalho técnico remanescente de contexto legado.

## Recuperação e próximos passos

1. Concluir o inventário de fronteiras legadas e adaptar contexto com autorização comprovada; acrescentar os casos ao ensaio, mantendo a operação antiga até a compatibilidade demonstrada.
2. Com staging identificado, snapshot recuperável do schema/dados sanitizados, conferir versão e histórico; testar as onze migrations, reexecutar preflight e jornadas browser/Auth/Storage/pooler/workers.
3. Produção continua usando seu schema atual. Antes de ativar, verificar deployment correspondente e gates; não aplicar M-10A2 antecipadamente. Se algum arquivo já tiver sido aplicado em outro alvo, usar migration aditiva, não editar história aplicada.
4. Recuperação após ativação deve conservar revisões, links, cliques e lançamentos: suspender destino/contas afetados, manter versão do app que estabelece contexto e corrigir aditivamente. Não reabrir permissões true, apagar fatos comerciais ou reutilizar aprovações. Antes da aplicação remota não há reversão de dados a fazer nesta rodada.

O relatório anterior de STATUS foi preservado [como registro histórico](evidencias/STATUS-EXECUCAO-antes-da-conferencia-final.md). Seu “integralmente concluído” foi substituído por estados compatíveis com as evidências atuais.
