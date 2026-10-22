# OS-03 — Preparação A instalada e legado preservado

Estado: PRONTA
Papel: executor-blindado
Base verificada: main / 43700c59f4e24f68f3a2e32c20ee5147fa4816cd + alterações locais preexistentes; conferir novamente antes de executar.
Depende de: OS-02 CONCLUIDA; alvo, backup, manutenção e baseline válidos.
Execução: sequencial

## Objetivo e aceite

- AC-1: A exata aplicada atomicamente, com histórico reconciliado; ou reconhecer instalação já confirmada sem reaplicar.
- AC-2: controle comercial falso, role pública restrita/helpers corretos; policies legadas/especializadas, dados, defaults e demais apps preservados.
- AC-3: runtime legítimo mantém leitura; B não inicia com diferença inexplicada.

## Leitura e contrato

- CF-01/02 e resultados OS-01/02.
- `packages/persistence/supabase/rollouts/v2/20261015194719_garimpa_v2_foundation.sql` e `manifest.json`.
- Parecer33: condições antes de A e recuperação.

## Escrita autorizada

Somente resultado e evidência sanitizada desta ordem. SQL/manifesto/histórico local são protegidos. Saídas temporárias sanitizadas em `/tmp/bizuminer-finalizacao/os-03/`.

Resultado: `docs/implementation/contratos-finalizacao/resultados/03-unidade-a.md` — novo, exclusivo do executor desta ordem.
Evidência: `docs/implementation/contratos-finalizacao/resultados/03-unidade-a.json` — opcional, nova e sanitizada, limitada ao aceite desta ordem.
Protegidos: todo caminho fora da lista; contratos compartilhados, SQLs/manifestos selados, testes de aceite e evidências históricas não podem ser alterados. Nenhuma ordem autoriza limpar trabalho preexistente. Escrita remota tem escopo próprio abaixo e não decorre da lista de arquivos.

## Dependências e integração

O executor desta ordem é seu único escritor; não há execução paralela autorizada. Consumir o resultado anterior, conferir suas evidências e interromper a fase dependente se houver falha. CF-01 rege transição, CF-02 preservação/recuperação e CF-03 integração. OS-08 valida o conjunto e OS-10 é o único integrador dos registros centrais. Não avançar com estado desconhecido nem pedir nova autorização genérica quando a existente já cobre alvo/operação e suas condições estão satisfeitas.

## Verificações

Na raiz completa: `npm run rollout:verify --prefix tools/editorial-tests`. Antes: confirmar projeto, histórico três aplicações anteriores, catálogo baseline exato e manutenção/backup; confirmar transação+histórico do MCP. Depois: ler catálogo/role/membership/control=false; comparar projeção original, FKs, policies/ACLs/defaults/owners e fingerprints conforme CF-02; leitura runtime real read-only.

Falha ou timeout: consultar histórico e catálogo antes de repetir. Não seguir para B com instalação incerta.

## Operações externas

Aplicar exclusivamente A inteira, nome/bytes/hash CF-01, via MCP no Supabase `spbuwcwmxlycchuwhfir`, schema garimpa. Evidência de autorização: pedido humano de aplicar tudo condicionado ao auditor e parecer33 para A. Lock/statement timeout já no arquivo; uma transação completa e histórico coerente. Revisão automática aplicável continua obrigatória.

Nenhum outro SQL, grants, policies ou ajuste de selo. Falha antes do commit reverte A; resultado incerto deve ser conciliado; rollback destrutivo/global não autorizado.
