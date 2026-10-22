# Auditoria OS-026 — BUG-013

**Parecer vigente de entrega: CONFORME no escopo local, tentativa #1; BUG-013 verificado quanto ao mecanismo corrigido.** Adendo ao final; manifesto `df1f047c…`. Homologação autenticada e métricas do ambiente do incidente permanecem não verificadas.

18/10/2026. Skill auditor-red-team v2.0; **modo contrato**, antes da implementação. Baseline `main 43700c59f4e24f68f3a2e32c20ee5147fa4816cd` com alterações locais preexistentes e OS-020…025 preservadas. Leitura do diagnóstico/probe, plano, OS-026, factory, helpers/contexto, consumidores do admin, driver Postgres.js instalado e fixture nativa. Nenhum código, contrato, teste, configuração ou dado foi alterado nesta avaliação.

**Veredicto: CONFORME para execução local da OS-026.** Não foi identificado impedimento contratual que exija redesenho. Isto libera a implementação autorizada, não fecha BUG-013 nem homologa o ambiente do incidente.

| Fronteira / aceite | Parecer |
|---|---|
| Causa e objetivo | O mecanismo demonstrado é suficiente: `db()` cria pool independente por chamada e `AdminPage` possui fanout concorrente. Limitar o pool compartilhado por processo/destino ataca esse mecanismo. O diagnóstico distingue modelo offline de atribuição integral do incidente remoto e não inventa telemetria. |
| Orçamento físico / AC-026.1 | Máximo3 por processo/destino e fila do driver, estáveis em globalThis/HMR, são critérios verificáveis e proporcionais. O contrato não promete um teto único entre réplicas ou CLIs; nenhuma mudança de pool_size ou modo remoto é necessária para implementar a correção local. A prova deve contar conexões físicas, distinguindo-as dos handles lógicos. |
| Isolamento / AC-026.2 | Contexto fica por handle/tx; proibição de mutar `begin` do pool compartilhado evita capturar ator de outro pedido. Teste nativo através do novo pool e `withAccountDb` real, RLS sem bypass, A/B/A, identidade alheia, rollback e limpeza de GUC cobre a mudança crítica. Uma factory inteiramente simulada não substituiria esse aceite. |
| Ciclo de vida / AC-026.3 | `end()` lógico por handle, idempotente, não encerra B; callbacks/options de begin e tags/unsafe/helpers devem permanecer compatíveis. Testes de cancelamento/falha e próximo pedido funcionando, pg_stat_activity <=3 e liberação ociosa verificam capacidade e ausência de interferência. Postgres.js instalado possui as opções contratadas; valores de idle/lifetime são escolhas locais explícitas, sem segredo de contexto no registro. |
| Compatibilidade / AC-026.4 | Escopo comporta factory/módulo compartilhado, teste de handles, carga AdminPage derivada do probe e nativo. Suítes/editorial/CF/capture/dispatch e typecheck/build não substituem os comportamentos anteriores. Acesso autenticado e métricas no ambiente alvo ficam separados e marcados indisponíveis quando não executáveis. |
| Permissões e rollback | Escrita restrita, fixture somente localhost descartável, sem instalação ou uso de DATABASE_URL remoto, preservação do probe/diagnóstico, sem migration/deploy. Rollback somente do delta, reconhecendo restauração do defeito conhecido. |

Cuidados de execução já abrangidos pelos aceites, sem novos requisitos de produto: não usar conexão física ou contexto de tenant como singleton; guardar somente pool por destino; não fechar o pool real no finally de um serviço; não tratar uma Query lazy criada antes de end como autorização para novo uso de handle fechado; preservar os métodos de Query/cancelamento e opções de begin nos wrappers. Se um consumidor necessário exigir escrita fora da lista, emitir BLOQUEIO_DE_FRONTEIRA antes de alterar outro arquivo. Não há falha de consumidor adicional confirmada nesta revisão.

O uso de max3 não comprova automaticamente desempenho/ausência de espera ilimitada: as provas contratadas devem concluir as renderizações concorrentes e liberar capacidade após falha/cancelamento. Não há evidência aqui que justifique trocar a porta5432 por6543; a [documentação oficial Postgres.js/Supabase](https://supabase.com/docs/guides/database/postgres-js) registra limitações de pipelining no pooler transacional e alerta sobre `max_pipeline:0` com begin. O contrato preserva o modo existente e testa transações reais; a [documentação de conexões](https://supabase.com/docs/guides/database/connecting-to-postgres) foi consultada como referência.

## Versão documental examinada

Os hashes abaixo identificam a revisão anterior à execução. Verificações desta etapa: git status/HEAD, leitura e inspeção de consumidores/driver; não se executaram testes de entrega antes de existir implementação.

```text
DIAGNOSTICO.md 43db3d96b39f78a83934b27effd2384114a4b6503302ce289021348bd551057b
PLANO-ENTREGAS.md 00ebe751eed2f532236e687db56c56acda3c3a1c4aaa8a3fca6f6481d49ac112
OS-026.md 94271e921640e3b131adf4c9f1d92087f26fa1d69bacd390fcad787c44bea822
```

BUG-013 permanece confirmado e pendente de implementação/verificação. Próxima etapa: executor implementa esta ordem e congela fonte/resultados para auditoria seletiva dos mesmos aceites. Não autoriza operações remotas nem declara resolvido o incidente no ativo.

## Adendo — entrega seletiva da OS-026, tentativa #1

18/10/2026; modo `entrega`; escopo exclusivo BUG-013 e AC-026.1…4, mantendo o parecer contratual anterior como histórico. **Veredicto: CONFORME localmente.** A implementação supera a causa suficiente demonstrada no diagnóstico: criação de pool independente por operação. Não se atribuem todas as sessões do incidente remoto a esse mecanismo sem telemetria.

### Fonte congelada e preservação

Manifesto `/tmp/bizuminer-admin-pool-correcao/delivery.json`, SHA-256 **`df1f047c9844b27c77c3cc25b8b963a64d9272acda56df730b973e761647b220`**,992 arquivos, excluindo este parecer. Recálculo independente: zero divergências. Comparação com baseline da OS identifica somente `packages/web/lib/db.ts` como arquivo existente modificado; seu delta efetivo está restrito a imports, comentário e factory. Quatro novos arquivos de fonte/teste e documentos do plano/ordem/resultado correspondem ao escopo. Demais alterações anteriores, diagnóstico/probe, migrations/rollouts, env e páginas foram preservados. Evidência: `/tmp/bizuminer-admin-pool-correcao/audit-preservation.json`.

A revisão de código confirma: pool registrado por string de destino em globalThis, sem tenant/ator no registro; max3, prepare:false e limites de ociosidade/lifetime do contrato; handle próprio com end lógico; begin contextual por handle sem sobrescrever método do pool; guardas de execução lazy preservando cancelamento/query helpers. A inspeção foi contra o driver instalado e consumidores pertinentes, sem sugerir mudança de porta ou pool_size.

### Conformidade por aceite

| Aceite | Resultado e prova independente |
|---|---|
| AC-026.1 | **CONFORME local.** `admin-pool-flow.cjs` reexecutado: referência anterior uma página pico14; duas páginas produzem13 recusas modeladas. Nova factory: duas páginas AdminPage/DAL reais mais seis polls reais concluem, um pool, pico físico modelado3, zero recusa e zero sessões restantes. Recarga dos módulos preserva pool; teste unitário confirma separação de destinos. Driver/auth/UI são modelados nesta prova, sem SQL real. |
| AC-026.2 | **CONFORME local.** Teste PostgreSQL17.11 real reexecutado com pool/handles e `withAccountDb` reais, role sem bypass e RLS do rollout preservado.28 transações concorrentes A/B retornam somente produtos próprios; A/B/A, identidade estrangeira negada, rollback22012 e GUC local limpa passam. Pico de conexões físicas contado por pg_stat_activity:3. |
| AC-026.3 | **CONFORME local.** Mesma prova nativa confirma endA não interrompe transaçãoB, handle fechado rejeita novo begin, isolamento repeatable-read/read-only preservado. Cancelamento real57014 termina a consulta e SELECT42 seguinte passa; sessões físicas ociosas chegam0. Três unitários independentes verificam idempotência end, begin não mutado, SQL/unsafe/cursor lazy de handle fechado e transporte separado por destino. |
| AC-026.4 | **CONFORME no alcance local contratado.** Executor executou web428/428, typecheck/build, editorial29, CF, captura20 e dispatch8; logs de resultados finais inspecionados. Auditor executou independentemente fluxo, três unitários e prova nativa descritos. Ausência de sessão autenticada foi explicitada no resultado; não se converteu redirect para login em prova de carregamento autenticado. Não há certificação do ambiente remoto. |

### Execuções independentes e ambiente

- `node tools/editorial-tests/admin-pool-flow.cjs`: exit0, `/tmp/bizuminer-admin-pool-correcao/audit-flow.log`.
- `node --test --experimental-strip-types packages/web/test/database-pool.test.mjs`: execução host exit0, **3/3 testes**, `audit-unit-host.log`. A execução adicional na sandbox também terminou sem erro, mas sua saída agrupou o arquivo como um teste; a contagem3 refere-se ao host.
- `BIZUMINER_TEST_PG_BIN=/tmp/bizuminer-finalizacao/os-01/pg-tools/root/usr/lib/postgresql/17/bin node --import tsx admin-pool-native.test.ts`, cwd `tools/editorial-tests`: host exit0, `audit-native-host.log`. Binários PostgreSQL17.11 já existentes; cluster localhost descartável, sem instalação ou banco remoto. Primeira execução na sandbox falhou por `listen EPERM 127.0.0.1` antes de iniciar o cluster; repetição fora da sandbox foi aprovada tecnicamente e executada. O erro ambiental está em `audit-native.log`, sem patch de produção.
- Hashes/fronteira recalculados: `audit-preservation.json`; zero drift dos992 arquivos.

As demais suítes/build citados são evidência do executor examinada pelo auditor, não comandos apresentados como reexecutados nesta revisão. O auditor não utilizou sessão de usuário nem executou acesso remoto; o relato do executor de `/admin`→`/entrar?next=%2Fadmin` verifica somente a barreira sem sessão.

### Estado do BUG e limites de fechamento

**BUG-013: `verificado` no escopo da correção local; OS-026 apta a CONCLUIDO local.** Classificação permanece implementação preexistente à rodada OS-020…025; tentativa#1. Nenhum achado novo reproduzível ou desvio de contrato foi encontrado nesta versão, e não há motivo fundamentado para redesenhar os consumidores do admin.

O orçamento3 é por processo/destino, não distribuído entre réplicas, CLIs ou outros clientes. A fila substitui fanout físico, sem prometer latência ilimitadamente baixa. Auth/Storage/Supavisor gerenciados, carregamento autenticado no ambiente alvo e métricas no horário do erro **permanecem NAO_VERIFICADOS**; isto impede afirmar que o incidente remoto foi reproduzido/resolvido em produção, sem invalidar a prova do mecanismo local. Nenhum deploy, migration, mudança de env/porta/pool_size ou reinício foi executado pelo auditor. Relatório e `/tmp` foram suas únicas escritas.
