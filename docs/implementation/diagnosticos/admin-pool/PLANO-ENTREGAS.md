# BUG-013 — correção do orçamento de conexões

18/10/2026. Pedido `corrija` autoriza execução local após diagnóstico. Uma ordem crítica OS-026, com contrato independente antes do executor e contraprova seletiva final. Baseline main43700c59 + alterações locais preservadas; manifesto/cópias em /tmp/bizuminer-admin-pool-correcao. Sequência: contrato → revisão → implementação → testes → parecer. Sem nova implantação/SQL remoto.

Usar pool Postgres.js compartilhado por processo/destino, limitado a três conexões; filas do próprio driver absorvem leituras simultâneas. Não redesenhar as abas nem serializar toda requisição. Cada db() devolve um handle próprio cujo begin mantém contexto por transação, sem mutar o pool compartilhado; end encerra apenas esse handle. Sessões físicas são reutilizadas e expiram por ociosidade. A nova fronteira resolve o fanout14 sem criar sessão por serviço. Escopo e aceites na OS-026; não muda pool_size remoto, env ou porta.
