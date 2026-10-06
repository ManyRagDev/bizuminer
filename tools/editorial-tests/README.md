# Verificação da seleção editorial

Este pacote executa a migration e os serviços reais em PostgreSQL isolado via PGlite. Não usa `DATABASE_URL` real nem acessa o banco remoto.

```bash
npm ci --prefix tools/editorial-tests
npm test --prefix tools/editorial-tests
```

A fixture contém o contrato mínimo das tabelas, view e roles anteriores à migration. O adaptador traduz a interface de consultas de `postgres.js` para PGlite; os comandos SQL são executados, sem respostas simuladas. A própria migration adiciona tabelas, constraints, políticas e privilégios.

Os cenários verificam ausência da migration, isolamento de tenant, constraints, projeções públicas, revisões superadas, preço, identidade da configuração, validade, conflitos otimistas, rollback de falha real em trigger e preservação da aprovação. Também verificam prioridade editorial global, paginação e ordenações explícitas. Os 27 cenários incluem ranking relativo e a seleção inicial compartilhada entre home/pauta, sem fabricar avaliações/edições nem contornar uma edição vazia, vencida ou retirada.

PGlite tem uma única sessão: este verificador cobre transações e conflitos de versão sequenciais, mas não comprova concorrência entre conexões nem o comportamento do pooler remoto. A fixture não substitui aplicar a migration e verificar permissões no ambiente de destino.
