# Homologação isolada e recuperação — candidata 19

15/10/2026. Roteiro preparado, **não executado remotamente**. A candidata está identificada no manifesto de fontes e no catálogo de migrations; o resultado local está no relatório 19.

## Entrada obrigatória de R13

O responsável deve identificar projeto/branch de staging isolado, URL da aplicação de teste, baseline e roles correspondentes, dados sintéticos/sanitizados e autorizar escrita somente nesse alvo. Confirmar por ferramentas o project ID, isolamento, schema e migration history; não inferir ambiente pelo nome da conexão. O projeto previamente conectado `spbuwcwmxlycchuwhfir` não foi comprovado como staging; a leitura de grants não autoriza alteração nele. Não há autorização tácita para deploy, mensagem ou convite real.

A skill [codex-executor](/home/many/.codex/skills/codex-executor/SKILL.md) determina: “Só aplique uma migration via MCP quando o pedido autorizar essa aplicação.” O alvo deve ser confirmado pelo retorno da ferramenta. Este roteiro torna a aplicação revisável, mas não substitui identificação e autorização do ambiente.

Confirmar que fontes e hashes ainda correspondem à candidata. Se houver mudanças desde o manifesto, executar os checks afetados e atualizar o registro. Não copiar credenciais/PII de produção para evidências de teste. Desligar captura automática/envios e manter o kill switch ligado no início.

## Sequência de aplicação e aceite

1. Registrar baseline de schema, grants, funções, policies, views, constraints, enum app_role e histórico de migrations. Comparar ao baseline de evidências. Criar snapshot/backup recuperável do staging. Verificar que a conexão runtime é `garimpa_app`, sem BYPASSRLS, distinta da administrativa.
2. Revisar os doze arquivos em `evidencias/execucao-19-migrations.json`, em ordem. As primeiras onze migrations são cumulativas e anteriores à expansão; não aplicar somente a última sobre o baseline anterior à V2. Se algumas já estiverem aplicadas, conferir versão **e conteúdo/hash**, não reenviar cegamente.
3. Executar cada migration somente no staging autorizado, respeitando transação e limites de lock/statement aprovados para o ambiente. Falha interrompe a sequência; não ignorar erro de UNIQUE, enum, FK, grant ou bucket público. Conferir catálogo e pós-condições a cada bloco. Não trocar `garimpa_app` por postgres para fazer um teste de isolamento passar.
4. Confirmar `private_artifact`, `governance_decision`, `price_calibration_run`, `dispatch_control`, `dispatch_reservation`, FKs com tenant, índice `comparison_review_pair_idx` limitado a `canonical_write`, FK histórica NOT VALID de avaliações, grants e views `effective_price_evidence_policy` e `curation_queue_facts`. A ausência de calibração compatível deve manter E3 desligado.
5. Confirmar bucket `bizuminer-private` privado, backend com chave de serviço somente no servidor e nenhum acesso anônimo/direto a objetos privados. Nenhuma policy deve conceder cliente genérico acesso ao bucket inteiro. Conferir tamanho/hash pelo adapter real. Falha após upload deixa registro reconciliável, sem confirmar artefato inexistente.
6. Instalar a candidata na aplicação de staging com configurações e origens explícitas; registrar deployment/hash sem habilitar canal real. Os testes SQL locais injetam factory e não validam a configuração do pooler desse deployment.
7. Executar a matriz abaixo com usuários sintéticos owner/operator de A, B e casa, uma pessoa com membership em A/B e um administrador de plataforma sem membership de cliente ativo. Registrar requests, IDs sintéticos, SQL/Storage e estado da UI, redigindo tokens/segredos.
8. Exercitar recuperação e repetir a jornada de comprador/extensão/casa/links legados. Emitir resultado por T/S/J e por CF, diferenciando aprovado, falhou e não executado. Falha material reabre a entrega afetada; não liberar cliente externo por contagem de testes verdes.

## Jornadas de navegador e runtime

| Jornada | Passos | Saída observável |
|---|---|---|
| J1 / revisão | Login, escolher conta, avaliar humano sem IA, recarregar, comparar em sombra com IA autorizada | Revisão persistida/autoria/digest e comparação compatível; sem aprovação automática; v1 pública preservada |
| Governança | Replays e amostra de produtos distintos; calibrar preço com relatório privado e dez casos | Replay não aumenta amostra; evidência falsa/sintética não libera E3; decisão humana/versionada registrada |
| Radar | Criar política própria, avaliar e monitorar oportunidade, inspecionar fila | Público/canal/conta e versão consistentes; nenhuma política da casa copiada implicitamente |
| Kit | Campanha, imagem própria autorizada, revisão, validar/aprovar, gerar/download PNG, registrar export e confirmar publicação | Arte/QR/link/preço da mesma revisão; export não é postagem; preço ou link alterado impede nova exportação |
| Financeiro | Subir CSV interno, visualizar erros, selecionar zero/algumas linhas, resolver revisão, importar quatro ajustes/replay | Original privado, seleção respeitada, uma conversão por identidade, ledger encadeado e origem desconhecida preservada |
| Experimento | Draft, aprovar método, assignment, medir dois outputs, aprovar candidata, revisar, promover e rollback | Par conta uma unidade; ausente vira incompleto; candidata sem aprovação nega; ponteiro/restauração corretos |
| J2 / SaaS | /plataforma, provisionar com vigência/termos/quotas explícitos, emitir token, aceitar em /convite, alternar A/B, onboarding | Identidade de sessão e e-mail confirmado, conta própria, etapas por fatos reais; sem segredo/dado cruzado |
| Saída | Export owner, negar operator/terceiro, suspender B, tentar comandos/segredos/jobs, reativar B | A/casa preservados; B bloqueada; export sem segredos; reativação administrativa auditada |
| J3 / continuidade | Home, /bizu, OG, /p, /go, membro, captura de dispositivo, callbacks e seleção antiga | Preço/dono/monetização e histórico preservados; link legado funciona sem atribuição inventada |

## Sessões independentes e falhas

PGlite verifica SQL/RLS e commits em uma instância, mas não duas conexões de rede simultâneas. Executar em PostgreSQL/pooler reais:

- Alternar A/B/A nas mesmas conexões reutilizadas; GUCs locais não persistem após commit/rollback. Sem contexto privado nega. Revogar membership/role/dispositivo e repetir o próximo comando.
- Duas sessões aceitando o mesmo convite: uma concessão; outra retorna uso já concluído ou rejeição, sem role ampliada.
- Duas sessões disputando última vaga de quota, mesmo commit financeiro, ajuste e reserva: no máximo um consumo/evento por identidade; nenhum lote parcialmente confirmado.
- Dois workers disputando job, token alheio/vencido, cancelamento entre preflight e marker: vencedor correto, zero I/O se cancelamento vence.
- Observar o marker de outra conexão **antes** do adapter; matar worker antes do marker, depois do commit dele e após confirmação do provedor antes de finalize. Sem marker recupera queued; com marker vira unknown e não repete automaticamente.
- Revogar credencial/destino, mudar preço/revisão, suspender conta, expirar entitlement e ligar switch antes do marker: nenhuma chamada de envio. O switch não desfaz I/O já iniciado.
- Timeout, exceção, resposta sem prova, 429 comprovadamente rejeitado e recusa de finalize: tentativa/reserva/job coerentes; desconhecido exige reconciliação. Confirmar manualmente com identificador do provedor e data observada atualiza publicação/reserva; sem prova não sucede.
- Falhar Storage antes/depois do upload e durante atualização de metadados; baixar como B, anônimo e por URL direta; alterar bytes de teste; verificar hash e recuperação do objeto íntegro. Não tornar bucket público para corrigir teste.

Envio positivo de canal oficial só ocorre depois de G-CHANNEL/G-PROGRAM, destino de teste controlado e autorização explícita desse envio. O CLI é `packages/web/bin/run-dispatch.mts`; executar através do loader tsx de `tools/editorial-tests`. `--help` não conecta. `--inspect --account CONTA --auth-user AUTH_USER` consulta escopo autorizado. `--execute` exige `DISPATCH_ADAPTER_MODULE`, `DISPATCH_CHANNEL_APPROVAL_REF` e `NEXT_PUBLIC_SITE_URL`, referência persistida correspondente e módulo revisado que implemente `createApprovedAdapter`. Não fornecer um adapter que sempre retorna sent para “validar” produção. Nenhum adapter oficial foi escolhido nesta rodada.

## Recuperação

Antes de aplicar, guardar versão de código e backup de staging. Se a migration falhar, interromper e inspecionar a transação/catálogo antes de corrigir; não executar o próximo arquivo sobre estado presumido. Se a aplicação falhar após expansão, conservar tabelas/colunas/histórico, desligar automação e voltar ao último código **compatível e seguro**. As telas novas possuem detecção da expansão, mas isso não substitui o rollout ordenado: as demais capacidades V2 exigem suas migrations.

Não executar down destrutivo, apagar ledger, editar revisão aprovada, perder tokens de lease ou marcar unknown como failed sem evidência. Recuperar artifacts pending/orphaned somente por objeto privado íntegro; objeto ausente continua pendente. Não há expurgo automático: retenção e exclusão aguardam G-PRIVACY. Export residual de conta suspensa requer política/caminho de plataforma autorizado, sem reabrir leitura privada geral.

Conclusão de R13 exige relatório do ambiente e hashes, resultados das jornadas, concorrência e recuperação, itens não executados e decisão por gate. Produção só entra em uma rodada posterior com autorização e alvo próprios.
