# OS-10 — Rastreabilidade e declaração de conclusão com alcance correto

Estado: PRONTA
Papel: executor-blindado
Base verificada: main / 43700c59f4e24f68f3a2e32c20ee5147fa4816cd + alterações locais preexistentes; conferir novamente antes de executar.
Depende de: OS-09 CONCLUIDA e resultados01–09 coerentes; OS-11 não é requisito para encerrar apenas o núcleo.
Execução: sequencial

## Objetivo e aceite

- AC-1: reunir versões/migrations/publicações/refs, backup/restore, integridade/acesso, testes por ambiente, ocorrências e capacidade ativa com evidência.
- AC-2: reconciliar 13 épicos e 62 requisitos, D00–D14/R00–R14, distinguindo implementado/instalado/testado/homologado/ativado; preservar evidência histórica e supersessões33.
- AC-3: declarar conclusão do núcleo somente se funcional e sem defeito impeditivo; conclusão integral é proibida enquanto qualquer capacidade original permanecer pendente.

## Leitura e contrato

- CF-01/02/03, todos os resultados anteriores, registro de capacidades e roteiro36.
- `docs/implementation/08-RASTREABILIDADE.md`, `25-ADERENCIA-AO-PLANO-ORIGINAL.md`, specs epicos/EP-00 aEP-12.
- STATUS, README, checkpoint, planos15 e17, gates07 e evolução04.

## Escrita autorizada

Único responsável pela integração documental. Além do resultado/evidência exclusivos, pode editar somente estes arquivos existentes, acrescentando estado atual e preservando seções históricas:
- `docs/implementation/STATUS-EXECUCAO.md`
- `docs/implementation/README.md`
- `docs/implementation/CHECKPOINT-EXECUCAO-SEQUENCIAL.md`
- `docs/implementation/08-RASTREABILIDADE.md`
- `docs/implementation/07-PRONTIDAO-E-DECISOES.md`
- `docs/implementation/04-EVOLUCAO-E-MIGRATIONS.md`
- `docs/implementation/15-PLANO-DE-CONCLUSAO-SEQUENCIAL.md`
- `docs/implementation/17-PLANO-SEQUENCIAL-DE-CORRECAO-CF01-CF18.md`

Não editar specs/contratos nem relatórios históricos de auditoria para aparentar conclusão. Se OS-11 estiver em execução, aguardar sua conclusão ou manter registro como bloqueado; não compartilhar escritores.

Resultado: `docs/implementation/contratos-finalizacao/resultados/10-fechamento.md` — novo, exclusivo do executor desta ordem.
Evidência: `docs/implementation/contratos-finalizacao/resultados/10-fechamento.json` — opcional, nova e sanitizada, limitada ao aceite desta ordem.
Protegidos: todo caminho fora da lista; contratos compartilhados, SQLs/manifestos selados, testes de aceite e evidências históricas não podem ser alterados. Nenhuma ordem autoriza limpar trabalho preexistente. Escrita remota tem escopo próprio abaixo e não decorre da lista de arquivos.

## Dependências e integração

O executor desta ordem é seu único escritor; não há execução paralela autorizada. Consumir o resultado anterior, conferir suas evidências e interromper a fase dependente se houver falha. CF-01 rege transição, CF-02 preservação/recuperação e CF-03 integração. OS-08 valida o conjunto e OS-10 é o único integrador dos registros centrais. Não avançar com estado desconhecido nem pedir nova autorização genérica quando a existente já cobre alvo/operação e suas condições estão satisfeitas.

## Verificações

Conferência documental: contar os 13 épicos EP-00–12 e os62 IDs REQ únicos na rastreabilidade, vincular cada um a resultado/evidência/ambiente/limite; relacionar D00–D14/R00–R14 às ordens operacionais sem apagar o que já foi feito. Conferir cada link/referência e coerência entre STATUS/README/checkpoint/planos/gates.

Não aplicar testes adicionais apenas para atualizar docs. Usar resultados efetivos01–09 e reutilizações históricas claramente datadas. Se algum requisito não pode ser demonstrado, marcar pendência, dono, entrada e trabalho técnico seguinte; documentação de falta não é implementação.

Com pendências, declarar “implantação do núcleo concluída” e citar nominalmente as capacidades efetivamente não concluídas, com suas entradas e próximo trabalho. Não usar “Blueprint integralmente concluído” nessa situação.

## Operações externas

Nenhuma escrita remota. Leituras finais de deployment/histórico somente se necessárias para confirmar referências. Não aplicar SQL/deploy/convite/envio nem concluir capacidades por editar gate. Esta ordem é integração e relato do que passou, não autorização aberta de reparo.
