# OS-05 — Web e consumidores compatíveis publicados sob manutenção

Estado: PRONTA

Atualização autorizada OS-12: a pausa original bloqueia builds novos. Consumir proteção temporária Vercel Authentication all e seu aceite antes de publicar; manter fechamento público/writers parados. Nos462 caminhos de montagem, somente C/manifesto recebem os bytes corrigidos do delta12; todos os demais continuam exatos31. Gerador/teste novos podem ser versionados exclusivamente no checkout isolado conforme OS-12. Após build e smoke reservado, pode promover a candidata no domínio canônico ainda protegido, necessário ao OAuth existente da OS-06. Não restaurar acesso público nesta ordem. Os dois deployments BLOCKED anteriores não comprovam publicação. Sem outras mudanças de comportamento ou configuração.
Papel: executor-blindado
Base verificada: main / 43700c59f4e24f68f3a2e32c20ee5147fa4816cd + alterações locais preexistentes; conferir novamente antes de executar.
Depende de: OS-04 CONCLUIDA; candidata validada OS-01 e janela OS-02 mantida.
Execução: sequencial

## Objetivo e aceite

- AC-1: Vercel serve artefato compatível identificado por deployment/commit/configuração efetivos; nenhum segredo publicado.
- AC-2: refs de captura/monitoramento/triagem/dispatch e extensão identificadas; processo antigo drenado e não reinicia. Writers permanecem parados até seus smokes.
- AC-3: nenhum push dispara migrations históricas; existe artefato de recuperação compatível com B e C. Build e HEAD isolados não são evidência de publicação.

## Leitura e contrato

- CF-01/03; resultados OS-01/04.
- Manifesto fechado `docs/implementation/evidencias/execucao-31-release-fontes.json` e tar persistido.
- `.github/workflows/capture-offers.yml`, `.github/workflows/monitor-prices.yml`, `packages/web/lib/capture-dispatch.ts`, `packages/web/bin/run-capture-batch.ts`, `packages/persistence/bin/monitor-prices.ts`.
- Inventário de configuração/consumidores28/31 e parecer33.

## Escrita autorizada

Publicar/versionar em checkout isolado somente os 462 caminhos exatos enumerados no manifesto de fontes31, preservando seus bytes; a lista é allowlist fechada de montagem, NÃO autorização para editar comportamento. Nenhum novo arquivo de runtime ou atualização de lockfile é permitida.

Preservar no candidato as quatro remoções já realizadas, sem executar nova remoção no checkout compartilhado:
- `packages/web/app/admin/curadoria/held-queue-view.tsx`
- `packages/web/app/admin/curadoria/learnings-view.tsx`
- `packages/web/app/admin/direcionamento/cockpit-operacional.tsx`
- `packages/web/app/admin/emergency-approval.tsx`

Resultado e evidência desta ordem; `.vercel/project.json`, builds/cache/dependências apenas na cópia isolada `/tmp/bizuminer-finalizacao/os-05/`. Configuração server-only remota somente por nome/necessidade confirmados, sem valores em Git/log. Não usar `git add .`, commit/reset/stash/limpeza do trabalho compartilhado.

Resultado: `docs/implementation/contratos-finalizacao/resultados/05-publicacao.md` — novo, exclusivo do executor desta ordem.
Evidência: `docs/implementation/contratos-finalizacao/resultados/05-publicacao.json` — opcional, nova e sanitizada, limitada ao aceite desta ordem.
Protegidos: todo caminho fora da lista; contratos compartilhados, SQLs/manifestos selados, testes de aceite e evidências históricas não podem ser alterados. Nenhuma ordem autoriza limpar trabalho preexistente. Escrita remota tem escopo próprio abaixo e não decorre da lista de arquivos.

## Dependências e integração

O executor desta ordem é seu único escritor; não há execução paralela autorizada. Consumir o resultado anterior, conferir suas evidências e interromper a fase dependente se houver falha. CF-01 rege transição, CF-02 preservação/recuperação e CF-03 integração. OS-08 valida o conjunto e OS-10 é o único integrador dos registros centrais. Não avançar com estado desconhecido nem pedir nova autorização genérica quando a existente já cobre alvo/operação e suas condições estão satisfeitas.

## Verificações

Conferir arquivo persistido e cada fonte contra manifesto; conferir exclusões e remoções. Checar gatilhos de integração Git/Supabase antes de push. Na cópia: `npm run build --prefix packages/web`, `npm run typecheck --prefix packages/web`, testes afetados já definidos na OS-01; build da extensão se distribuída.

Verificar metadados do projeto Vercel (root packages/web, Node24.x atual) e build remoto/artefato; ambiente preview não é isolado. Guardar deployment/commit/rotas efetivos e plano compatível de recuperação. Conferir ref `GITHUB_CAPTURE_REF` e default branch usado pelo cron: ambos devem resolver aos bytes auditados. Registrar SHA do run real em OS-09; não disparar jobs só para provar ref agora.

Testar conectividade/configuração mínima sem imprimir env; reciclar processos/pools antigos. Se secret indispensável não existe, declarar bloqueio específico, sem copiar credencial da casa para outra conta.

## Operações externas

Autorização anterior de finalizar/publicar o BizuMiner: somente Vercel web/equipe CF-01, GitHub ManyRagDev/bizuminer e dispositivos do proprietário. Pode publicar ref isolada de fontes aprovadas e ajustar apontamentos estritamente necessários. Antes de acionar Git/default branch, comprovar que não haverá execução automática de SQL histórico ou writers antigos.

Deploy não reabre janela. Manter jobs suspensos e entrada pública fechada conforme OS-02. Não alterar domínio/Google OAuth, fazer broad env pull com saída em log ou conceder escopo OAuth adicional. Falha mantém B/control=false e manutenção; corrigir via ordem delimitada, não editar código livremente nesta ordem.
