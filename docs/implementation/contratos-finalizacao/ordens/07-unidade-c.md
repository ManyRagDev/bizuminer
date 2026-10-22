# OS-07 — Corte C aplicado e conferido sem reabrir a operação

Estado: PRONTA

Atualização autorizada OS-12: aplicar somente C corrigida SHA256 `a08659287c10e2b7e3358bf6029bec75277cc0ca0ce07655d7e9f70acef92597`, manifesto `3c8af38ce344ef3ad8030b07a58e2503f567ab964e8842bb592290421c886081`, após testes e parecer de entrega12 favorável a esses bytes. A antiga C111498… não é candidata executável. Catálogo/A/B permanecem congelados; todos os demais aceites, OS-06 e proteção pública continuam obrigatórios. O parecer33 é histórico e não substitui nova aprovação12. Esta atualização não autoriza editar SQL durante a aplicação.
Papel: executor-blindado
Base verificada: main / 43700c59f4e24f68f3a2e32c20ee5147fa4816cd + alterações locais preexistentes; conferir novamente antes de executar.
Depende de: OS-06 CONCLUIDA; B exata, backup válido, writers compatíveis e antigos drenados.
Execução: sequencial

## Objetivo e aceite

- AC-1: preflight selado C passa sem adaptação do catálogo; unidade inteira confirmada no histórico.
- AC-2: somente as 28 policies legadas previstas são trocadas; especializadas/segredos preservados, grants/colunas corretos e controle true ao final.
- AC-3: dados/referências/outros apps preservados; runtime sem bypass respeita isolamento e acesso legítimo. Reabertura depende de OS-08.

## Leitura e contrato

- CF-01/02/03 e resultados OS-02/04/05/06.
- `packages/persistence/supabase/rollouts/v2/20261015194759_garimpa_v2_scoped_cutover.sql`, manifesto e parecer33.

## Escrita autorizada

Somente resultado/evidência desta ordem; temporários sanitizados em `/tmp/bizuminer-finalizacao/os-07/`. SQL/manifesto/captura selada e demais fontes protegidos.

Resultado: `docs/implementation/contratos-finalizacao/resultados/07-unidade-c.md` — novo, exclusivo do executor desta ordem.
Evidência: `docs/implementation/contratos-finalizacao/resultados/07-unidade-c.json` — opcional, nova e sanitizada, limitada ao aceite desta ordem.
Protegidos: todo caminho fora da lista; contratos compartilhados, SQLs/manifestos selados, testes de aceite e evidências históricas não podem ser alterados. Nenhuma ordem autoriza limpar trabalho preexistente. Escrita remota tem escopo próprio abaixo e não decorre da lista de arquivos.

## Dependências e integração

O executor desta ordem é seu único escritor; não há execução paralela autorizada. Consumir o resultado anterior, conferir suas evidências e interromper a fase dependente se houver falha. CF-01 rege transição, CF-02 preservação/recuperação e CF-03 integração. OS-08 valida o conjunto e OS-10 é o único integrador dos registros centrais. Não avançar com estado desconhecido nem pedir nova autorização genérica quando a existente já cobre alvo/operação e suas condições estão satisfeitas.

## Verificações

`npm run rollout:verify --prefix tools/editorial-tests`; reconferir alvo/histórico/B, backup e manutenção imediatamente antes. Deixar C validar catálogo/ACL/roles/colunas/RLS/functions/views/FKs/owners/triggers/defaults. Rejeição de preflight não autoriza atualizar selo nem fragmentar a unidade.

Depois: confirmar histórico/control=true, remoção exata das 28 policies, preservação específicas/FORCE/service grants/defaults, papel público sem SELECT privado/EXECUTE amplo e nenhuma mudança inesperada nos outros schemas/buckets. Comparar valores originais/FKs/runtime CF-02. Não usar postgres como única prova de RLS.

Em commit incerto: consultar histórico+catálogo antes de retomar. Em falha de smoke, permanecer em manutenção.

## Operações externas

Somente C inteira via MCP no projeto Supabase CF-01, autorizada condicionalmente pelo humano + parecer33 depois destas dependências, sob revisão automática aplicável. Uma transação completa com histórico coerente. Sem reenvio da M2 original, SQL avulso ou ajuste de permissões para fazer passar.

Recuperação pós-C é compatível e seletiva conforme CF-01/02: controle falso não desfaz RLS; não restaurar `using(true)`, código antigo indiscriminado ou banco compartilhado.
