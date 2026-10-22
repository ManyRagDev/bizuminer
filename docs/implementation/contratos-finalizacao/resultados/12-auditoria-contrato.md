# OS-12 — Auditoria de contrato

Modo: `contrato`, skill `auditor-red-team`. Data: 16/10/2026. Auditor independente solicitado: GPT-6.1 Sol, raciocínio alto.

**Veredicto: CONFORME.** A OS-12 delimita as duas correções autorizadas, conserva os controles existentes e define aceites verificáveis antes da retomada. Nenhum achado obrigatório de contrato foi identificado. Este parecer aprova a ordem para execução dentro desses limites; **não aprova um novo hash de C ainda inexistente nem libera sua aplicação agora**.

## Versão e material conferidos

- Ordem auditada: `ordens/12-correcoes-autorizadas.md`, SHA-256 `c091e760216f0f32213d47eb6c931bf39281b4ed234ef22168407acbd767de6f`.
- Baseline: main / `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`, com alterações preexistentes; snapshot `/tmp/bizuminer-finalizacao/os-12/baseline.json`, SHA-256 `546671d4855ea70cc9b5396fcfd912f53b4c5cdb6e5fb7b7d1b6d7eef5acae08`.
- Lidos CF-01, OS-05/06/07/09 e resultados OS-02/05, além da OS-12 e da referência de achados da skill. A autorização humana específica para ambas as correções, testes e novo parecer foi comunicada pelo executor; não se deduz autorização de silêncio.
- Conferi novamente os bytes locais: A `33e03729f9e058169844fc353cba083cb3d5fe270b98ea890dafd0fb0a87c40c`, B `02810325f1eecc16dfc05121f44b75a64c5ce0655b9329f2662ffb0d74cbecaa`, C antiga `1114987e4108745492af6c3457ec6850a999ed16be79d815d001c4b156669a21`, manifesto anterior `dafa91ab8231fa0ebed32152412586100ec3c499dfa52f5703bf1d50493ab7eb` e catálogo `26a510294648b9dd42e031ac7352fe5858d6a8db7b465b50893355447d69a0b7`.

## Confronto com os diagnósticos e a autorização

| Tema | Avaliação do contrato |
|---|---|
| Correção SQL | AC-12.1 restringe a mudança de C a `COLLATE "C"` no ORDER BY do inventário de funções. Isso corrige o diagnóstico confirmado: conjunto de 26 assinaturas idêntico, mas array ordenado por en_US.UTF-8 diferente do literal C. Não exclui funções nem retira a comparação. |
| A/B e catálogo | A/B já instaladas permanecem intactas e não são reaplicadas. A ordem proíbe recaptura; geração completa ocorre em cópia isolada e exige provar invariantes antes de transportar os arquivos. No manifesto, somente os dois hashes da unidade C podem mudar. Histórico31, tar e demais fontes não são reescritos. |
| Prova de collation | AC-12.2 exige PostgreSQL descartável nas duas collations, inventário válido aceito e ausente/extra/sobrecarga rejeitados, com controle/policies intactos nas falhas. As suítes nativas de rollout e operação continuam exigidas. O executor confirmou disponibilidade local de en_US.utf8; a criação dos bancos e os resultados ainda são trabalho futuro, não evidência produzida por esta revisão. |
| Trigger legado | O diagnóstico anterior conferiu 58/58 triggers exigidos por C e o adicional legítimo product_seed_curation. A OS não o remove, não exige igualdade de contagem inexistente no SQL e não modifica o catálogo para incluí-lo artificialmente. |
| Manutenção Vercel | AC-12.3 exige confirmar projeto/equipe/configuração, configurar `ssoProtection.deploymentType=all` ainda pausado e ler de volta antes de unpause. A mudança é específica do projeto, sem proteção de equipe, contratação ou alteração Google OAuth. Resolve o bloqueio de build causado pela pausa sem autorizar publicação aberta durante o corte. |
| Hosts e autoassign | A ordem conserva autoassign false, exige reconferi-lo após unpause e antes de criar/push, e testa todos os hosts inventariados mais os novos. Visitante anônimo deve ser impedido de chegar à aplicação; acesso autenticado deve alcançar a versão reservada real. HTTP200 de página de espera não é aceite. Exposição indevida determina repause imediato. |
| Recuperação e retomada | Configuração anterior é preservada; proteção anterior só retorna na OS-09 após aceites. Falha mantém fechado. OS-05/06 precedem C; aplicação da C corrigida permanece na OS-07, inteira por MCP, após parecer por novo hash e preflight íntegro. OS-08/09 precedem abertura e OS-10 precede conclusão. Writers continuam suspensos. |
| Escopo de edição | Allowlist inclui gerador, C, manifesto, teste novo, delta e integração documental restrita. Os outros 460 arquivos do pacote permanecem iguais. Não permite editar runtime, lockfile, regras/grants/policies, backup ou recursos dos outros aplicativos para fazer passar. Checkout isolado não autoriza stage/commit no trabalho compartilhado. |

A interpretação de “somente hashes de C mudam no manifesto” é literal: outros campos, inclusive entradas A/B, fontes, ordem e metadados históricos, permanecem iguais. No catálogo de referência não há alteração. O teste novo deve consumir a guarda efetiva extraída dos bytes revisados, sem substituir a comparação por uma versão permissiva. Isso é a verificação do diagnóstico e do AC existente, não requisito adicional de produto.

A promoção da candidata já testada ao domínio canônico, necessária para exercitar o callback Google existente sem mudar OAuth, pertence à publicação OS-05: somente com proteção `all` comprovada em todos os hosts e writers ainda parados. Não constitui reabertura OS-09. A integração documental autorizada pela OS-12 deve deixar essa sequência e o novo hash inequívocos, preservando os registros supersedidos.

## Achados, limites e próxima decisão

Não há BUG de contrato a abrir nesta versão. As duas falhas já confirmadas permanecem abertas para entrega: canonicalização dependente de locale e mecanismo de pausa que impede build. A conformidade deste contrato não as declara corrigidas.

Nesta revisão executei somente leituras de arquivos e hashes. Não executei testes novos, consultas remotas, geração, edição de SQL/contratos, mudanças Vercel, deploy ou aplicação de migrations. As provas remotas anteriores da collation e dos triggers e os resultados OS-02/05 são referenciados como diagnósticos anteriores; não foram repetidos nesta etapa.

Após a execução: congelar bytes e delta, comparar o diff com AC-12.1, conferir resultados nas duas collations e nas suítes preservadas, configuração/hosts/autoassign e evidências da versão real. Só então emitir `12-auditoria-entrega.md` por hash exato. A aprovação condicional33 e os controles OS-06/07 continuam aplicáveis; nova rejeição automática não pode ser contornada por outro transporte.
