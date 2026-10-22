# OS-04 — Expansão B instalada com novas capacidades bloqueadas

Estado: PRONTA
Papel: executor-blindado
Base verificada: main / 43700c59f4e24f68f3a2e32c20ee5147fa4816cd + alterações locais preexistentes; conferir novamente antes de executar.
Depende de: OS-03 CONCLUIDA; A exata, controle falso, backup e manutenção válidos.
Execução: sequencial

## Objetivo e aceite

- AC-1: B inteira e histórica confirmada; 37 novas tabelas, projeções/helpers e bucket próprio privado.
- AC-2: matriz de permissões/colunas explícita; nenhuma nova capacidade ou convite liberado com controle falso.
- AC-3: legado/runtime e valores originais íntegros; outros schemas/buckets preservados. Estado B pode aguardar publicação sem antecipar C.

## Leitura e contrato

- CF-01/02; resultados OS-02/03.
- `packages/persistence/supabase/rollouts/v2/20261015194748_garimpa_v2_expansion.sql`, manifesto e parecer33.

## Escrita autorizada

Somente resultado e evidência sanitizada desta ordem. Não editar SQL, bucket existente ou runtime. Temporários em `/tmp/bizuminer-finalizacao/os-04/`.

Resultado: `docs/implementation/contratos-finalizacao/resultados/04-unidade-b.md` — novo, exclusivo do executor desta ordem.
Evidência: `docs/implementation/contratos-finalizacao/resultados/04-unidade-b.json` — opcional, nova e sanitizada, limitada ao aceite desta ordem.
Protegidos: todo caminho fora da lista; contratos compartilhados, SQLs/manifestos selados, testes de aceite e evidências históricas não podem ser alterados. Nenhuma ordem autoriza limpar trabalho preexistente. Escrita remota tem escopo próprio abaixo e não decorre da lista de arquivos.

## Dependências e integração

O executor desta ordem é seu único escritor; não há execução paralela autorizada. Consumir o resultado anterior, conferir suas evidências e interromper a fase dependente se houver falha. CF-01 rege transição, CF-02 preservação/recuperação e CF-03 integração. OS-08 valida o conjunto e OS-10 é o único integrador dos registros centrais. Não avançar com estado desconhecido nem pedir nova autorização genérica quando a existente já cobre alvo/operação e suas condições estão satisfeitas.

## Verificações

`npm run rollout:verify --prefix tools/editorial-tests`; reconferir estado A e preflight B. Após execução: inventariar novas relações/funções, comparar grants efetivos, EXECUTE, coluna e gate restritivo. Conferir `audience_policy_version.approved_by/approved_at`, `private_artifact.status`, view com SELECT limitado e preservação de FORCE RLS/service_role/defaults existentes. Verificar bucket `bizuminer-private` não público e metadata dos demais buckets inalterados.

Comparar dados/referências/runtime/fingerprints CF-02; provar V2 negada/control=false sem criar convites ou fatos fictícios. Checagem genérica final `verify:remote-compatibility` NÃO deve ser exigida verde nesta fase: ainda existem policies legadas até C.

## Operações externas

Aplicar somente B inteira via MCP no mesmo projeto/schema CF-01, pela autorização humana + parecer33, com transação/histórico e hashes conferidos. Exceção Storage: criação idempotente do bucket privado novo prevista em B; sem modificar Auth, policies Storage ou outros buckets. Revisão automática continua aplicável.

Falha: rollback/reconciliação. Não liberar C nem refazer original histórica. Manter expansão e gate falso se publicação ainda não estiver pronta.
