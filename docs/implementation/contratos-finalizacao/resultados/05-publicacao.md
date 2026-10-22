# Encerramento atual OS-05 — Publicação

Estado: CONCLUIDO

A correção autorizada OS-12 permitiu publicar a candidata **READY** `dpl_EwDxnLU8t7BLFrNFVjsnxbWQVuhp`, URL `https://web-ksp090vwr-emanuels-projects-aa92a126.vercel.app`, e promovê-la aos três domínios canônicos/alias do projeto. Lista de aliases com falha na promoção retornou vazia. Build remoto Next15.5.23 concluído no projeto Node24.x. Home real retornou200, título BizuMiner,242.485 bytes; não é página de build/SSO.

AC-1 PASS: upload final460 arquivos exatos, duas gitignore omitidas pelo CLI; zero extra/segredo.460 fontes originais intactas, somente C/manifesto do delta12 alterados. Mantidas as quatro remoções previstas. Tipagem/build isolados exit0 e testes funcionais OS-01/12 nas mesmas fontes. Commit auditado **f60b6187ada88addd37ff5b967f1d0f2e8eca2b9**.

AC-2 PASS de publicação: main GitHub recebeu fast-forward43700c59→f60b618 a partir do clone isolado, sem commit/push no checkout compartilhado. Cron usa main; captura usa fallback main porque GITHUB_CAPTURE_REF não está configurada. Dois workflows agora publicados, ambos disabled_manually; nenhum run disparado. Código de extensão publicado, sem alegar instalação/distribuição em dispositivo ou smoke que não ocorreu; uso real pertence à OS-06. Scripts de triagem/dispatch/captura estão na mesma ref, sem processo local ativo identificado. Nenhuma migration automática no push: apenas workflows de captura manual e monitoramento, sem db push; novas fontes SQL não são aplicação.

AC-3 PASS: fonte persistida em GitHub, deployment imutável e delta12 rastreáveis; mesmas fontes passaram nos ensaios nativos B/C e a candidata já serve com B. Backup seletivo recuperável OS-02 preservado. Recuperação pós-C exige versão compatível/manutenção e reparo delimitado; não voltar indiscriminadamente à versão antiga.

**Manutenção permanece ativa:** paused=false somente para permitir builds; Vercel Authentication all cobre público e previews, autoassignfalse. Novos hosts devem passar em HEAD anônimo antes do uso; nenhum fluxo foi reaberto publicamente. O código ativo nos domínios já é a candidata; Google OAuth não foi alterado. Não confundir promoção protegida com retomada OS-09.

Próxima etapa OS-06: login Google pessoal e smokes operacionais usados. C ainda não aplicada, controle false. Nova aprovação técnica do hash C está em [parecer12](12-auditoria-entrega.md), condicionada à OS-06. [Evidência atual e histórico](05-publicacao.json).

## Histórico preservado — bloqueios anteriores superados

# Resultado OS-05 — Publicação

Estado: BLOQUEADO

## Trabalho executado

Montadas e conferidas as 462 fontes aprovadas, mantendo as quatro remoções previstas. Clone isolado em `/tmp/bizuminer-finalizacao/os-05/candidate`, commit local `0b9b1468d4774b7e5014f09e1775695ddbea005f`; nenhum commit/push no checkout compartilhado e nenhum push remoto. A primeira inspeção detectou arquivos da base fora do pacote; antes do envio foi montada pasta de upload contendo somente as fontes autorizadas. Dry run final: 460 arquivos enviados, as duas `.gitignore` omitidas pelo CLI, zero arquivo extra ou segredo.

`npm run typecheck --prefix packages/web` e `npm run build --prefix packages/web`, na pasta isolada `deployment`, Node22.23.2, passaram com exit0. A tentativa anterior de build no sandbox falhou sem detalhe suficiente do webpack; a execução isolada com as permissões de runtime necessárias passou com as mesmas fontes. Suites funcionais da OS-01 continuam válidas, sem alterações nos bytes. Vercel mantém Node24.x/root packages/web/sourceFilesOutsideRootDirectory=true; compilação remota ainda não ocorreu.

Publicação enviada com production/skip-domain: `dpl_99SnFf3VGpxHoRGrToR8KPBLT2Ry`. Uma segunda hipótese, preview protegido com as mesmas fontes: `dpl_2dNkpAtGec4qVUmz5eVKNsMdN76b`. Ambas ficaram BLOCKED, buildSkipped=true e alwaysRefuseToBuild=true, com motivo explícito: `This deployment couldn’t be built because the project was paused.` Não repetir essas tentativas sem resolver a manutenção.

HEAD/GET autenticado da candidata retorna200, mas o conteúdo tem título **Deployment is building**, não o BizuMiner. Isso não comprova publicação. GET reservado do deployment legado `web-1zhwnn9dy-emanuels-projects-aa92a126.vercel.app` retorna200 e a home BizuMiner após B; não equivale a smoke da candidata.

GitHub: main permanece43700c59, único workflow remoto de monitoramento permanece disabled_manually, zero hooks de repositório; nenhum writer disparado. Supabase retorna lista vazia de branches. Nenhuma migration é aplicada por estes comandos. Variáveis foram inspecionadas apenas por metadata, sem decrypt/valores; GITHUB_CAPTURE_REF não foi alterada. Não há comprovação de refs/consumidores novos publicados.

## Aceites e fronteiras

AC-1 BLOQUEADO: upload existe, mas build/serviço da candidata não. AC-2 parcial: antigos drenados, porém novos refs não publicados. AC-3 parcial: insumos auditados e backup existem; falta artefato remoto compatível efetivamente executável.

[BLOQUEIO DE FRONTEIRA]
Ordem: OS-05 / `ordens/05-publicacao.md`.
Evidência: os dois deployments acima são explicitamente bloqueados pela pausa do projeto. A prova da OS-02 cobriu acesso reservado a deployment antigo, sem comprovar build novo sob pausa; esta limitação foi identificada posteriormente e não deve ser omitida.
Necessidade: revisar somente o mecanismo de manutenção/publicação para permitir build mantendo todas as URLs fechadas ao público e writers suspensos. Alternativa concreta proposta, NÃO executada: Vercel Authentication `ssoProtection.deploymentType=all` no mesmo projeto, confirmar configuração antes de unpause, conferir bloqueio público depois, testar candidata, restaurar proteção anterior somente após aceite/retomada. Falha de proteção exige repause imediato. Não alterar Google OAuth ou Supabase. A documentação oficial declara All Deployments disponível em todos os planos, sem add-on pago; equipe atual Hobby active. Essa configuração não foi contratada nem alterada.
Fronteira: configuração de proteção não incluída na escrita remota da OS-05; requer ordem/autorização localizada. Foram solicitadas as decisões específicas, sem tratar silêncio como aprovação.
Preservado: fontes/SQLs/manifesto, outros projetos, dados originais e backup; controle false, C ausente, Vercel continua pausada e monitoramento suspenso.
Retomada: autorizar/delimitar manutenção substituta; publicar/testar versão real; só então OS-06. Não promover deployment bloqueado nem despausar deixando URLs públicas abertas.

Fronteira SQL independente confirmada pelo auditor técnico: C antiga falha exclusivamente no inventário ordenado de26 funções em en_US.UTF-8. Demais agregados e58/58 triggers exigidos conferem; trigger legado adicional aceito. Correção mínima é `COLLATE "C"` no ORDER BY dessa guarda e no gerador, novo hash/envelope, contraprova nas duas collations e nova aprovação técnica. Não reaplicar A/B, recapturar catálogo ou alterar policies para fazer o teste passar. A autorização específica para corrigir arquivos protegidos está pendente.

OS-06–10 não foram liberadas: publicação não concluiu, C antiga não está apta, smokes reais/login/integração/retomada e fechamento continuam pendentes. As capacidades comerciais da OS-11 mantêm as entradas ausentes do registro original; não declarar Blueprint ou núcleo concluído.

Alterações próprias desta ordem: somente resultado/JSON e temporários isolados. [Evidência](05-publicacao.json).
