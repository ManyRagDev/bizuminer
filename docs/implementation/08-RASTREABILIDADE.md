# Rastreabilidade integral

## Atualização de 18/10/2026 — correções OS-020 a OS-025

A matriz original de requisitos abaixo permanece a autoridade de identidade/contrato. A consolidação OS-19 que associava REQ-DOM-05 a outbox e afirmava 62 requisitos homologados no ativo foi corrigida: **REQ-DOM-05 trata identidade/equivalência/matching entre lojas**, com os limites originais preservados.

| Fronteira / requisitos originais | Implementação e prova corretiva local | Homologação no ativo / ativação |
|---|---|---|
| C-07; REQ-MET-01…05 | OS-020: parser multi-rede, CSV BR e ledger idempotente | Não certificada nesta rodada; dados reais não inventados |
| C-01; REQ-DOM-01…04 / REQ-SAAS-01…05 / REQ-MON-01…03 | OS-021: credenciais próprias e worker com tenant, publicação isolada, rechecagem; fixture A/B | Sem execução real de captura/monitoramento novo; ML multicliente indisponível |
| REQ-DOM-05; C-01 a C-05 | Identidade por marketplace/configuração e matching progressivo/reversível, como na matriz original | Outbox não é evidência deste requisito; merge universal continua fora do escopo |
| C-08; REQ-DIST-01…03 | OS-022: adapter Telegram/Webhook no fluxo de kit/outbox, assinatura e backoff verificados com HTTP mockado | Aprovação/destino/canal reais continuam exigidos; nenhum envio nesta rodada |
| C-03; REQ-CUR-01…10 / REQ-ED-01…06 | OS-023: humana/sombra preservadas, ratificação comum com 30–50 casos e digests; fixture | Ratificação e amostra reais não substituídas por dados sintéticos |
| C-04/C-05; REQ-KIT-01…05 | OS-024: caminho local contido, Story/Feed/Banner, QR decodificado e artefato privado sob RLS | Storage/Auth/navegador gerenciados não homologados nesta rodada |
| C-01/C-08; REQ-SAAS-01…05 | Onboarding/plano existentes preservados; R-02 explicitamente reconciliada no contrato corretivo | Convites reais/termos/piloto/privacidade não liberados por testes locais |
| REQ-TEST-01 / REQ-OPS-01…03 | OS-025: verificações/deltas e parecer seletivo dos mesmos BUGs | Não declara nova implantação ou recuperação remota |

Parecer independente final [CONFORME local](contratos-finalizacao/correcoes-19/AUDITORIA-ENTREGA.md) para BUG-001…012, com fonte congelada f4e512c9 e histórico contrário preservado. [Plano e contrato corretivo](contratos-finalizacao/correcoes-19/PLANO-ENTREGAS.md), [auditoria original](contratos-finalizacao/resultados/19-auditoria-entrega.md), [resultado corretivo](contratos-finalizacao/resultados/25-correcao-conclusao.md). As seções abaixo são o histórico/matriz original; suas condições de execução não são transformadas em conclusão integral retroativa.

---

## Registro anterior preservado — não representa o estado atual


> Atualização 23: original 1 e dois complementos independentes aplicados; migration2 permanece reprovada para o ativo, demais originais pendentes condicionais. Reparos auditados e conferências em [relatório 23](23-CORRECOES-AUDITADAS-E-APLICACAO-SEGURA.md) e [parecer 22](22-AUDITORIA-INDEPENDENTE-MIGRATIONS.md). Estados locais abaixo não significam instalação remota completa.

Requisito do blueprint → spec responsável → contrato → verificação. As verificações são critérios futuros, salvo baseline registrado na reconciliação; esta matriz não alega funcionalidades implementadas. Gates por capacidade estão em 07-PRONTIDAO-E-DECISOES.

| Requisito | Specs | Contrato | Prova de aceite |
|---|---|---|---|
| REQ-CODEX-01 | [EP-00](epicos/EP-00.md), [EP-01](epicos/EP-01.md), [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md), [EP-04](epicos/EP-04.md), [EP-05](epicos/EP-05.md), [EP-06](epicos/EP-06.md), [EP-07](epicos/EP-07.md), [EP-08](epicos/EP-08.md), [EP-09](epicos/EP-09.md), [EP-10](epicos/EP-10.md), [EP-11](epicos/EP-11.md), [EP-12](epicos/EP-12.md) | Estrutura 1–7 das specs e auditoria | Verificação documental; modo integral prevalece sobre instrução de um épico por vez |
| REQ-CODEX-02 | [EP-00](epicos/EP-00.md), [EP-01](epicos/EP-01.md), [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md), [EP-04](epicos/EP-04.md), [EP-05](epicos/EP-05.md), [EP-06](epicos/EP-06.md), [EP-07](epicos/EP-07.md), [EP-08](epicos/EP-08.md), [EP-09](epicos/EP-09.md), [EP-10](epicos/EP-10.md), [EP-11](epicos/EP-11.md), [EP-12](epicos/EP-12.md) | Estrutura 1–7 das specs e auditoria | Verificação documental; modo integral prevalece sobre instrução de um épico por vez |
| REQ-CUR-01 | [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md), [EP-06](epicos/EP-06.md) | C-02/C-03/C-04 | T01,T02,T04–06,T09,T12; S-RUBRICA |
| REQ-CUR-02 | [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md), [EP-06](epicos/EP-06.md) | C-02/C-03/C-04 | T01,T02,T04–06,T09,T12; S-RUBRICA |
| REQ-CUR-03 | [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md), [EP-06](epicos/EP-06.md) | C-02/C-03/C-04 | T01,T02,T04–06,T09,T12; S-RUBRICA |
| REQ-CUR-04 | [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md), [EP-06](epicos/EP-06.md) | C-02/C-03/C-04 | T01,T02,T04–06,T09,T12; S-RUBRICA |
| REQ-CUR-05 | [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md), [EP-06](epicos/EP-06.md) | C-02/C-03/C-04 | T01,T02,T04–06,T09,T12; S-RUBRICA |
| REQ-CUR-06 | [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md), [EP-06](epicos/EP-06.md) | C-02/C-03/C-04 | T01,T02,T04–06,T09,T12; S-RUBRICA |
| REQ-CUR-07 | [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md), [EP-06](epicos/EP-06.md) | C-02/C-03/C-04 | T01,T02,T04–06,T09,T12; S-RUBRICA |
| REQ-CUR-08 | [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md), [EP-06](epicos/EP-06.md) | C-02/C-03/C-04 | T01,T02,T04–06,T09,T12; S-RUBRICA |
| REQ-CUR-09 | [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md), [EP-06](epicos/EP-06.md) | C-02/C-03/C-04 | T01,T02,T04–06,T09,T12; S-RUBRICA |
| REQ-CUR-10 | [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md), [EP-06](epicos/EP-06.md) | C-02/C-03/C-04 | T01,T02,T04–06,T09,T12; S-RUBRICA |
| REQ-DIST-01 | [EP-04](epicos/EP-04.md), [EP-07](epicos/EP-07.md), [EP-11](epicos/EP-11.md) | C-05/C-06/C-08 | T11,T13,T14; S-LINK/S-DISPATCH |
| REQ-DIST-02 | [EP-04](epicos/EP-04.md), [EP-07](epicos/EP-07.md), [EP-11](epicos/EP-11.md) | C-05/C-06/C-08 | T11,T13,T14; S-LINK/S-DISPATCH |
| REQ-DIST-03 | [EP-04](epicos/EP-04.md), [EP-07](epicos/EP-07.md), [EP-11](epicos/EP-11.md) | C-05/C-06/C-08 | T11,T13,T14; S-LINK/S-DISPATCH |
| REQ-DOM-01 | [EP-01](epicos/EP-01.md), [EP-03](epicos/EP-03.md), [EP-04](epicos/EP-04.md), [EP-10](epicos/EP-10.md) | C-01 a C-05 | T07,T13,T14,T17; J1/J2 |
| REQ-DOM-02 | [EP-01](epicos/EP-01.md), [EP-03](epicos/EP-03.md), [EP-04](epicos/EP-04.md), [EP-10](epicos/EP-10.md) | C-01 a C-05 | T07,T13,T14,T17; J1/J2 |
| REQ-DOM-03 | [EP-01](epicos/EP-01.md), [EP-03](epicos/EP-03.md), [EP-04](epicos/EP-04.md), [EP-10](epicos/EP-10.md) | C-01 a C-05 | T07,T13,T14,T17; J1/J2 |
| REQ-DOM-04 | [EP-01](epicos/EP-01.md), [EP-03](epicos/EP-03.md), [EP-04](epicos/EP-04.md), [EP-10](epicos/EP-10.md) | C-01 a C-05 | T07,T13,T14,T17; J1/J2 |
| REQ-DOM-05 | [EP-01](epicos/EP-01.md), [EP-03](epicos/EP-03.md), [EP-04](epicos/EP-04.md), [EP-10](epicos/EP-10.md) | C-01 a C-05 | T07,T13,T14,T17; J1/J2 |
| REQ-ED-01 | [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md) | C-03 | T01,T02,T04–06,T09; S-RUBRICA |
| REQ-ED-02 | [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md) | C-03 | T01,T02,T04–06,T09; S-RUBRICA |
| REQ-ED-03 | [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md) | C-03 | T01,T02,T04–06,T09; S-RUBRICA |
| REQ-ED-04 | [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md) | C-03 | T01,T02,T04–06,T09; S-RUBRICA |
| REQ-ED-05 | [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md) | C-03 | T01,T02,T04–06,T09; S-RUBRICA |
| REQ-ED-06 | [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md) | C-03 | T01,T02,T04–06,T09; S-RUBRICA |
| REQ-KIT-01 | [EP-04](epicos/EP-04.md), [EP-06](epicos/EP-06.md), [EP-07](epicos/EP-07.md) | C-04/C-05 | T10–13; S-KIT e J1 |
| REQ-KIT-02 | [EP-04](epicos/EP-04.md), [EP-06](epicos/EP-06.md), [EP-07](epicos/EP-07.md) | C-04/C-05 | T10–13; S-KIT e J1 |
| REQ-KIT-03 | [EP-04](epicos/EP-04.md), [EP-06](epicos/EP-06.md), [EP-07](epicos/EP-07.md) | C-04/C-05 | T10–13; S-KIT e J1 |
| REQ-KIT-04 | [EP-04](epicos/EP-04.md), [EP-06](epicos/EP-06.md), [EP-07](epicos/EP-07.md) | C-04/C-05 | T10–13; S-KIT e J1 |
| REQ-KIT-05 | [EP-04](epicos/EP-04.md), [EP-06](epicos/EP-06.md), [EP-07](epicos/EP-07.md) | C-04/C-05 | T10–13; S-KIT e J1 |
| REQ-MET-01 | [EP-08](epicos/EP-08.md), [EP-09](epicos/EP-09.md) | C-07/C-08 | T15,T16; S-FIN, coortes/shadow |
| REQ-MET-02 | [EP-08](epicos/EP-08.md), [EP-09](epicos/EP-09.md) | C-07/C-08 | T15,T16; S-FIN, coortes/shadow |
| REQ-MET-03 | [EP-08](epicos/EP-08.md), [EP-09](epicos/EP-09.md) | C-07/C-08 | T15,T16; S-FIN, coortes/shadow |
| REQ-MET-04 | [EP-08](epicos/EP-08.md), [EP-09](epicos/EP-09.md) | C-07/C-08 | T15,T16; S-FIN, coortes/shadow |
| REQ-MET-05 | [EP-08](epicos/EP-08.md), [EP-09](epicos/EP-09.md) | C-07/C-08 | T15,T16; S-FIN, coortes/shadow |
| REQ-MKT-01 | [EP-03](epicos/EP-03.md), [EP-05](epicos/EP-05.md), [EP-07](epicos/EP-07.md), [EP-08](epicos/EP-08.md), [EP-09](epicos/EP-09.md), [EP-12](epicos/EP-12.md) | C-03/C-07/C-08 | J1, EXP-03/04/06; custos e proof of value |
| REQ-MKT-02 | [EP-03](epicos/EP-03.md), [EP-05](epicos/EP-05.md), [EP-07](epicos/EP-07.md), [EP-08](epicos/EP-08.md), [EP-09](epicos/EP-09.md), [EP-12](epicos/EP-12.md) | C-03/C-07/C-08 | J1, EXP-03/04/06; custos e proof of value |
| REQ-MKT-03 | [EP-03](epicos/EP-03.md), [EP-05](epicos/EP-05.md), [EP-07](epicos/EP-07.md), [EP-08](epicos/EP-08.md), [EP-09](epicos/EP-09.md), [EP-12](epicos/EP-12.md) | C-03/C-07/C-08 | J1, EXP-03/04/06; custos e proof of value |
| REQ-MON-01 | [EP-03](epicos/EP-03.md) | C-02/C-03 | 03-B; filas/budget/frescor e S-PRECO |
| REQ-MON-02 | [EP-03](epicos/EP-03.md) | C-02/C-03 | 03-B; filas/budget/frescor e S-PRECO |
| REQ-MON-03 | [EP-03](epicos/EP-03.md) | C-02/C-03 | 03-B; filas/budget/frescor e S-PRECO |
| REQ-OPS-01 | [EP-00](epicos/EP-00.md), [EP-01](epicos/EP-01.md), [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md), [EP-04](epicos/EP-04.md), [EP-05](epicos/EP-05.md), [EP-06](epicos/EP-06.md), [EP-07](epicos/EP-07.md), [EP-08](epicos/EP-08.md), [EP-09](epicos/EP-09.md), [EP-10](epicos/EP-10.md), [EP-11](epicos/EP-11.md), [EP-12](epicos/EP-12.md) | 04-EVOLUCAO-E-MIGRATIONS | Preflight, fixture, canary e relatório de execução |
| REQ-OPS-02 | [EP-00](epicos/EP-00.md), [EP-01](epicos/EP-01.md), [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md), [EP-04](epicos/EP-04.md), [EP-05](epicos/EP-05.md), [EP-06](epicos/EP-06.md), [EP-07](epicos/EP-07.md), [EP-08](epicos/EP-08.md), [EP-09](epicos/EP-09.md), [EP-10](epicos/EP-10.md), [EP-11](epicos/EP-11.md), [EP-12](epicos/EP-12.md) | 04-EVOLUCAO-E-MIGRATIONS | Preflight, fixture, canary e relatório de execução |
| REQ-OPS-03 | [EP-00](epicos/EP-00.md), [EP-01](epicos/EP-01.md), [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md), [EP-04](epicos/EP-04.md), [EP-05](epicos/EP-05.md), [EP-06](epicos/EP-06.md), [EP-07](epicos/EP-07.md), [EP-08](epicos/EP-08.md), [EP-09](epicos/EP-09.md), [EP-10](epicos/EP-10.md), [EP-11](epicos/EP-11.md), [EP-12](epicos/EP-12.md) | 04-EVOLUCAO-E-MIGRATIONS | Preflight, fixture, canary e relatório de execução |
| REQ-PRICE-01 | [EP-00](epicos/EP-00.md), [EP-01](epicos/EP-01.md), [EP-06](epicos/EP-06.md) | C-02 | T06–08,T10–12; S-PRECO/S-KIT |
| REQ-PRICE-02 | [EP-00](epicos/EP-00.md), [EP-01](epicos/EP-01.md), [EP-06](epicos/EP-06.md) | C-02 | T06–08,T10–12; S-PRECO/S-KIT |
| REQ-PRICE-03 | [EP-00](epicos/EP-00.md), [EP-01](epicos/EP-01.md), [EP-06](epicos/EP-06.md) | C-02 | T06–08,T10–12; S-PRECO/S-KIT |
| REQ-PRICE-04 | [EP-00](epicos/EP-00.md), [EP-01](epicos/EP-01.md), [EP-06](epicos/EP-06.md) | C-02 | T06–08,T10–12; S-PRECO/S-KIT |
| REQ-PRICE-05 | [EP-00](epicos/EP-00.md), [EP-01](epicos/EP-01.md), [EP-06](epicos/EP-06.md) | C-02 | T06–08,T10–12; S-PRECO/S-KIT |
| REQ-PRICE-06 | [EP-00](epicos/EP-00.md), [EP-01](epicos/EP-01.md), [EP-06](epicos/EP-06.md) | C-02 | T06–08,T10–12; S-PRECO/S-KIT |
| REQ-SAAS-01 | [EP-10](epicos/EP-10.md), [EP-12](epicos/EP-12.md) | C-01/C-08 | T17/T18; J2/S-DB, onboarding |
| REQ-SAAS-02 | [EP-10](epicos/EP-10.md), [EP-12](epicos/EP-12.md) | C-01/C-08 | T17/T18; J2/S-DB, onboarding |
| REQ-SAAS-03 | [EP-10](epicos/EP-10.md), [EP-12](epicos/EP-12.md) | C-01/C-08 | T17/T18; J2/S-DB, onboarding |
| REQ-SAAS-04 | [EP-10](epicos/EP-10.md), [EP-12](epicos/EP-12.md) | C-01/C-08 | T17/T18; J2/S-DB, onboarding |
| REQ-SAAS-05 | [EP-10](epicos/EP-10.md), [EP-12](epicos/EP-12.md) | C-01/C-08 | T17/T18; J2/S-DB, onboarding |
| REQ-TEST-01 | [EP-00](epicos/EP-00.md), [EP-01](epicos/EP-01.md), [EP-02](epicos/EP-02.md), [EP-03](epicos/EP-03.md), [EP-04](epicos/EP-04.md), [EP-05](epicos/EP-05.md), [EP-06](epicos/EP-06.md), [EP-07](epicos/EP-07.md), [EP-08](epicos/EP-08.md), [EP-09](epicos/EP-09.md), [EP-10](epicos/EP-10.md), [EP-11](epicos/EP-11.md), [EP-12](epicos/EP-12.md) | 05-VERIFICACAO-INTEGRAL | T01–T18, S-*, J1–J3 |
| REQ-UX-01 | [EP-05](epicos/EP-05.md) | C-03/C-07/C-09 | 05-A/B/C; T08,T18; jornada teclado/mobile |
| REQ-UX-02 | [EP-05](epicos/EP-05.md) | C-03/C-07/C-09 | 05-A/B/C; T08,T18; jornada teclado/mobile |
| REQ-UX-03 | [EP-05](epicos/EP-05.md) | C-03/C-07/C-09 | 05-A/B/C; T08,T18; jornada teclado/mobile |
| REQ-UX-04 | [EP-05](epicos/EP-05.md) | C-03/C-07/C-09 | 05-A/B/C; T08,T18; jornada teclado/mobile |
| REQ-UX-05 | [EP-05](epicos/EP-05.md) | C-03/C-07/C-09 | 05-A/B/C; T08,T18; jornada teclado/mobile |

## Requisitos estratégicos e invariantes

| IDs | Cobertura concreta | Prova |
|---|---|---|
| D-01, D-02; P-BIZ-01,02,03 | Motor comum, house por AccountContext, catálogo isolado sem duplicar lógica | J1/J2, ADR-01–03, 10-A1 |
| D-03; INV-01,03 | Q/V/O/A separados, evidência antes de claim | T01,T02,T04–06,T09,T12 |
| D-04; INV-02 | Série comparável e mínimo observado restrito à janela | T07/T08, C-02, EP-01 |
| D-05; INV-09,10 | Compatibilidade de schema/rotas, rollout aditivo e recuperação | T18/J3, registro M-*, EP-00 |
| D-06; INV-06 | Primeira venda declarada/documentada; origem desconhecida, comissão não é caixa | T15/T16, EP-08 |
| P-BIZ-04 | Prova de eficiência/receita com método, custo, amostra e limites | EP-09-C/12-C, C-07 |
| P-BIZ-05; INV-07 | Isolamento como gate absoluto do piloto | T17/J2, 10B, G-SEC |
| INV-04,05 | Catálogo, pauta, aprovação e export/confirmação separados | T10/T13/T14, C-04/05 |
| INV-08 | Ticket/nicho/tema configuráveis, marca desconhecida não veta | T01/T02/T05, EP-02/03 |

## Lacunas de evidência e decisões abertas do blueprint

| Origem | Destino / tratamento |
|---|---|
| A-01 | Corrigido como diagnóstico em E-03: não é falso universal; view tem 297 true sem guarda |
| A-02 | Nova contagem 44,60% incluindo 313 sem observações; não reproduz 78% |
| A-03 | Evento da impressora confirmado; EP-02/03 sem veto universal por ticket |
| A-04 | Piso e exceção reais; alteração contextual em 03-A |
| A-05 | 37,90% family confirmado; identidade de produto permanece separada |
| A-06, A-07 | EP-04/07/08; nenhuma postagem/venda reconstruída sem fonte |
| A-08 | EP-10; RLS enabled não equivale a isolamento |
| V-01 | Story encontrado; render/adoção ainda requer verificação 00-C/06-A |
| V-02 | ID antigo ausente; caso atual tem aprovação a R$22,79 e preço posterior R$19,99 |
| V-03 | Nenhum preço atual <=0; código atual retém, trilha histórica não reconstruída |
| V-04 | publication web nasce na ingestão/redirect, não coorte de aprovados ou postagens |
| V-05, V-06 | C-07/EP-08/09 instrumentam custo e coortes; não reutilizar razão 2,41 como taxa |
| V-07 | G-PROGRAM; documentação por capability antes de habilitar |
| OPEN-01, OPEN-02 | G-RUBRIC |
| OPEN-03 | G-PRICE |
| OPEN-04, OPEN-06 | G-CHANNEL |
| OPEN-05 | G-FIN |
| OPEN-07 | G-PILOT |
| OPEN-08 | G-RIGHTS |
| OPEN-09 | G-PROGRAM |

## Experimentos

EXP-01 em 02-B/C; EXP-02 em 01-B/C; EXP-03 em 05-B/06-C; EXP-04 em 07-C; EXP-05 em 08-A/B; EXP-06 em 12-B/C. Todos exigem dados/destinos autorizados na implementação, sem promessas de resultado financeiro.

## Limites intencionais cobertos

Matching entre lojas é progressivo/reversível, não merge automático nesta rodada (REQ-DOM-05). Billing automático, vídeo IA e integrações sociais não autorizadas permanecem exclusões do roadmap, sem remover o negócio SaaS ou a automação futura. Inteligência comercial comum não implica leitura cruzada de credenciais ou resultados; compartilhamento de fatos depende de proveniência/direitos. Nenhum requisito comercial foi trocado por “só operação própria”.


## Estado de execução por requisito — rodada 19 (15/10/2026)

Esta seção complementa a matriz de planejamento acima. Nenhum teste sintético certifica resultado comercial ou homologação no deployment. Provas abreviadas são scripts `test:*` em `tools/editorial-tests`, salvo unitários e documentos indicados. Cada linha conserva o requisito e identifica seu consumidor, prova e limite.

| Requisito | Consumidor/contrato implementado | Evidência local | Estado/condição |
|---|---|---|---|
| REQ-CODEX-01 | epicos/EP-00 a EP-12; arquitetura/contratos/viabilidade | Documentos 01–09 e relatório 19 | Planejamento auditado; execução/homologação são estados distintos |
| REQ-CODEX-02 | epicos/EP-00 a EP-12; arquitetura/contratos/viabilidade | Documentos 01–09 e relatório 19 | Planejamento auditado; execução/homologação são estados distintos |
| REQ-CUR-01 | /admin/curadoria; rubric-db; opportunity-db; governance-db | rubric, opportunity, verified-workflows | Implementado local; G-RUBRIC/EXPERIMENT e R13 para aprovação real |
| REQ-CUR-02 | /admin/curadoria; rubric-db; opportunity-db; governance-db | rubric, opportunity, verified-workflows | Implementado local; G-RUBRIC/EXPERIMENT e R13 para aprovação real |
| REQ-CUR-03 | /admin/curadoria; rubric-db; opportunity-db; governance-db | rubric, opportunity, verified-workflows | Implementado local; G-RUBRIC/EXPERIMENT e R13 para aprovação real |
| REQ-CUR-04 | /admin/curadoria; rubric-db; opportunity-db; governance-db | rubric, opportunity, verified-workflows | Implementado local; G-RUBRIC/EXPERIMENT e R13 para aprovação real |
| REQ-CUR-05 | /admin/curadoria; rubric-db; opportunity-db; governance-db | rubric, opportunity, verified-workflows | Implementado local; G-RUBRIC/EXPERIMENT e R13 para aprovação real |
| REQ-CUR-06 | /admin/curadoria; rubric-db; opportunity-db; governance-db | rubric, opportunity, verified-workflows | Implementado local; G-RUBRIC/EXPERIMENT e R13 para aprovação real |
| REQ-CUR-07 | /admin/curadoria; rubric-db; opportunity-db; governance-db | rubric, opportunity, verified-workflows | Implementado local; G-RUBRIC/EXPERIMENT e R13 para aprovação real |
| REQ-CUR-08 | /admin/curadoria; rubric-db; opportunity-db; governance-db | rubric, opportunity, verified-workflows | Implementado local; G-RUBRIC/EXPERIMENT e R13 para aprovação real |
| REQ-CUR-09 | /admin/curadoria; rubric-db; opportunity-db; governance-db | rubric, opportunity, verified-workflows | Implementado local; G-RUBRIC/EXPERIMENT e R13 para aprovação real |
| REQ-CUR-10 | /admin/curadoria; rubric-db; opportunity-db; governance-db | rubric, opportunity, verified-workflows | Implementado local; G-RUBRIC/EXPERIMENT e R13 para aprovação real |
| REQ-DIST-01 | /p/[code]; /go/[slug]; campanhas; dispatch-panel/worker | commercial, dispatch, verified-workflows | Assistido local; transporte oficial depende G-CHANNEL/PROGRAM e R13 |
| REQ-DIST-02 | /p/[code]; /go/[slug]; campanhas; dispatch-panel/worker | commercial, dispatch, verified-workflows | Assistido local; transporte oficial depende G-CHANNEL/PROGRAM e R13 |
| REQ-DIST-03 | /p/[code]; /go/[slug]; campanhas; dispatch-panel/worker | commercial, dispatch, verified-workflows | WhatsApp assistido preservado; escolha e adapter oficial automático bloqueados por G-CHANNEL |
| REQ-DOM-01 | commerce/opportunity/rubric/account contracts e DALs compartilhados | commercial, cf-regressions, verified-workflows | Implementado local; isolamento runtime em R13 |
| REQ-DOM-02 | commerce/opportunity/rubric/account contracts e DALs compartilhados | commercial, cf-regressions, verified-workflows | Implementado local; isolamento runtime em R13 |
| REQ-DOM-03 | commerce/opportunity/rubric/account contracts e DALs compartilhados | commercial, cf-regressions, verified-workflows | Implementado local; isolamento runtime em R13 |
| REQ-DOM-04 | commerce/opportunity/rubric/account contracts e DALs compartilhados | commercial, cf-regressions, verified-workflows | Implementado local; isolamento runtime em R13 |
| REQ-DOM-05 | Identidade por marketplace/variante; sem merge destrutivo | price-evidence, commercial; limites intencionais das specs | Limite preservado; matching assistido entre lojas é evolução, não habilitado nesta rodada |
| REQ-ED-01 | /admin/curadoria; rubric-contract; opportunity-contract | rubric, opportunity; unitários web | Implementado local em sombra/assistido; ratificação editorial real pendente |
| REQ-ED-02 | /admin/curadoria; rubric-contract; opportunity-contract | rubric, opportunity; unitários web | Implementado local em sombra/assistido; ratificação editorial real pendente |
| REQ-ED-03 | /admin/curadoria; rubric-contract; opportunity-contract | rubric, opportunity; unitários web | Implementado local em sombra/assistido; ratificação editorial real pendente |
| REQ-ED-04 | /admin/curadoria; rubric-contract; opportunity-contract | rubric, opportunity; unitários web | Implementado local em sombra/assistido; ratificação editorial real pendente |
| REQ-ED-05 | /admin/curadoria; rubric-contract; opportunity-contract | rubric, opportunity; unitários web | Implementado local em sombra/assistido; ratificação editorial real pendente |
| REQ-ED-06 | /admin/curadoria; rubric-contract; opportunity-contract | rubric, opportunity; unitários web | Implementado local em sombra/assistido; ratificação editorial real pendente |
| REQ-KIT-01 | /admin/campanhas; commercial-workflow; kit-artifact-db; kit-renderer | commercial, cockpit, verified-workflows; PNG inspecionado | Implementado local; G-RIGHTS por asset e Storage/browser em R13 |
| REQ-KIT-02 | /admin/campanhas; commercial-workflow; kit-artifact-db; kit-renderer | commercial, cockpit, verified-workflows; PNG inspecionado | Implementado local; G-RIGHTS por asset e Storage/browser em R13 |
| REQ-KIT-03 | /admin/campanhas; commercial-workflow; kit-artifact-db; kit-renderer | commercial, cockpit, verified-workflows; PNG inspecionado | Implementado local; G-RIGHTS por asset e Storage/browser em R13 |
| REQ-KIT-04 | /admin/campanhas; commercial-workflow; kit-artifact-db; kit-renderer | commercial, cockpit, verified-workflows; PNG inspecionado | Implementado local; G-RIGHTS por asset e Storage/browser em R13 |
| REQ-KIT-05 | /admin/campanhas; commercial-workflow; kit-artifact-db; kit-renderer | commercial, cockpit, verified-workflows; PNG inspecionado | Implementado local; G-RIGHTS por asset e Storage/browser em R13 |
| REQ-MET-01 | /admin/financeiro; /admin/experimentos; ledger e experiment-db | financial, experiment, verified-workflows | Manual/interno/descritivo local; G-FIN/EXPERIMENT e R13 |
| REQ-MET-02 | /admin/financeiro; /admin/experimentos; ledger e experiment-db | financial, experiment, verified-workflows | Manual/interno/descritivo local; G-FIN/EXPERIMENT e R13 |
| REQ-MET-03 | /admin/financeiro; /admin/experimentos; ledger e experiment-db | financial, experiment, verified-workflows | Registro manual local pronto; primeira venda real não foi inventada/importada; G-FIN |
| REQ-MET-04 | /admin/financeiro; /admin/experimentos; ledger e experiment-db | financial, experiment, verified-workflows | Manual/interno/descritivo local; G-FIN/EXPERIMENT e R13 |
| REQ-MET-05 | /admin/financeiro; /admin/experimentos; ledger e experiment-db | financial, experiment, verified-workflows | Manual/interno/descritivo local; G-FIN/EXPERIMENT e R13 |
| REQ-MKT-01 | Marketing/configuração e campanha/kit/resultados; indicadores financeiros | marketing unitários, commercial, financial, experiment | Ferramentas locais; cadência/prova de valor/ROI dependem operação real autorizada |
| REQ-MKT-02 | Marketing/configuração e campanha/kit/resultados; indicadores financeiros | marketing unitários, commercial, financial, experiment | Ferramentas locais; cadência/prova de valor/ROI dependem operação real autorizada |
| REQ-MKT-03 | Marketing/configuração e campanha/kit/resultados; indicadores financeiros | marketing unitários, commercial, financial, experiment | Ferramentas locais; cadência/prova de valor/ROI dependem operação real autorizada |
| REQ-MON-01 | /admin/curadoria?aba=radar; monitoring-candidates; monitoring-priority | opportunity, cockpit, persistence/capture | Implementado local; fontes/credenciais e execução autorizada em R13 |
| REQ-MON-02 | /admin/curadoria?aba=radar; monitoring-candidates; monitoring-priority | opportunity, cockpit, persistence/capture | Implementado local; fontes/credenciais e execução autorizada em R13 |
| REQ-MON-03 | /admin/curadoria?aba=radar; monitoring-candidates; monitoring-priority | opportunity, cockpit, persistence/capture | Implementado local; fontes/credenciais e execução autorizada em R13 |
| REQ-OPS-01 | runner de checks, migration 12, catálogo e roteiro de recuperação | verified-upgrade, checks e relatório 19 | Candidata local; implantação e recuperação reais bloqueadas em R13 |
| REQ-OPS-02 | runner de checks, migration 12, catálogo e roteiro de recuperação | verified-upgrade, checks e relatório 19 | Doze migrations locais catalogadas; nenhuma aplicada remotamente; R13 bloqueada |
| REQ-OPS-03 | runner de checks, migration 12, catálogo e roteiro de recuperação | verified-upgrade, checks e relatório 19 | Candidata local; implantação e recuperação reais bloqueadas em R13 |
| REQ-PRICE-01 | price-evidence; effective_price_evidence_policy; projeções públicas/kit | price-evidence, commercial, triage-price; unitários | Motor conservador local; E3 condicionado a EXP-02 real e R13 |
| REQ-PRICE-02 | price-evidence; effective_price_evidence_policy; projeções públicas/kit | price-evidence, commercial, triage-price; unitários | Motor conservador local; E3 condicionado a EXP-02 real e R13 |
| REQ-PRICE-03 | price-evidence; effective_price_evidence_policy; projeções públicas/kit | price-evidence, commercial, triage-price; unitários | Motor conservador local; E3 condicionado a EXP-02 real e R13 |
| REQ-PRICE-04 | price-evidence; effective_price_evidence_policy; projeções públicas/kit | price-evidence, commercial, triage-price; unitários | Motor conservador local; E3 condicionado a EXP-02 real e R13 |
| REQ-PRICE-05 | price-evidence; effective_price_evidence_policy; projeções públicas/kit | price-evidence, commercial, triage-price; unitários | Motor conservador local; E3 condicionado a EXP-02 real e R13 |
| REQ-PRICE-06 | price-evidence; effective_price_evidence_policy; projeções públicas/kit | price-evidence, commercial, triage-price; unitários | Motor conservador local; E3 condicionado a EXP-02 real e R13 |
| REQ-SAAS-01 | /plataforma; /convite; /admin/onboarding; account-scope; tenant-db | onboarding, entitlement, cf-regressions, verified-workflows | Núcleo local; G-SEC/PILOT/PRIVACY e R13 antes de cliente externo |
| REQ-SAAS-02 | /plataforma; /convite; /admin/onboarding; account-scope; tenant-db | onboarding, entitlement, cf-regressions, verified-workflows | Núcleo local; G-SEC/PILOT/PRIVACY e R13 antes de cliente externo |
| REQ-SAAS-03 | /plataforma; /convite; /admin/onboarding; account-scope; tenant-db | onboarding, entitlement, cf-regressions, verified-workflows | Núcleo local; G-SEC/PILOT/PRIVACY e R13 antes de cliente externo |
| REQ-SAAS-04 | /plataforma; /convite; /admin/onboarding; account-scope; tenant-db | onboarding, entitlement, cf-regressions, verified-workflows | Núcleo local; G-SEC/PILOT/PRIVACY e R13 antes de cliente externo |
| REQ-SAAS-05 | /plataforma; /convite; /admin/onboarding; account-scope; tenant-db | onboarding, entitlement, cf-regressions, verified-workflows | Prontidão comercial NÃO liberada: G-PILOT/PRIVACY/SEC/PROGRAM |
| REQ-TEST-01 | casos T01–18, suítes S-* e jornadas J1–J3 | checks, verified-workflows, verified-upgrade; matriz abaixo | Cobertura local; parte browser/runtime/multi-sessão explicitamente pendente |
| REQ-UX-01 | Pauta/curadoria, Radar, Campanhas/Resultados e vitrine pública | commercial, opportunity, cockpit; typecheck/build | Consumidores implementados; percurso autenticado e tempo/ganho real em R13 |
| REQ-UX-02 | Pauta/curadoria, Radar, Campanhas/Resultados e vitrine pública | commercial, opportunity, cockpit; typecheck/build | Consumidores implementados; percurso autenticado e tempo/ganho real em R13 |
| REQ-UX-03 | Pauta/curadoria, Radar, Campanhas/Resultados e vitrine pública | commercial, opportunity, cockpit; typecheck/build | Consumidores implementados; percurso autenticado e tempo/ganho real em R13 |
| REQ-UX-04 | Pauta/curadoria, Radar, Campanhas/Resultados e vitrine pública | commercial, opportunity, cockpit; typecheck/build | Consumidores implementados; percurso autenticado e tempo/ganho real em R13 |
| REQ-UX-05 | Pauta/curadoria, Radar, Campanhas/Resultados e vitrine pública | commercial, opportunity, cockpit; typecheck/build | Consumidores implementados; percurso autenticado e tempo/ganho real em R13 |
