# OS-12 — Correções autorizadas de collation e manutenção

Estado: PREPARADA; execução após parecer de contrato. Origem: dois diagnósticos confirmados na OS-05 e autorização humana explícita nesta conversa para ambas as correções, testes, novo parecer e continuidade autônoma. Baseline: main43700c59 + alterações preexistentes; snapshot completo em `/tmp/bizuminer-finalizacao/os-12/baseline.json`. Porte crítico pela integração em produção, embora o diff SQL seja restrito à canonicalização de um inventário.

## Objetivo, limites e dependências

Corrigir o falso negativo de C causado por en_US.UTF-8 versus C e permitir construir/testar a candidata com todas as URLs BizuMiner protegidas. A/B já instaladas permanecem intactas e não serão reaplicadas. Não mudar catálogo de referência, regras de negócio, dados, grants/policies, Google OAuth, outros projetos, Auth/Storage global ou dependências. Nenhuma remoção de guarda. OS-01–04 e backup válidos; OS-05 retomada após estes aceites. OS-06–10 mantêm seus aceites e sequência; OS-11 continua dependente das entradas reais.

## Escrita exata

- Existentes: `tools/editorial-tests/build-rollout.py`; `packages/persistence/supabase/rollouts/v2/20261015194759_garimpa_v2_scoped_cutover.sql`; `packages/persistence/supabase/rollouts/v2/manifest.json`.
- Novo teste: `tools/editorial-tests/rollout-collation-flow.test.ts`, executado diretamente, sem alterar package.json.
- Integração documental estritamente desta exceção: `docs/implementation/contratos-finalizacao/CF-01-IMPLANTACAO.md`, `ordens/05-publicacao.md`, `ordens/07-unidade-c.md` e este arquivo; preservar históricos/hashes anteriores como supersedidos.
- Novos resultados exclusivos: `docs/implementation/contratos-finalizacao/resultados/12-correcoes-autorizadas.md`, `12-correcoes-autorizadas.json`, `12-auditoria-contrato.md` e `12-auditoria-entrega.md`. Auditor só escreve seus dois pareceres, sem tocar runtime/contratos/testes.
- Nova evidência de delta: `docs/implementation/evidencias/os12-delta-fontes.json`, com hashes anteriores/novos dos três arquivos corrigidos e teste novo; não reescrever manifesto/tar históricos31. SQL/envelope anterior preservados em temporários para diff e auditoria.
- Temporários: `/tmp/bizuminer-finalizacao/os-12/`; montagem isolada da OS-05 pode receber somente C/manifesto novos como exceções ao pacote original462. Nenhuma mudança nos outros460 arquivos. Checkout Git isolado pode incluir também gerador/teste aprovados; nunca stage/commit no checkout compartilhado.

Todo caminho restante protegido. Geração completa `build-rollout.py --seal` somente em cópia isolada: provar A/B/catálogo e restante de manifesto inalterados antes de transportar a correção. Não recapturar catálogo.

## Aceites e verificações

- AC-12.1: único diff de C é `COLLATE "C"` no ORDER BY da guarda `rollout_function_inventory_mismatch`; gerador produz os mesmos bytes; somente sha256/manualTransactionSha256 da unidade C mudam no manifesto. A/B e catálogo exatos preservados. Verificador existente `npm run rollout:verify --prefix tools/editorial-tests` passa.
- AC-12.2: teste nativo descartável prova inventário válido aceito com C e en_US.UTF-8, ausência/extra/overload rejeitados e controle/policies intactos em falha. Executar suites nativas `test:replacement-rollout` e `test:operational-maintenance` na cópia isolada, sem sobrescrever evidências históricas. Registrar limite: isso não prova OAuth/Storage/pooler gerenciados. Auditor aprova o hash corrigido exato depois dos testes; autorização de aplicação continua condicionada a OS-06 concluída e preflight remoto íntegro.
- AC-12.3: confirmar projeto Vercel web/equipe CF-01 e configuração anterior; aplicar `ssoProtection.deploymentType=all` enquanto ainda pausado. Ler de volta antes de unpause. Manter autoassign false e monitoramento/captura suspensos; observar se unpause restaura autoassign e reconfirmar false antes de criar/push de candidata. Após unpause, testar todos os hosts inventariados OS-02 e novos hosts: visitante anônimo não alcança aplicação, redirecionamento somente à autenticação Vercel; ferramenta autenticada acessa versão reservada. Não contar página intermediária200 como aplicação pronta. Se algum host ficar público indevidamente, repause imediato e interromper.
- AC-12.4: guardar estado da proteção antes/depois, hashes e pareceres, sem credenciais. Deploy novo depois da proteção comprovada; candidatos BLOCKED/alwaysRefuseToBuild antigos não são reaproveitados como builds verdes. Retomar OS-05/06, depois C corrigida pela OS-07, OS-08 e OS-09. Restaurar proteção anterior somente na OS-09 após aceites; se restauração falhar, manter fechado e registrar, sem alterar proteção de equipe.

## Permissão remota e recuperação

Autorização humana cobre somente Vercel `prj_fhslrWGdYJG5rdKnE8vkGmFSh3Ym`, equipe `team_CdqNeIvhoe03YClNYUpP6C1w`: proteger todos os endereços via autenticação Vercel, unpause/repausar e restaurar proteção anterior após aceites. Nenhuma contratação/add-on. Supabase `spbuwcwmxlycchuwhfir`, schema garimpa: nesta OS apenas leituras; C corrigida aplicada inteira por MCP na OS-07 após novo parecer e dependências. Publicação/ref GitHub seguem OS-05, com delta autorizado e gatilhos conferidos. Revisão automática permanece aplicável; resposta incerta exige consultar estado antes de repetir.

Falha local não muda banco. Falha de proteção exige repause e preservação da configuração restritiva. Falha pré-C mantém B/control=false; nenhum retorno a policies permissivas após C. Backup/restore e recuperação seletiva seguem CF-02. Não dar conclusão de implantação antes de OS-10.
