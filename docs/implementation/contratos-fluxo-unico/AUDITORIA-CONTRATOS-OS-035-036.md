# Auditoria de contrato — OS-035 e OS-036

19/10/2026. Modo `contrato`. **Veredicto: CONFORME para execução local sequencial.** Versão examinada: [OS-035](OS-035.md), [OS-036](OS-036.md), [plano](PLANO-ENTREGAS.md) e [reinvestigação](../diagnosticos/os-034/DIAGNOSTICO.md), no working tree local não rastreado sobre `main` `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`. Critérios preservados: AC-028.2–.3/.5 e BUG-018/019/020/021 da [auditoria de entrega da OS-034](AUDITORIA-OS-034.md). Parecer de contrato não é verificação de implementação; nenhuma linha de código, teste ou contrato foi modificada nesta etapa de auditoria.

| Aspecto | Evidência | Parecer |
|---|---|
| Causa e aceite | OS-035 obriga conjunto integral no validador, UI e transação; OS-036 exige suspensão persistente após A→B→A de observação e estado, com nova decisão humana para reativar. | Conforme; testa os mesmos BUGs persistentes. |
| Histórico e tenant | O contrato usa `price_observation`, `curation_event` e JSON de `editorial_assessment` existentes, escopa ambos os lados da comparação por conta e manda falhar fechado quando a cronologia não for demonstrável. | Conforme; SQL direto sem evento não é tratado como prova de uma transição passada. |
| Fronteira e segurança | Escrita por arquivo, sem migration, banco remoto ou publicação; `BLOQUEIO_DE_FRONTEIRA` impede ampliação tácita. OS-036 espera OS-035 por compartilhar fixture. | Conforme. |
| Verificação e reversão | Contraprovas diretas/PGlite, baterias, saída com códigos reais e rollback só de hunks próprios. A UI local e a ingestão PostgreSQL são identificadas como verificações pendentes quando o ambiente não as permitir. | Conforme para execução local; essas lacunas não podem ser relatadas como testes verdes. |

**Achados obrigatórios de contrato: nenhum.** A implementação pode revelar ausência de histórico suficiente ou necessidade de caminho protegido; nesse caso a ordem exige bloqueio fundamentado e revisão de fronteira, não remendo exploratório. O fechamento de BUG-019/021 e a homologação de OS-028 dependem da auditoria de entrega após a execução.
