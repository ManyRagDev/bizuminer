# Auditoria de entrega — OS-035

19/10/2026. Modo `entrega`. **Veredicto: CONFORME_COM_RESSALVAS** para fechamento local de BUG-019. Critérios: [OS-035](OS-035.md), AC-028.3 da [OS-028](OS-028.md), [reinvestigação](../diagnosticos/os-034/DIAGNOSTICO.md) e [RESULTADO-OS-035](RESULTADO-OS-035.md). Baseline `main` `43700c59f4e24f68f3a2e32c20ee5147fa4816cd` mais working tree extenso, não commitado. O diff frente a HEAD não atribui com segurança cada hunk à OS; a versão examinada foi congelada por SHA-256 (`curation-contract.ts` `0de75acb`, `curation-db.ts` `88d927ed`, `group-reviewer.tsx` `3cec92a8`, fixture `comparison-flow.test.ts` `845147d4`). Nenhum código, contrato, migration ou teste foi modificado nesta auditoria.

| Aceite | Parecer e evidência independente |
|---|---|
| AC-035.1 | **Conforme.** `validateGroupAction` rejeita lista ausente/vazia, IDs duplicados/inválidos e selecionado ausente da lista; preserva entrada sem retenção. Os testes focados passaram. |
| AC-035.2 | **Implementação coerente, interação `NAO_VERIFICADA`.** `openSaturationModal` deixa de usar `card.representatives` como fallback, barra leitura falha/incompleta e envia os membros exibidos. Não havia sessão autenticada/harness de UI nesta auditoria; comportamento visual fica para OS-031 conforme o contrato. |
| AC-035.3 | **Conforme no snapshot transacional testado.** `actOnGroup` exige lista na própria DAL, compara o conjunto antes de criar decisões/eventos e rejeita divergência com `curation_group_members_changed`. O teste PGlite cobre chamada direta fabricada e grupo alterado; justificativa segue para `reasonDetail` do evento. O contrato não promete bloqueio de inserções fantasma após a leitura. |
| AC-035.4 | **Conforme localmente, com a ressalva de UI acima.** `node --test` dos arquivos de contrato/grupo passou e `node --import tsx comparison-flow.test.ts` passou em 5 cenários, incluindo duas contas. |

**Achados obrigatórios de implementação: nenhum para BUG-019.** A ressalva é `diagnostico`/`nao_verificado`, não um BUG novo: falta ensaio interativo da UI. Os testes gerais do ambiente não ficaram integralmente verdes nesta auditoria; o registro consolidado está em [AUDITORIA-OS-036](AUDITORIA-OS-036.md). Esta conclusão não homologa OS-028 inteira, pois BUG-021 continua aberto na OS-036.
