# Resultado OS-022 — canais e outbox

18/10/2026. Tentativa #1 para BUG-006/007/008, após OS-021; baseline main 43700c59 + snapshot f4fb6cbd. Somente caminhos autorizados alterados; dispatch-worker-flow.test.ts não precisou mudar.

Telegram/Webhook rejeitam ausência, null, revogação ou falha do resolver sem ler tokens/chaves do ambiente; removida chave padrão. Factory preserva alias telegram e suporta telegram_channel; webhook aceito pelo contrato de criação de kit. createApprovedAdapter integrado ao CLI embutido, preservando seleção explícita do canal, aprovação persistida, credenciais por conta e kill switch. Worker entrega fatos congelados de oferta/campanha para webhook. Telegram não inventa message_id na ausência de prova do provedor.

Retentativas usam computeNextAttempt compartilhado, base exponencial limitada, jitter e Retry-After como piso, com maxAttempts. Testes controlam relógio/aleatoriedade e verificam next_attempt_at real persistido (66s/132s), além de completar kit→aprovação→agendamento→worker→provider mockado em telegram_channel e webhook, assinatura HMAC e I/O fora da tx.

Unitários adapters/dispatch, test:dispatch (8 cenários), official-channel-flow e typecheck web: exit0. Logs /tmp/bizuminer-correcao-os19/os22-*.log. Nenhum destino real contatado, nenhum canal aprovado no ativo, nenhuma execução do CLI --execute. Estado IMPLEMENTADO_PENDENTE_VERIFICACAO.

Retorno seletivo durante OS-025: bateria web identificou que commerce-contract.test.mjs congelava a lista anterior. Fronteira revisada no plano/OS-022; teste mantém igualdade estrita incluindo os dois canais já aprovados pelo contrato. Nenhum novo patch de produção nesta integração.

Tentativa #2 — retorno seletivo BUG-008, revisão6 aprovada: probe independente demonstrou que o adapter descartava Retry-After600 antes do helper, gerando66s. Webhook agora lê o header HTTP em segundos ou data HTTP; ausente/inválido usa30, data passada0, valores não representáveis são inválidos. Relógio injetável no adapter permite teste determinístico da data sem I/O. Unitários cobrem600/0/data futura/passada/ausente/inválido; official-channel-flow mantém66/132s no Telegram e verifica next_attempt_at600/600s no Webhook com header real429. Integração e test:dispatch exit0, sem HTTP real; unidade executada novamente na suíte web completa para contagem efetiva de casos. Logs os22-*-retry2.log. Estado IMPLEMENTADO_PENDENTE_VERIFICACAO até contraprova independente.

Fechamento vigente — CONCLUIDO no escopo técnico local desta OS, após tentativa #2 para BUG-004/008 e parecer independente final CONFORME em [AUDITORIA-ENTREGA.md](AUDITORIA-ENTREGA.md), adendo final de 18/10/2026. Fonte examinada: manifesto f4e512c932a6c3de4f789afdd57aa5c6cc444bb3cd083811050a4546221da391. Os estados pendentes anteriores registram o histórico. Esta atualização encerra documentação; não altera fonte/teste nem declara implantação/homologação no ativo.
