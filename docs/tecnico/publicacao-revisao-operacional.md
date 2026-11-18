# Pacote de publicação da revisão operacional — fases 1–5

Estado: **publicado em produção em 17/11/2026 às 00:20 (São Paulo)**, após autorização para os três passos de aplicação, publicação e conferência real. Web e executor BizuMiner estão saudáveis; as três expansões foram aplicadas. A conferência técnica remota está registrada abaixo; o aceite humano de autonomia continua separado. Não houve push nem envio a clientes. O pacote foi produzido por `tools/editorial-tests/package-operation-release.py` em `.codex-tmp/operacao-fases4-5/`, depois da homologação registrada em `docs/implementation/evidencias/operacao-fases4-5.json`.

O arquivo `bizuminer-operacao-fases4-5.tar.gz` contém os componentes atuais e o `release-manifest.json`. O manifesto identifica HEAD, **também inclui as alterações locais e arquivos novos**, registra SHA-256 de cada arquivo e o BUILD_ID verificado. `receipt.json` identifica o hash do próprio arquivo. Não se deve representar esse checkout apenas pelo commit HEAD. O pacote inclui fonte completo dos componentes afetados e referências/testes; não inclui `.env`, segredos, node_modules, cache Next, dados do banco, sessões de teste nem imagens de outros aplicativos. É um pacote de fonte verificável, não uma imagem pronta com configuração de produção.

## Componentes e compatibilidade

| Componente | Conteúdo / motivo |
| --- | --- |
| `garimpa-web` | Hoje, menu, configurações, contexto de conta, Capturas, Curadoria, Pauta e leitores operacionais. O build importa código dos pacotes capture e persistence. |
| `garimpa-capture-executor` | O listener `packages/web/bin/listen-capture-batches.ts` importa o worker de atributos, alterado na fase 3 para diagnóstico sanitizado e limite observado. Recompilar o consumidor com a mesma revisão, conservando sua configuração e autorização atuais. |
| Banco | Três expansões abaixo, além dos pré-requisitos reais já instalados. |
| Extensão | Não precisa de atualização para usar esta revisão. Versão 1 do contrato, requestId, fingerprint e pareamento continuam válidos. A fonte é incluída para identificação; não instalar uma versão como efeito deste pacote. |

Expansões diretamente exigidas por este objetivo, em ordem:

1. `20261115234320_capture_activity_history.sql`: acesso de leitura ao histórico de recibos, identidade invocadora e índices.
2. `20261116195549_curation_operation_diagnostic.sql`: diagnóstico opcional, índice de histórico e limite observado do orçamento.
3. `20261117003000_curation_operation_reader.sql`: projeção de leitura para dono/operador. Mantém o job bruto e a auditoria/liberação sob as permissões anteriores; não expõe prompt, input_snapshot, resposta de modelo, fingerprint ou worker id.

O leitor para operador acusa indisponibilidade se a terceira expansão estiver ausente; não representa jobs invisíveis como zero. O dono conserva leitura compatível durante a transição. A projeção usa os privilégios do dono da view, com `security_barrier`, validação de conta/membership/role ativa em cada linha e apenas SELECT para `garimpa_app`; conferir proprietário e privilégios dos helpers no destino. Nenhuma nova permissão pública é necessária.

## Procedimento de aplicação no destino

1. Identificar o destino autorizado, revisão e digests **atuais** de web/executor, schema/migrações aplicadas e extensão instalada. Comparar o manifesto completo do pacote com essa revisão; este checkout contém alterações anteriores à revisão operacional. Não aplicar todo o catálogo de migrations indiscriminadamente.
2. Registrar backup recuperável e os digests de retorno antes da mudança. Conferir que os três workflows continuam desativados, sem execuções pendentes. A suspensão foi determinada pelo dono em 15/11/2026 e não é revogada por publicação.
3. Ensaiar apenas as expansões pendentes sobre cópia compatível do schema real, incluindo proprietários e ACLs do destino. Aplicar expansão antes dos leitores que a exigem, com limite de espera/timeout e recibo da transação. Não executar backfill que invente associação histórica, resultado de job ou limite de orçamento.
4. Reconstruir web e executor a partir do mesmo snapshot, com as dependências travadas e a configuração existente do destino. Não transportar URLs/Auth de fixture, arquivos `.env` de teste ou BUILD_ID como credencial de produção. A publicação é restrita aos dois serviços BizuMiner; PostSpark, DNS, infraestrutura e outros aplicativos ficam fora do escopo.
5. Preservar cotas, flags, allowlists e todos os agendamentos suspensos. Não habilitar workflow, `schedule`, worker alternativo ou captura externa para demonstrar a interface. O executor já autorizado mantém suas proteções contra efeitos incertos.
6. Homologar por leitura autenticada: Hoje, conta e timestamp; localizar recibo/lote existente; abrir detalhe e item; retornar ao filtro; comparar Curadoria e Pauta nos dois canais; operador/conta alheia/vínculo revogado; mobile e recarga. Não liberar os resultados incertos reais como teste. Captura ou chamada externa adicional exige autorização para aquela operação/destino.
7. Registrar aplicação e aceite remoto separadamente da homologação local, incluindo estado dos workflows. A confirmação humana de autonomia deve registrar o que ainda exigiu chat, distinguindo defeito de informação de intervenção administrativa legítima.

## Retorno seguro

Se falhar a homologação, restaurar **os digests anteriores identificados na etapa 1** de web e executor, mantendo colunas/view/índices aditivos e todos os recibos, observações, avaliações, jobs, limites consumidos e confirmações. Não usar down migration destrutiva, reset de orçamento, nova captura ou liberação coletiva como retorno. Não reativar produtor legado nem agendamentos.

Conferir compatibilidade das imagens anteriores com as expansões conservadas e as gravações ocorridas durante a janela. Uma restauração de banco seria outra operação, com impacto próprio e autorização específica; não é a reversão normal desta publicação. A view de leitura pode permanecer sem ser usada pelos leitores anteriores. Após o retorno, repetir login e consultas de conta/histórico/pauta e registrar o resultado.

## Limites da homologação local

PostgreSQL 17.12 nativo descartável e Next real foram utilizados com papéis de runtime restritos. O SDK Supabase instalado operou contra Auth sintético em loopback; isso não valida o Supabase hospedado, pooler, domínio, lojas ou modelo externos. Avaliações e dados comerciais foram sintéticos. Concorrência de banco, rollback e confirmação idempotente foram testados em sessões independentes; a observação do browser também tem testes com relógio virtual para falha, aba oculta, espera e resposta tardia. Mobile foi verificado por viewport/DOM, dimensões dos controles e teclado; não foi um aparelho físico. O pacote não é aceite remoto nem comprovação de operação autônoma permanente.

## Aplicação e conferência em produção — 17/11/2026

Destino: `https://www.bizuminer.com.br`, runtime existente da VPS, contexto `contexts-operation-20261117T030142Z`. Somente `garimpa-web` e `garimpa-capture-executor` foram recriados. Os outros 14 containers permaneceram com as mesmas identidades. A única mudança de configuração foi a referência ao contexto Garimpa; os arquivos privados de ambiente, cotas, flags, allowlists e configuração PostSpark foram preservados byte a byte.

| Componente | Imagem publicada |
| --- | --- |
| Web | `sha256:1ca978603a82aaa5d6f5879ac887dd2f84ebeda07800212658241a7d5f5ab246` |
| Executor | `sha256:e3a2d26a4f5c1bd00e918b74f0026ff9549b8cbee2f8b5672e9d4e61cfec3cb5` |

O pacote de fonte aprovado conserva SHA-256 `5936858da0b5a87af71f73177b9380bc889d25e46cec5afbd37c68eb3402f61e`. O contexto Docker contém 995 arquivos verificados por manifesto, sem configuração privada. O PostgreSQL do destino permaneceu na versão 17.11. Houve backup Garimpa em formato custom, restauração numa cópia privada e ensaio das três expansões antes da aplicação real. A transação única teve limite de espera de 5s e de instrução de 60s. O executor anterior foi parado de forma graciosa para a comparação e aplicação; depois retomou a configuração já existente. Jobs incertos não foram liberados, orçamento consumido não foi zerado e não houve backfill de fatos.

O primeiro ensaio de imagem interrompeu o procedimento antes de alterar produção porque o verificador esperava o login `garimpa_app`. O login real é `bizuminer_web`, com herança de `garimpa_app`, sem superusuário ou BYPASSRLS. Corrigiu-se somente a expectativa do verificador e repetiu-se o ensaio. Não houve concessão de acesso nem alteração de credencial. A view foi criada por `supabase_admin`, com `security_barrier`, no destino correto.

Os leitores da imagem final foram exercitados com dados reais copiados e depois no banco principal, usando o login real restrito: Hoje/andamento, quatro lojas, histórico, recibo manual com observações, lote com 12 buscas e oferta operacional. As comparações conservaram observações, recibos, jobs, publicações, exposições e consumo de orçamento nas consultas; houve zero tentativas de HTTP externo nesses probes. Um operador descartável existiu **somente na cópia** e comprovou o mesmo andamento do dono, jobs brutos privados e liberação de resultado incerto recusada. A cópia foi removida ao terminar; não se criou usuário nem vínculo em produção.

No navegador autenticado real foram conferidos Hoje, filtro Amazon → recibo de 81 produtos/81 observações → oferta → recibo → mesmo filtro, item com avaliação incerta e seu retorno, Pauta WhatsApp com 12 ofertas e Stories com 8, além da recarga e do contexto de conta. Um pedido de conta sem vínculo exibiu Sem acesso, sem retornar dados da casa. Em viewport 390px, Hoje não teve rolagem horizontal; menu abriu, Escape fechou e o foco retornou ao botão. A viewport foi restaurada. Não houve aparelho físico, captura externa de teste, liberação de jobs ou confirmação de envio a clientes.

Durante a conferência o executor já existente continuou escoando sua fila até chegar a zero na fila e zero em execução; 33 avaliações incertas anteriores à troca e seis conferências aguardando navegador permaneceram identificadas. Os antigos diagnósticos não registrados continuam desconhecidos. Enquanto avaliações alteram a revisão da pauta, Hoje pode informar que a seleção preparada ainda não é consultável; abrir o canal consulta/prepara o cache pelo fluxo existente. O resumo não inventa zero nem recompõe a edição a cada poll. Os números de 12/8 são retratos da consulta, não garantia permanente de disponibilidade.

Os workflows `capture-offers.yml`, `discover-shopee.yml` e `monitor-prices.yml` foram reconferidos como `disabled_manually`, sem runs pendentes ou em andamento. Não houve reativação de agendamento. O recibo sanitizado está em [operacao-publicacao-20261117.json](../implementation/evidencias/operacao-publicacao-20261117.json), com [imagem de Hoje em produção](../implementation/evidencias/operacao-producao-20261117.jpg). Backup, logs privados e imagens anteriores de retorno permanecem no diretório privado da release na VPS.

**Aceite humano pendente:** o dono deve usar Hoje → Capturas → Curadoria → Pauta e registrar o que ainda exigiu chat. A publicação e a conferência técnica estão concluídas; elas não comprovam, por si, autonomia permanente nem resolvem automaticamente as pendências de negócio já existentes.
