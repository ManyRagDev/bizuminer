# Aceite atual OS-06 — concluído em 16/10/2026

Estado: CONCLUIDO para a continuidade homologada da conta própria: web, catálogo/links, curadoria e worker de monitoramento. Captura por dispositivo/navegador e descoberta automática não homologadas permanecem paradas e fora da retomada. Não se declara capacidade opcional entregue por exclusão.

- Google/Vercel e Google/BizuMiner concluídos pelo proprietário; sessão real observada no /admin canônico e conta BizuMiner (casa). Curadoria e seleção de24 produtos carregaram. Adiamento de um item pendente e retomada imediata passaram:28 pendentes/zero adiados novamente. Autoria em product_curation corresponde a membership owner ativa. Essas ações existentes não geram curation_event; nenhum evento foi inventado.
- Monitoramento da candidata exata, limitado a1 por loja, conta local, com gravação real autorizada: Shopee exit0, fila vazia, run52e604b4-447a-4991-b6f5-6524c0eba0fa; AliExpress exit0,1 consulta/1 observação/zero erros, run526cbc9c-bc8e-4cc7-b34f-7add9a94d9ac. API Shopee não homologada por fila vazia. Não foi criado lote ou captura fictícia.
- Deltas legítimos desde OS-02: last_seen do login em app_user; dois capture_run; uma price_observation e atualização do produto AliExpress; reviewer/updated_at de product_curation pela ação reversível. Contagens atuais:1.657 produtos,9.339 observações,409 execuções,1.495 publicações,172 links,767 cliques. Demais23 projeções originais iguais; oito schemas externos iguais.
- Backup atualizado em /home/many/.local/share/bizuminer/backups/20261016-os06-antes-c.dump (6.604.810 bytes,0600, SHA256 be68a6a809536ed1cdc21a30015a5bcf5edad4268f4bd3d9d8e263d428c60d58), acompanhado de20261016-os06-seeded-data.json/metadata. Contém DDL atual e dados, com dois registros internos exportados separadamente;36 outras tabelas novas administrativamente confirmadas vazias. Restore real local17.11:28 contagens/digests e dois registros internos conferem;66 tabelas,180 policies,145 FKs, uma FK NOT VALID exatamente como B1617. Relatório inicial reutilizou assert pré-A de zero NOT VALID; foi reconciliado com a origem sem alterar SQL/testes. Comparação de timestamps dos seeds normalizada UTC. Cluster encerrado. Backups anteriores preservados.
- Controle comercial false. /admin/campanhas recusou carregamento; log real confirma commercial_rollout_not_ready e digest1458069177: negação prevista pelo gate, não certificado de UI comercial. A tela será reavaliada após C. Nenhum reparo de OAuth/código foi necessário para o login; as guias travadas foram substituídas pelo proprietário.
- Proteção all/candidata READY/commit f60b6187 mantidos, ambos workflows disabled_manually e zero sessões runtime ativas antes de C. SQL e fontes permanecem exatos. Extensão/dispositivos e descoberta automática continuam sem ativação; não recebem PASS. Smokes públicos/runtime anteriores reutilizados nos mesmos bytes e serão repetidos após C.

Próxima operação já autorizada: OS-07, unidade C inteira do hash aprovado12, mantendo manutenção e backup válido. Não há nova aprovação genérica solicitada. Evidência detalhada em06-pre-c.json/finalAcceptance; temporários privados em /tmp/bizuminer-finalizacao/os-06/.

---

## Histórico anterior preservado

# Resultado OS-06 — Aceite pré-C

Estado: NAO_VERIFICADO — depende da sessão pessoal do proprietário e dos smokes operacionais subsequentes.

Entrada: OS-05 CONCLUIDA; candidata `dpl_EwDxnLU8t7BLFrNFVjsnxbWQVuhp`, commit `f60b6187ada88addd37ff5b967f1d0f2e8eca2b9`, domínios promovidos sob Vercel Authentication all. B instalada, controle false. Hash corrigido de C aprovado pelo auditor12, mas C ainda NÃO aplicada. Nenhuma nova autorização genérica está pendente.

AC-1 pendente: aba do navegador Codex aberta em www.bizuminer.com.br/admin e encaminhada pelo login Vercel ao Google. Não há sessão de navegador disponível; tela ainda pede identificação. Login CLI/MCP não é sessão pessoal do BizuMiner. Proprietário deve completar seu login Vercel habitual e depois o Google OAuth existente do aplicativo. Não foram pedidos, extraídos ou gravados senha, cookies ou códigos de sessão. A aba foi mantida para a retomada. Não criar sessão administrativa artificial para substituir esse aceite.

AC-2 parcial, com provas reais somente leitura:

- Home200 na candidata real; detalhe de oferta existente200, sem página de erro. /admin sem sessão redireciona307 a /entrar; API admin sem sessão401. Acesso Vercel autenticado não substitui identidade no aplicativo.
- Link legado existente /p/33pu retorna302 a /bizu/ali-1005012705365068, sem seguir /go ou gerar clique. Resolver monetizado devolve destino válido s.shopee.com.br pela projeção restrita. Não há prova de link de campanha real12caracteres quando não existe campanha legítima.
- Script temporário runtime-readonly.cjs exit0 pela conexão efetiva garimpa_app, sem SUPER/BYPASS. Contexto é resolvido de uma membership owner existente, conta local; conta não vinculada é rejeitada. Leitura:1.657 produtos,9.338 observações,1.495 publicações,172 links. Worker lê1.657 produtos no contexto próprio. Tenant/ator são resetados após a transação; role pública recebe42501 ao tentar ler produto privado. Projeção pública ready=true, controle comercial false.
- Primeiro smoke escolheu o primeiro código armazenado e recebeu null por não ter oferta pública elegível. A função existente exige public_offer_rows; isso é resultado esperado, não reparo de aplicação. Reteste selecionou link existente elegível, passou e preservou o registro da primeira tentativa. Nenhum teste de aceite preexistente foi alterado.
- Consultas administrativas da projeção congelada confirmam todas as28 contagens/digests originais e os8 fingerprints de schemas externos iguais à OS-02. Sem DML deliberado nesta ordem.

AC-3 pendente: após login, verificar curadoria/autoria e caminhos de captura/monitoramento realmente usados; leitura de worker não comprova provedor/gravação, e teste local não comprova dispositivo. Componentes sem uso/prova ficam parados com limite explícito. Se smokes legítimos alterarem dados necessários à recuperação, alinhar backup/restore seletivo antes de C. Backup anterior OS-02 segue preservado; não foi substituído por simples contagem.

[BLOQUEIO DE FRONTEIRA]
Ordem: OS-06 / ordens/06-pre-c.md.
Evidência: navegador ainda na identificação Google do login Vercel; painel pessoal não observado. Runtime/HTTP públicos aprovados não demonstram OAuth do proprietário.
Necessidade: proprietário completar o login na aba aberta e confirmar chegada ao painel; depois continuar os smokes usados e registrar suas gravações reais.
Fronteira: credenciais/sessão pessoal, sem alterar Google OAuth ou gerar identidade fictícia.
Preservado: candidata publicada, SQL aprovado/testado, A/B e dados íntegros, backups privados, outros projetos, controle false, proteção all e dois workflows suspensos.
Retomada: confirmar a UI autenticada, concluir AC-1–3; só então OS-07 C inteira aprovada. OS-08–10 e retomada pública ainda não foram liberadas.

[Evidência sanitizada](06-pre-c.json). Escritas próprias: somente resultado/JSON e temporários desta ordem. Não há migração, clique, venda, convite, envio ou captura fabricados.

## Conferência na retomada em outro chat — 16/10/2026

Estado da OS-06: NAO_VERIFICADO somente quanto ao login pessoal e aos smokes operacionais que o seguem. Não há nova autorização genérica nem nova correção de código solicitada.

Conferência nova às 18:10–18:18 (America/Sao_Paulo): alvo Supabase confirmado; histórico contém A/B e não contém C. Verificador local exit0, C exata no hash aprovado pela OS-12. Os 462 caminhos do release31, com as exceções do delta12, e os quatro arquivos desse delta conferem sem divergência. HEAD local main43700c59 e alterações anteriores preservados.

As 28 contagens/digests da projeção congelada e os oito fingerprints de schemas externos permanecem iguais à OS-02. Backup persistente presente, 6.300.642 bytes, modo0600, SHA256 f61b2195cf75157e8ac5dbb646dcb1af507adf6d94a0a47819d80b2e6e1e25c1; ensaio de restauração é reuso da OS-02, não nova restauração. A consulta adicional de buckets usou outra serialização e não foi tomada como comparação com a baseline.

CLI autenticado confirmou candidata dpl_EwDxnLU8t7BLFrNFVjsnxbWQVuhp READY e produção nesse deployment; proteção all, paused=false, autoAssignCustomDomains=false. GitHub main segue f60b6187ada88addd37ff5b967f1d0f2e8eca2b9, ambos workflows disabled_manually; zero sessões runtime ativas no instante da consulta. Conector Vercel retornou403; a conferência pelo CLI ocorreu no mesmo projeto/equipe e foi somente leitura.

Smoke read-only repetido no pool real exit0: garimpa_app sem SUPER/BYPASS, conta owner local resolvida, conta alheia recusada, catálogo/worker/projeção/detalhe/link33pu/monetização válidos, contexto transacional resetado e leitura privada pública negada. Uma consulta de diagnóstico usou nome de tabela inexistente; foi substituída pela função existente commercial_rollout_ready(), que confirmou false. A primeira invocação Node apontou carregador tsx ausente; a execução nativa --experimental-strip-types passou sem alteração de fontes. Essas tentativas não realizaram escrita no banco.

A aba deste chat foi aberta no /admin canônico e deixada no login Google da Vercel, sem sessão pessoal disponível. Solicitação assíncrona pede ao proprietário completar Vercel e depois Google do aplicativo; nenhuma senha/cookie/code foi solicitado ou copiado. C continua não aplicada. Após login: concluir curadoria e captura/monitoramento usados, alinhar backup se houver gravação e executar OS-07 a10 na sequência já autorizada. Nenhuma mudança de código, SQL, deploy, workflow ou registro comercial foi realizada nesta retomada.
