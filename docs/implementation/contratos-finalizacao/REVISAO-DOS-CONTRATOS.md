# Conferência dos contratos e ordens

16/10/2026. Revisão documental realizada pelo autor, **não auditoria independente, autorização adicional ou homologação da implantação**. Skill principal: `/home/many/.codex/skills/arquiteto-de-contratos/SKILL.md`. Orientações locais Supabase e supabase-postgres-best-practices consultadas para banco, privilégio mínimo, RLS, pooler e recuperação.

## Evidências desta entrega

- Conferidos raiz, main/HEAD, diferenças locais e staged. Há trabalho anterior extenso, inclusive fontes não versionadas; nada staged. Nenhum contrato em uso, SQL ou runtime foi modificado por esta entrega.
- `npm run rollout:verify --prefix tools/editorial-tests`: **PASS, exit0**. Confirmou hashes A/B/C, três aplicações anteriores preservadas, 11 originais substituídas, 28 policies legadas e 37 tabelas novas.
- Comparação somente leitura dos 462 arquivos atuais com `execucao-31-release-fontes.json`: **462 encontrados, zero diferenças**. Tar persistido também confere com SHA-256 original. Esta evidência identifica fontes; não cria deployment.
- Rastreabilidade existente contém **62 IDs REQ únicos**; o índice das specs cobre EP-00 a EP-12. Não foi criada outra arquitetura de domínio nem duplicada API existente.
- Validação documental dos caminhos, links relativos existentes, comandos npm, dependências, estados e resultados exclusivos executada nesta rodada; resultados resumidos no fechamento desta revisão.

Não executados nesta entrega: novos testes funcionais amplos, backup/restore, SELECT remoto, DDL, pausa, login, push, deploy ou ativação. As provas31/33/35 continuam datadas e não foram sobrescritas. Não foram criados relatórios fictícios em `resultados/`.

## Cruzamento com o roteiro36

| Passos36 | Contrato e ordem | Coerência exigida |
|---|---|---|
| 1–2 | CF-01; OS-01/05 | Candidata identificada e publicável; fontes diferentes do HEAD antigo; controle de refs e gatilhos automáticos |
| 3–5 | CF-02; OS-01/02 | Ferramentas/export legítimos e restore seletivo; manutenção, baseline e acesso distintos; outros apps protegidos |
| 6–7 | CF-01/02; OS-03/04 | A depois B, transações/histórico; legado preservado e novas capacidades fechadas |
| 8–9 | CF-01/03; OS-05/06 | Publicação compatível e smokes reais antes de C; antigos drenados |
| 10 | CF-01/02; OS-07 | Corte exato, específicas preservadas e controle no final |
| 11 | CF-03; OS-08 | Funcionalidades além de DDL; matriz de aceite por ambiente/capacidade |
| 12 | Protocolo do índice e falhas CF-01/02/03 | Defeito gera ordem corretiva localizada, com diagnóstico e paths fechados; não autorização arbitrária de reparo |
| 13 | Registro de capacidades; OS-11 | Entrada externa e lacuna técnica separadas; novas ordens somente para fronteiras comprovadas |
| 14–15 | CF-02/03; OS-09/10 | Retomada observada, registros reconciliados, alcance da conclusão e bloqueios explícitos |

## Inconsistências prevenidas e decisões registradas

1. **Staging obrigatório versus parecer33:** prevalece o adendo direto para estes bytes/usuário único. Não solicitar novamente custo/provisionamento/scopes rejeitados; backup, manutenção e smokes reais permanecem obrigatórios.
2. **Contrato de domínio versus estado HTTP real:** C-01 a C-09 são reutilizados; CF-03 registra handlers efetivos e códigos observados, sem afirmar que o erro genérico abstrato já exista em toda rota.
3. **Publicação antes do banco versus corte antes dos consumidores:** sequência fechada A → B → web/workers compatíveis → pré-C → C. Código novo encontra expansão; permissões novas não surpreendem writer antigo ativo.
4. **Manutenção presumida:** a pausa Vercel não é tratada como prova de fechamento de todas as URLs nem de acesso reservado. OS-01/02 precisam demonstrar ambas; se faltar mecanismo, a execução para antes da primeira DDL e delimita a solução.
5. **Snapshot versus recuperação:** digests35 não substituem exportação completa/restore; tools dump/restore ainda precisam ser disponibilizados. Nenhum backup foi anunciado como pronto.
6. **Backup anterior versus smokes que escrevem:** OS-06 deve contabilizar gravações legítimas e alinhar a recuperação antes de C; não atualizar baseline para ocultar diferença.
7. **Integridade administrativa versus acesso:** CF-02 exige preservação global dos registros e acesso legítimo pelo runtime/pooler real; não exige dados privados universais nem usa postgres como falsa prova de RLS.
8. **Suites que sobrescrevem histórico:** testes nativos31 rodam em cópia isolada; script35 não é reutilizado para substituir seu resultado original. Evidências novas pertencem a cada ordem.
9. **Lista aberta de publicação/reparo:** OS-05 referencia allowlist existente de462 caminhos e quatro remoções anteriores. Nenhuma ordem dá edição de lógica por wildcard; defeito novo exige fronteira localizada antes da correção.
10. **Controle true versus autorização comercial:** não habilita claims E3, rubrica, canal, imagens, segredo ou piloto sem entradas. Parser específico, adapter oficial e resolver multicliente não são declarados concluídos apenas por haver tipos/tabelas.
11. **Fechamento versus requisitos faltantes:** OS-10 pode encerrar o núcleo; integral do Blueprint continua condicionado às capacidades faltantes implementadas e homologadas. OS-11 apenas fecha entradas/contratos e não finge implementar suas features.
12. **Arquivos centrais concorrentes:** cada executor escreve seu resultado exclusivo; somente OS-10 atualiza STATUS/índices/planos/gates. Não há delegação paralela ou novo quadro de estado compartilhado.

## Prontidão e limites

**Três contratos PRONTOS; dez ordens PRONTAS após dependências e uma BLOQUEADA por entradas/fronteiras listadas.** Não existem resultados de execução pré-preenchidos. A execução começa por OS-01, não por migration ou deploy. Uma falha operacional identificada transforma o resultado da ordem em BLOQUEADO/NAO_VERIFICADO e impede o próximo efeito dependente.

Os bloqueios operacionais atuais ainda são: meios de export/restore e cópia protegida comprovados; fechamento real dos escritores com acesso reservado; publicação de consumidores compatíveis; aplicação e conferências gerenciadas. Podem ser resolvidos pelas ordens prontas sem redesenhar o domínio. Os bloqueios comerciais e lacunas técnicas de capacidades estão no registro próprio; não foram atribuídos a um genérico “MCP desconectado”.

Fontes externas consultadas: [changelog oficial Supabase](https://supabase.com/changelog) e [backups oficiais](https://supabase.com/docs/guides/platform/backups). As URLs Markdown retornaram tipo não suportado pela ferramenta; foi usada a versão HTML. A documentação confirma que o backup SQL não inclui conteúdo Storage. Não foi inferida disponibilidade de PITR/plano pago nem prescrito upgrade de versão nesta tarefa. O executor revalida documentação e versão antes de operações dependentes da plataforma.

## Resultado da validação documental

**PASS:** 17 documentos novos nesta pasta, três contratos, 11 ordens (dez PRONTAS e uma BLOQUEADA), 11 resultados exclusivos previstos; links relativos, seções obrigatórias, sequência das dependências, estados e comandos npm referenciados conferidos. Zero caminho de escrita genérico de runtime identificado. As 462 fontes continuaram sem diferenças; HEAD, branch, diff tracked e diff staged preexistentes permaneceram iguais. As únicas novas entradas no status detalhado foram os 17 documentos desta tarefa. Nenhuma evidência futura foi pré-preenchida.
