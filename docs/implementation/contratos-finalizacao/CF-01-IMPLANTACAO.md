# CF-01 — Implantação compatível e efeitos autorizados

Estado: PRONTA para consumo pelas ordens, sujeita às pré-condições de cada fase. Fonte decisória: parecer33 e roteiro36. Não altera contratos C-01 a C-09.

## Exceção autorizada OS-12 — vigente sobre as referências históricas abaixo

O proprietário autorizou corrigir exclusivamente a ordenação da guarda de inventário de C e seu gerador/envelope, com testes e novo parecer antes da aplicação. C corrigida: SHA256 `a08659287c10e2b7e3358bf6029bec75277cc0ca0ce07655d7e9f70acef92597`; manifesto corrigido: `3c8af38ce344ef3ad8030b07a58e2503f567ab964e8842bb592290421c886081`. A/B/catálogo permanecem exatos. O hash anterior de C na tabela histórica NÃO autoriza aplicação; consumir delta/evidências/parecer da [OS-12](ordens/12-correcoes-autorizadas.md). O parecer33 não aprova automaticamente os bytes novos.

Manutenção autorizada substituta: Vercel Authentication `all` somente no projeto web/equipe abaixo, confirmada antes de unpause. Após unpause manter autoassign false, comprovar URLs anônimas fechadas e acesso reservado; falha exige repause imediato. A candidata testada pode ser promovida ao domínio canônico ainda sob proteção all para testar o Google OAuth já configurado, sem modificá-lo. Restaurar proteção anterior somente na OS-09 após aceites. A obrigação de não abrir acesso geral entre B/C permanece. Publicação usa os462 caminhos31, aceitando somente C/manifesto do delta12 como exceções de bytes; pacote/tar31 não são reescritos. Commit isolado pode incluir gerador/teste aprovados pela OS-12; runtime restante intacto.

## Entrada, identidade e saída

Entrada: candidata auditada, três SQLs/manifesto exatos, catálogo remoto reconciliado, inventário de todos os leitores/escritores BizuMiner, backup recuperável, manutenção controlada e resultados da ordem anterior. Origem da autoridade: autorização humana anterior, condicionada ao parecer33 e à revisão automática aplicável. Identidade da sessão administrativa não é identidade do usuário runtime.

Saída por unidade: versão local + versão efetivamente instalada/publicada, pós-condições observadas, efeito remoto e evidência sanitizada. Erros: hash/catalogue drift, dependência ausente, permissões insuficientes, publicação incompatível, escritor antigo, backup inválido, falha de smoke ou resultado remoto incerto. Qualquer um interrompe a fase dependente; não converter falha em aprovação.

## Recursos fechados

| Recurso | Alvo | Efeito permitido no futuro executor |
|---|---|---|
| Banco ativo | Supabase `spbuwcwmxlycchuwhfir`, schema `garimpa` | Apenas A, B e C abaixo, cada uma atômica e registrada, na ordem indicada |
| Exceções externas ao schema | Mesmo projeto | Role restrita `garimpa_public_runtime`, membership em `garimpa_app`, bucket privado novo `bizuminer-private` e histórico de migrations conforme SQLs |
| Web | Vercel `web`, projeto `prj_fhslrWGdYJG5rdKnE8vkGmFSh3Ym`, equipe `team_CdqNeIvhoe03YClNYUpP6C1w` | Publicar candidata compatível; pausar/retomar somente esse projeto; configurar apenas variáveis indispensáveis do BizuMiner |
| Workers | GitHub `ManyRagDev/bizuminer` | Controlar somente `capture-offers.yml` e `monitor-prices.yml`; publicar ref compatível e conferir SHA da execução real |
| Dispositivos | Extensão BizuMiner do proprietário | Parar captura, instalar/verificar pacote compatível quando necessário; manter dispositivo antigo desativado |

Não mudar Google OAuth, Auth/Storage globais, demais buckets, schemas/policies dos outros produtos, defaults globais ou escopos de conta. Não contratar staging. Não reativar o MCP `supabase-management` removido32/33. A preview Vercel existente usa o banco ativo: não é sandbox.

## Artefatos imutáveis

Base: `packages/persistence/supabase/rollouts/v2/`.

| Unidade | Arquivo | SHA-256 aprovado33 |
|---|---|---|
| A | `20261015194719_garimpa_v2_foundation.sql` | `33e03729f9e058169844fc353cba083cb3d5fe270b98ea890dafd0fb0a87c40c` |
| B | `20261015194748_garimpa_v2_expansion.sql` | `02810325f1eecc16dfc05121f44b75a64c5ce0655b9329f2662ffb0d74cbecaa` |
| C | `20261015194759_garimpa_v2_scoped_cutover.sql` | `1114987e4108745492af6c3457ec6850a999ed16be79d815d001c4b156669a21` |

Manifesto existente: SHA-256 `dafa91ab8231fa0ebed32152412586100ec3c499dfa52f5703bf1d50493ab7eb`. Seus hashes vinculam a aprovação independente aos bytes; não são um mecanismo novo de controle do executor. Manter `productionApproved=false` histórico: aprovação condicional33 é documento separado.

Três aplicações anteriores: M1 remota `20261015034755`, proteção de segredos `20261015035126` e autoria `20261015041540`. Conciliar nomes/versões atuais; não reaplicar. As 11 originais pendentes foram substituídas por A/B/C. **Não executar `db push` da pasta histórica**, M2 original, partes selecionadas dos SQLs ou recaptura automática do catálogo para aceitar drift.

## Transição

| Estado observado | Operação seguinte | Aceite mínimo |
|---|---|---|
| Legado, manutenção, backup válido | A | Helpers/role pública restrita e controle falso; dados e policies legadas intactos |
| A confirmada | B | 37 tabelas novas, funções/projeções e bucket privado; grants/colunas explícitos, capacidades novas negadas, legado legível |
| B confirmada, controle falso | Publicar web/workers | Artefato efetivo compatível com B e C; GUC transacional e conta/ator corretos; todos os antigos parados |
| Publicação verificada, pré-C aprovado | C | Preflight selado passa, só 28 policies legadas substituídas; específicas preservadas; controle true por último |
| C confirmada, manutenção | Smokes reais e retomada | Runtime sem bypass funciona; isolamento/integridade preservados; somente capacidades aprovadas ativadas |

Uma transação completa por A/B/C, com registro de histórico coerente. Confirmar semântica de transação/histórico do MCP antes de aplicar. `lock_timeout=5s` e `statement_timeout=45s` já pertencem aos arquivos; o segundo é por statement, não duração total. Não adicionar wrappers que modifiquem bytes nem fracionar para contornar limites. Se a ferramenta não garantir atomicidade, parar e resolver a capacidade com revisão; não improvisar transporte após rejeição.

## Publicação e manutenção

A lista fechada de fontes é `docs/implementation/evidencias/execucao-31-release-fontes.json`: **462 caminhos exatos**, sem segredos. Arquivo persistido: `docs/implementation/evidencias/bizuminer-release31-r3.tar.gz`, SHA-256 `7fcbb0dd4a541cb6bd400f96877e2dbe4eff20a36f7f458023f40801eb605040`. O pacote é fonte, não build nem publicação. Validar cada caminho contra a cópia a publicar; mudança material exige revisão localizada. Não incluir indiscriminadamente o diff da árvore compartilhada.

Preparar checkout isolado para montagem/versionamento; não resetar/stash/limpar o checkout do usuário. Preservar as quatro remoções preexistentes listadas na OS-05. npm ci não autoriza reescrever lockfiles. O tar não contém todos os insumos do verificador SQL; verificá-lo no repositório completo, preservando as fontes históricas.

Antes de qualquer push, verificar gatilhos Git/Vercel/Supabase e impedir aplicação automática das migrations históricas. Comprovar a possibilidade de publicar e testar sob manutenção. A capacidade Vercel de pausa/retomada existe, mas sua cobertura de URLs imutáveis/antigas e o acesso reservado à candidata **precisam ser demonstrados na OS-01/02**. Não existe flag de manutenção nova implantada por estes documentos. Se pausa não fechar os escritores ou impedir os smokes, delimitar a solução antes de A; não liberar acesso geral entre B e C.

Inventariar web, callbacks, cron, workflow manual, fila/lease, captura/triagem, monitoramento, dispatch, scripts e dispositivos. Pausar novos inícios, cancelar/drenar os pendentes, verificar transações e impedir reinício antigo. Pausa global do Supabase, revogação da role compartilhada ou edição ampla de firewall não são alternativas autorizadas por esta lista. Componente não essencial sem prova fica parado e explicitamente pendente; componente essencial sem prova bloqueia C.

## Falha e recuperação

- Antes do commit: rollback da unidade; confirmar catálogo/histórico. Em timeout/desconexão, estado é desconhecido até leitura conciliada; não repetir cegamente.
- A/B confirmadas podem permanecer instaladas com controle falso enquanto a publicação é corrigida.
- Depois de C: manter manutenção; corrigir código/contexto/permissão específica compatível mediante ordem fechada. Controle falso não restaura RLS antiga. Retorno ao código antigo exige prova de compatibilidade.
- Não restaurar `using(true)`, apagar histórico ou restaurar o projeto compartilhado. Recuperação seletiva real segue CF-02; este contrato não libera restauração destrutiva genérica.

Aceite integrado: OS-03/04/07 comprovam estado SQL, OS-05/06 comprovam consumidores e OS-08/09 comprovam operação. Nenhum resultado isolado substitui os demais.
