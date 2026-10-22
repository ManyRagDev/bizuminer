# Encerramento atual OS-07 — C aplicada

Estado: CONCLUIDO.16/10/2026,19:39 America/Sao_Paulo.

Após a resposta humana explícita “sim” à autorização exata de C/hash/destino/28 policies/controle, reconferi alvo, hash, backup persistente, workflows suspensos e zero sessões runtime ativas. MCP apply_migration aplicou C inteira,335.555 bytes, SHA256 a08659287c10e2b7e3358bf6029bec75277cc0ca0ce07655d7e9f70acef92597, sem wrappers ou SQL avulso. Retorno success=true; histórico remoto20261016223906 / garimpa_v2_scoped_cutover. A/B e as três aplicações anteriores preservadas.

Controle true; zero policies *_app_access;185 policies no total. Todas as guardas seladas de C passaram, sem adaptar catálogo ou bytes. A FK NOT VALID de experiment_evaluation continua a única não validada, como definido em B. Nenhuma validação extra ou alteração de grants/policies fora da unidade.

Projeção das28 tabelas originais igual ao aceite pré-C atualizado06, sem diferença de contagem ou digest; os oito fingerprints de schemas externos também iguais. Runtime real garimpa_app sem SUPER/BYPASS resolve owner local, nega conta alheia e leitura privada pública, preserva catálogo/worker/detalhe/monetização/link33pu e reseta contexto. Verificador remote-compatibility exit0/19 checks PASS. Uma consulta temporária de escolha de short_link estava fora de contexto e corretamente retornou vazio; foi corrigida no smoke para usar withAccountDb, sem mudar produção/assertions de comportamento. Registro inicial preservado em /tmp/bizuminer-finalizacao/os-08/runtime-first-attempt.json.

Backup pré-C atualizado/restaurado permanece privado e persistente, sem substituir OS-02. Proteção all e workflows suspensos mantidos; nenhuma retomada pública nesta ordem. Próxima: OS-08, integração e classificação por capacidade, seguida de OS-09 apenas para componentes aprovados.

---

## Tentativa anterior e rejeição, preservadas

# Resultado OS-07 — tentativa de aplicação C

Estado: BLOQUEADO exclusivamente pela exigência de autorização específica da revisão automática. Data:16/10/2026. OS-06 concluída; login real, curadoria, monitoramento e backup atualizado/restore demonstrados no resultado06. Nenhum defeito SQL foi identificado nesta tentativa.

Alvo confirmado: Supabase spbuwcwmxlycchuwhfir, schema garimpa. C inteira,335.555 bytes, SHA256 a08659287c10e2b7e3358bf6029bec75277cc0ca0ce07655d7e9f70acef92597, manifesto/verificador exatos e parecer12 favorável. Zero sessões runtime ativas, workflows capture/monitor disabled_manually, candidata READY e proteção all mantidos. Backup pré-C persistente atualizado e restore completo conferido na OS-06.

apply_migration(name=garimpa_v2_scoped_cutover, query=arquivo exato) foi rejeitado ANTES da execução pela revisão automática. Motivo informado: a autorização geral de conclusão não explicitava essa mudança persistente de segurança/estado em produção, envolvendo RLS/grants/funções/controle comercial. Essa descrição é do revisor automático; o escopo efetivo é o SQL aprovado exato, sem alterações adicionais.

SELECT posterior confirma commercial_rollout_ready=false e zero entradas de histórico para garimpa_v2_scoped_cutover. Não houve aplicação parcial, reenvio, SQL avulso ou transporte alternativo. A/B, dados e recuperação permanecem preservados.

Foi solicitada ao proprietário autorização específica para aplicar esse hash nesse destino, substituir as28 policies legadas previstas e ativar o controle. Aguardar resposta explícita; então reconferir manutenção/backup/hash e aplicar uma única vez via MCP. Smoke read-only pós-C preparado em /tmp/bizuminer-finalizacao/os-08/, sem execução antecipada. OS-08–10 ainda dependem de C.

[Evidência sanitizada](07-unidade-c.json). Esta fase não constitui conclusão da implantação nem substitui seus aceites posteriores.
