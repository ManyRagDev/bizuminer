# Diagnóstico — EMAXCONNSESSION no painel admin

18/10/2026. Intenção: investigação focada. Protocolo primário performance, complementar integrações. Baseline `main 43700c59f4e24f68f3a2e32c20ee5147fa4816cd` com alterações locais preexistentes e OS-020…025 preservadas. Nenhum código de produção, configuração, teste existente, migration ou dado remoto foi alterado nesta investigação.

## BUG-013 — concorrência de clientes sem orçamento compartilhado

**Estado: confirmado no código e no modelo offline; causa suficiente reproduzida. Severidade: alta, indisponibilidade do admin. Classificação: implementação preexistente à rodada OS-020…025.** Atribuir todas as sessões do incidente real a este caminho permanece hipótese, sem telemetria remota da ocorrência.

O usuário recebeu `(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15`. As três configurações locais de DATABASE_URL apontam ao pooler Supabase na porta5432, role garimpa_app; nenhuma URI ou credencial é reproduzida aqui. Há um servidor Next deste projeto em localhost:3100. A URL exata do erro reportado não foi confirmada; configuração/deployment publicado não foi inspecionado.

Primeiro desvio: `packages/web/lib/db.ts:55` cria um pool Postgres.js novo por chamada. `max:1` limita apenas essa instância. `packages/web/app/admin/page.tsx:118` lança consultas em Promise.all: visão geral1, cliques1, contagens1, curadoria1, histórico/em andamento nas três lojas6, mesa de auditoria2, diretriz1, seleção1 = **14 clientes potencialmente simultâneos**. O layout também consulta curadoria/memberships; autenticação, outras requisições e workers disputam capacidade, sem estarem incluídos nessa medição.

Em session mode cada conexão ocupa uma sessão até desconectar. Um carregamento deixa somente uma vaga no teto15; duas renderizações sobrepostas podem excedê-lo. As abas carregam dados mesmo quando ocultas; admin-tabs usa hidden, e componentes montados podem acrescentar polling. O comentário em db.ts que sugere manter o teto distante com max:1 não é garantia global.

## Reprodução e evidência

Na raiz do repositório:

```bash
node docs/implementation/diagnosticos/admin-pool/probe.cjs
```

O probe transpila a página e executa os módulos reais de DAL/factory/contexto; substitui autenticação/UI e driver por fixtures. O driver contabiliza sessões e simula o orçamento15 e duração de consultas. **Não executa SQL real, RLS real, sessão Supabase, navegador ou rede.** Reproduz o mecanismo de concorrência, não constitui reprodução autenticada no ambiente do incidente.

| Cenário sintético | Pico de clientes aceitos | Criados/encerrados | Recusas | Resultado |
|---|---:|---:|---:|---|
| Uma renderização, orçamento15 | 14 | 18/18 | 0 | Página resolve |
| Duas renderizações sobrepostas, orçamento15 | 15 | 28/28 | 13 | Ambas falham com a recusa modelada EMAXCONNSESSION |

Exit0: asserts confirmam pico14, falha sob sobreposição e zero clientes restantes após término das tarefas. Log bruto: `/tmp/bizuminer-admin-pool-diagnostico/probe.log`. A primeira execução do harness faltou stub server-only; corrigido somente no harness, antes da medição. Nenhum patch exploratório de produção.

Os hashes de db.ts, admin/page.tsx, admin/layout.tsx e tenant-db.ts são idênticos aos do manifesto anterior às OS-020…025 (`f4fb6cbd…`, cópia inicial preservada). A investigação não demonstra regressão introduzida nessas correções. Os logs locais disponíveis não contêm a ocorrência reportada; não há stack/digest remoto adicional.

## Hipóteses rivais e limites

- **Vazamento:** não demonstrado no caminho medido; todos os clientes criados são encerrados. Isso não exclui vazamento em outros processos/caminhos.
- **Consultas lentas ou outros consumidores:** podem ampliar a sobreposição; não medidos. pg_stat_activity/métricas Supavisor no horário do erro discriminariam duração, origem e estado das sessões. Nenhum acesso remoto foi executado.
- **Processos locais duplicados deste projeto:** não observados no inventário atual. Uma única instância Next ainda pode atender requisições simultâneas.
- **Next/Webpack:** a versão informada não demonstra causa no framework; a recusa apresentada vem do pooler.

## Encaminhamento e critérios de fechamento

Preparar correção delimitada de gestão de conexões: orçamento compartilhado com espera/reutilização segura e redução do paralelismo/leituras duplicadas do admin. Manter autorização por transação e isolamento por conta. Um singleton ingênuo que capture contexto de uma requisição, ou cujo end() seja chamado por outra, pode comprometer isolamento/disponibilidade; não foi implementado.

Aceite: carga com ao menos duas renderizações concorrentes e chamadas do painel respeita o orçamento e conclui sem EMAXCONNSESSION; encerramento também ocorre em falha/cancelamento; contas A/B continuam isoladas sob SQL/RLS reais; validar acesso autenticado no ambiente alvo e métricas do pooler antes de declarar resolvido. Aumentar pool_size isoladamente ou reiniciar apenas desloca o limite, sem fechar o defeito demonstrado.

Não trocar automaticamente5432 por6543. A documentação atual aponta limitações de pipelining do Postgres.js no transaction pooler e alerta que max_pipeline:0 quebra begin(). Qualquer troca exige teste específico das transações/contextos existentes. Responsável seguinte: arquiteto/executor com este diagnóstico; status atual permanece **confirmado, não corrigido**.

Referências oficiais consultadas: [conexões e modos](https://supabase.com/docs/guides/database/connecting-to-postgres), [semântica de clientes/sessões](https://supabase.com/docs/guides/troubleshooting/supavisor-and-connection-terminology-explained-9pr_ZO), [Postgres.js e limitações do transaction pooler](https://supabase.com/docs/guides/database/postgres-js). Changelog e observabilidade consultados; não foi identificada mudança documentada que explique especificamente esta ocorrência.
