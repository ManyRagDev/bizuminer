# Prontidão, decisões pendentes e critérios de entrada/saída

## Atualização de 20/10/2026

O [levantamento](diagnosticos/estado-atual-2026-10-20/DIAGNOSTICO.md) e o [plano de conclusão](contratos-conclusao-2026-10-20/PLANO-ENTREGAS.md) são a referência atual de continuidade. Parser, resolver por conta e adapters oficiais receberam implementação/correções locais após a implantação do núcleo; suas pendências atuais são de homologação/ativação, salvo defeito comprovado novo. E3/rubrica, materiais/direitos, relatórios reais, canal/destino, experimento e piloto continuam condicionados às entradas e decisões próprias. Gates originais são preservados; tabelas datadas de 16/10 e anteriores abaixo são históricas e não ordenam reimplementar software já entregue.

## Atualização operacional de16/10/2026 — OS10

Núcleo implantado e retomado, conforme [OS10](contratos-finalizacao/resultados/10-fechamento.md). G-ENV de staging pago deixa de bloquear este caminho direto autorizado33/36; não se afirma staging existente. G-SEC/PRIVACY/PILOT de clientes externos continuam sem encerramento global.

| Capacidade | Estado atual | Entrada/trabalho restante |
|---|---|---|
| Operação própria/web/RLS/monitoramento | Implantada, testada no ativo, retomada | Observação limitada ao primeiro run09; sem promessa de ausência futura de regressões |
| Comparabilidade/E3 | Base conservadora instalada; E3 não promovido | Amostras reais por fonte, EXP-02/calibração e ratificação |
| Rubrica/assistido | Base/sombra instalada e testada localmente |30–50 avaliações humanas, método e ratificação |
| Campanha/kit/Storage | Leituras reais; jornada completa não homologada | Material/direitos autorizados, upload/download privado e render/export reais |
| Financeiro | Ledger/consumidor instalados, sem fato inventado | Relatório sanitizado; parser/adapter específico ainda exige implementação e homologação |
| Coleta multicliente | Não ativada | Credenciais/capabilities por conta e implementação de resolver/adapter/worker; falta técnica além de senha |
| Canal/envio | Core local instalado; oficial não ativado | Adapter/configuração/wiring oficial e destino/envio expressamente autorizados |
| Experimento | Base instalada; nenhuma promoção fabricada | Hipótese/coorte/métrica/amostra/critério aprovados antes de medir |
| Piloto SaaS | Não ativado | Termos/preço/quotas/suporte/privacidade/cliente autorizado e prova gerenciada integrada |
| Captura discovery/dispositivo | Capture-offers e dispositivos não retomados | Homologar versão/dispositivo/caminho real; não atribuir PASS por código existir |

Entradas, responsáveis e critérios completos permanecem em [CAPACIDADES-PENDENTES](contratos-finalizacao/CAPACIDADES-PENDENTES.md). OS11 recebe somente as entradas afetadas e deve produzir implementação específica; não encerra lacuna técnica por trocar um status.

---

## Registro anterior preservado — não representa o estado atual


Data 14/10/2026. Status é da **especificação para execução incremental posterior**, não do produto implementado. PRONTA: decisões fundamentais fechadas e trabalho executável após pré-condições normais. CONDICIONAL: entregas úteis executáveis, mas promoção/capacidade específica depende de evidência ou decisão indicada. BLOQUEADA: resultado completo exige decisão comercial/autorização específica ainda inexistente. Dependências técnicas planejadas não tornam toda spec bloqueada; devem estar satisfeitas antes da respectiva entrega.

## Gates explícitos

| Gate | Impedimento / responsável | Evidência necessária para encerrar | Impacto e trabalho permitido |
|---|---|---|---|
| G-ENV | Deployment, commit publicado, flags ativas e ambiente de staging não confirmados / operação+executor | Inventário de deploy/config sem segredos, comparação com banco identificado e baseline | Preflight de qualquer alteração real; não bloqueia planejamento. Banco conectado é identificado, vínculo ao deployment não demonstrado |
| G-BASE | Dois arquivos de testes web falham / executor técnico | Resolver ou comprovar limitação de ambiente com execução reproduzível; preservar log e impacto | Não declarar baseline verde; fluxo afetado não ativa sem validação. QR falha em networkInterfaces; capture-process stdout vazio tem causa pendente |
| G-EVIDENCE | Nenhuma variantKey observada no baseline; contrato v2 não produz dados por si só / executor de captura+curador | Por fonte habilitada, amostra com payload/proveniência e configuração/condições verificadas; demonstrar duas observações realmente comparáveis para E2, sem converter desconhecido em igual | 01-A precisa provar obtenção real, além de fixtures; fonte incapaz permanece E0/E1. Não bloqueia 01-0, recomendação qualitativa ou kit com preço observado; bloqueia alegação de comparação naquela fonte |
| G-PRICE | OPEN-03: política E3 de cobertura não calibrada / responsável editorial com análise técnica | EXP-02 com dez casos, threshold por fonte/categoria, bucket/window/gap/frescor e aprovação versionada | EP-01 condicional para E3; E0/E1/E2 delimitado e guardas de integridade podem ser entregues |
| G-RUBRIC | OPEN-01/02: amostra/rubrica e prioridades da casa não homologadas / proprietário+curador | 30–50 labels humanas, política de audiência/reviews e critério de promoção registrado | EP-02/03 em sombra/assistido; não ativar nova aprovação automática. Sem teto/piso universal |
| G-RIGHTS | OPEN-08: direitos/escopo das imagens por programa/cliente / proprietário com evidência de uso | Fonte, licença/permissão, canal, prazo e política de asset próprio; não basta URL pública | EP-06 imagem comercial condicional; copy e material com imagem própria autorizada podem avançar |
| G-PROGRAM | OPEN-09 e V-07: termos/capabilities/subIDs/fontes atuais por programa / dono da conta+executor | Registro de documentação oficial vigente e verificação de conta/credencial/canal permitido | EP-07 por loja e EP-11/12; atribuição interna não depende de subID, monetização válida sim |
| G-FIN | OPEN-05: relatório real da primeira venda e formato de comissões ausentes / proprietário | Arquivo autorizado/sanitizado com semântica de IDs, moedas, estados e ajustes; fonte da venda | EP-08 manual declarado pode avançar; parser do programa e atribuição documentada condicionais |
| G-EXPERIMENT | Amostra, hipótese e critério de promoção não aprovados / responsável editorial | Definição antes de medir, coorte e denominadores, volume mínimo, decisão humana | EP-09 descritivo/shadow executável; promoção automática ou prova causal não liberada |
| G-CHANNEL | OPEN-04/06: primeiro destino e nível de automação não definidos / proprietário | Canal escolhido, destino controlado de teste, autorização de envio, limites/kill switch e capability oficial verificada | EP-11 bloqueado para integração completa; Telegram é candidato, não autorização tácita |
| G-PILOT | OPEN-07: funções, preço/condição, duração, quotas e suporte do piloto não aprovados / proprietário | Plano piloto versionado e cliente autorizado; não inferir gratuidade ou preço | EP-12 bloqueado para entrada de cliente real; infraestrutura de onboarding pode ser preparada |
| G-PRIVACY | Retenção, uso de imagens/dados/reutilização e condições de export/encerramento externo pendentes / proprietário | Política de dados aprovada, minimização, retenção por classe, destino e acesso de suporte | Antes de importar dados pessoais desnecessários ou abrir SaaS; sem compartilhar resultados privados para treinar motor |
| G-SEC | Isolamento real ainda não implementado/verificado / executor+revisor de segurança | EP-10A e relatório 10B contra versão exata de DB/web/workers/storage, T17/J2 verdes | Bloqueador absoluto de EP-12 e de contas externas em 11; sem exceção comercial |

Pergunta consolidada sobre canal, imagens, relatório e piloto foi feita durante este planejamento. Sem resposta incorporada nesta versão, nenhuma decisão foi presumida. Registrar resposta futura como decisão datada e atualizar somente os gates/trechos afetados.

## Índice de execução por dependências

Revisado em [09-REVISAO-DE-VIABILIDADE](09-REVISAO-DE-VIABILIDADE.md). A ordem abaixo prioriza resultados verificáveis; ramos condicionados não bloqueiam os independentes. Todas as specs permanecem no escopo integral. EP-10A continua obrigatório para novas estruturas e acesso privado; a única antecipação funcional de preço é 01-0, sem DDL. Não executar o conjunto como uma única rodada de deploy.

| Ordem | Spec | Status | Entrada | Saída verificável |
|---|---|---|---|---|
| 1 | [EP-00](epicos/EP-00.md) | PRONTA | Repo+leitura do alvo | Baseline reconciliado, ambiente identificado, riscos/gaps explícitos |
| 2 | [EP-01-0](epicos/EP-01.md) | PRONTA, entrega parcial | 00, G-ENV e baseline do fluxo afetado | Claims sem suporte contidos na aplicação; preço/data/compra preservados; sem DDL |
| 3 | [EP-10A](epicos/EP-10.md) | PRONTA | 00, identidade/roles observadas | Conta contextual, tx real, policies/segredos isolados, casa preservada |
| 4 | [EP-01 A/B/C](epicos/EP-01.md) | CONDICIONAL | 00/10A; G-EVIDENCE para comparações; G-PRICE para E3 | Evidência única inclusive view, histórico preservado, claim seguro |
| 5 | [EP-02](epicos/EP-02.md) | CONDICIONAL | 00/10A e contrato 01; G-RUBRIC | Q/V/O/A em sombra e rubrica ratificada para promoção |
| 6 | [EP-03](epicos/EP-03.md) | CONDICIONAL | 01/02, política ratificada | Radar/pauta por contexto e prioridade de observação reproduzível |
| 7 | [EP-04](epicos/EP-04.md) | PRONTA | 03/10A | Campanha+draft+revisão+link básico utilizáveis, web intacta |
| 8, ramo financeiro | [EP-08 A/C manual](epicos/EP-08.md) | CONDICIONAL | 04/10A e dados autorizados; parser não exigido | Venda declarada, custos e receita SaaS separados, sem atribuição inventada |
| 8, ramo operacional | [EP-05](epicos/EP-05.md) | PRONTA | 03/04/01 | Pauta/Radar/Resultados com ações reais e estados desconhecidos honestos |
| 9 | [EP-06](epicos/EP-06.md) | CONDICIONAL | 01/04; G-RIGHTS/PROGRAM por material | Kit revisado/aprovado/exportável, rechecagem e invalidação verificadas |
| 10 | [EP-07](epicos/EP-07.md) | CONDICIONAL | 04/06, programa habilitado | Export≠confirmado; canal distinguível; monetização preservada |
| 11 | [EP-10B](epicos/EP-10.md) | PRONTA | Base comercial instalada; repetir após construir 12-A em ambiente isolado, antes de convite; 09 não exigido | Matriz negativa completa por role, DB, Storage, URL e worker para versão exata |
| 12, conforme gates | [EP-12](epicos/EP-12.md) | BLOQUEADA | 04/05/06/07/10B + G-PILOT/PRIVACY/PROGRAM; 08-A/C para promessa financeira/cobrança | Piloto autorizado completa campanha própria e suporte/saída |
| Ramo após 08-A | [EP-08 B/C importado](epicos/EP-08.md) | CONDICIONAL | G-FIN; 07 para atribuição de canal | Importação real idempotente, estados financeiros reconciliados |
| Ramo após 02/07/08 | [EP-09](epicos/EP-09.md) | CONDICIONAL | Métricas disponíveis; G-EXPERIMENT para promoção | Relatórios por coorte, sombra e decisão humana auditável |
| Ramo após 06/07 | [EP-11](epicos/EP-11.md) | BLOQUEADA | 10A + G-CHANNEL/PROGRAM; 10B externo | Envio autorizado comprovado, unknown/retry/kill switch seguros |

São 13 specs, EP-00 a EP-12; 01, 08 e 10 aparecem por entregas internas, sem épicos novos. Totais por spec: **4 PRONTAS** (00,04,05,10), **7 CONDICIONAIS** (01,02,03,06,07,08,09), **2 BLOQUEADAS** (11,12). A prontidão de 01-0 não promove o restante de EP-01. Status PRONTA de 10 é documental: seu rollout continua estrutural e de risco alto.

## Decisões que não serão reabertas implicitamente

- Afiliação própria e SaaS são permanentes, complementares e usam motor comum.
- Produto caro não é erro por ser caro; piso/teto comercial pertence a contexto, integridade de preço é universal.
- Histórico incompleto impede claim não sustentado, não elimina toda recomendação.
- Publicação web, aprovação, exportação e envio real são entidades/estados diferentes.
- Novo código não usa local como autoridade; URLs antigas da casa preservam resolver compatível.
- RLS externa e isolamento de credenciais são gates de segurança, não configuração opcional de plano pago.
- Sem autorização de escrita futura, migrations permanecem arquivos revisados; esta entrega não concede autorização remota.

## Preflight breve para executor futuro

Ler esta pasta, conferir diff desde baseline e instruções atuais; confirmar dependências/flags/gates da entrega escolhida; revalidar objetos/callsites afetados e comandos reais. Se houver compatibilidade, executar sem redesenhar domínio. Se houver mudança material que contradiga contrato, registrar divergência precisa e suspender só a parte afetada. Não replanejar todos os épicos por rotina, nem executar plano antigo cegamente. Produzir relatório de execução em `docs/implementation/` ao concluir.
