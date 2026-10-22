# Resultado OS-020 — parser

18/10/2026. Baseline: main 43700c59 + manifesto inicial f4fb6cbd, alterações anteriores preservadas. Tentativa #1 de correção BUG-001/002/003.

Escritas autorizadas: commission-import-adapters.ts, commission-import-adapters.test.mjs e commercial-financial-flow.test.ts. Delimitador detectado no header, datas inválidas rejeitadas com linha/motivo, header sem dados termina sem redetecção recursiva. Validação adicional rejeita datas de calendário impossíveis.

Verificações: unitários parser/adapters exit 0; teste financeiro em PGlite exit 0, incluindo novo CSV BR→preview→commit→conversion 15050 BRL confirmed/commission_entry 1505. No desenvolvimento do teste de integração, ajustei sua chamada ao contrato real de commit (expectedDigest é fileDigest); não houve relaxamento do serviço. Header-only inicialmente retornava totalLines=1 pela interpretação canônica; removido fallback para o header de marketplace e contraprova agora passa.

Logs: /tmp/bizuminer-correcao-os19/os20-unit.log e os20-financial.log. Sem remoto. Estado: IMPLEMENTADO_PENDENTE_VERIFICACAO, aguardando auditoria seletiva dos mesmos IDs.

Fechamento vigente — CONCLUIDO no escopo técnico local desta OS, após contraprova seletiva dos mesmos IDs e parecer independente final CONFORME em [AUDITORIA-ENTREGA.md](AUDITORIA-ENTREGA.md), adendo final de 18/10/2026. Fonte examinada: manifesto f4e512c932a6c3de4f789afdd57aa5c6cc444bb3cd083811050a4546221da391. Os estados pendentes anteriores registram o histórico. Esta atualização encerra documentação; não altera fonte/teste nem declara implantação/homologação no ativo.
