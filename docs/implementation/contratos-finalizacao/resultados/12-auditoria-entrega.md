# OS-12 — Auditoria de entrega

Modo: `entrega`, skill `auditor-red-team`. Data: 16/10/2026. Auditor independente solicitado: GPT-6.1 Sol, raciocínio alto. Escopo restrito às duas correções da OS-12, sem nova auditoria geral do aplicativo.

**Veredicto: CONFORME_COM_RESSALVAS documentais/operacionais abaixo. A correção SQL está CONFORME e a unidade C de SHA-256 `a08659287c10e2b7e3358bf6029bec75277cc0ca0ce07655d7e9f70acef92597` fica TECNICAMENTE APROVADA PARA APLICAÇÃO POSTERIOR INTEIRA NA OS-07, exclusivamente no projeto `spbuwcwmxlycchuwhfir`, após OS-06 concluída, backup/manutenção válidos e preflight remoto íntegro. Este parecer não libera aplicação agora nem substitui esses aceites.**

Não há defeito obrigatório identificado no diff SQL. A C anterior `1114987e…` permanece supersedida e não deve ser aplicada. A/B já instaladas não precisam mudar nem ser reaplicadas.

## Versão concreta e preservação

Referência: OS-12 auditada no parecer de contrato, SHA `c091e760216f0f32213d47eb6c931bf39281b4ed234ef22168407acbd767de6f`, baseline main `43700c59f4e24f68f3a2e32c20ee5147fa4816cd` com alterações preexistentes. Comparei os arquivos atuais com `/tmp/bizuminer-finalizacao/os-12/before/` e com a cópia de testes `/tmp/bizuminer-finalizacao/os-12/source/`.

| Artefato congelado | SHA-256 conferido |
|---|---|
| C corrigida | `a08659287c10e2b7e3358bf6029bec75277cc0ca0ce07655d7e9f70acef92597` |
| Manifesto corrigido | `3c8af38ce344ef3ad8030b07a58e2503f567ab964e8842bb592290421c886081` |
| Gerador corrigido | `3f22cd094b8c1a8e606079d8ba5ab08cae95c9d4c091c65cd513878495ced255` |
| Teste novo de collation | `f901bc57f2003825e57e3f1a505bd1340064d7a674d8b3d6677a23e63a37b014` |
| Envelope manual de C, BEGIN/COMMIT exatos do manifesto | `a302de9d3d656bce934815326aa92a1213d3e845ffceb24924098230b9572581` |

Conferi que C inteira é exatamente o arquivo anterior com uma única substituição na linha31: `order by p.oid::regprocedure::text` passa a `order by p.oid::regprocedure::text COLLATE "C"`. Literal esperado, contagem/assinaturas, definições, grants, policies, dados e demais guardas não mudaram. O gerador muda somente a linha correspondente.

O diff textual do manifesto contém somente `sha256` e `manualTransactionSha256` da unidade C. O catálogo permanece `26a510294648b9dd42e031ac7352fe5858d6a8db7b465b50893355447d69a0b7`; A permanece `33e03729f9e058169844fc353cba083cb3d5fe270b98ea890dafd0fb0a87c40c`; B permanece `02810325f1eecc16dfc05121f44b75a64c5ce0655b9329f2662ffb0d74cbecaa`. Conferi os outros 460 arquivos do pacote31 tanto no workspace como na cópia isolada: nenhum hash diferente ou arquivo ausente. O delta está registrado em [os12-delta-fontes.json](../../evidencias/os12-delta-fontes.json). Não houve necessidade de recapturar catálogo.

## Verificações e evidências

| Aceite | Evidência e conclusão |
|---|---|
| AC-12.1 | Diff estrito acima, hashes/envelope calculados pelo auditor, igualdade com cópia isolada e verificador executado pelo auditor: PASS. O executor informa reprodução por `--seal` em cópia isolada; conferi os produtos e seus bytes, sem repetir a geração nesta auditoria. |
| AC-12.2 | Li o teste novo e `/tmp/bizuminer-finalizacao/os-12/checks.json` e check-0 a check-3.log: quatro comandos exit0. São 10 cenários em PostgreSQL17.11 descartável, bancos C e en_US.UTF-8; inventário válido aceito e ausente/extra/sobrecarga rejeitados, com gate/policy preservados. A guarda antiga passa em C e reproduz a falha em en_US. As suítes de rollout e operação registram respectivamente 33 e 21 checks PASS. São execuções do executor; não foram repetidas integralmente pelo auditor sem nova alteração ou falha. |
| Prova independente no alvo | Executei somente SELECT da comparação extraída da guarda corrigida: às19:53:05UTC, `collation=en_US.UTF-8`, `corrected_guard_matches=true`, `gate=false`. Não executei DO, C, DDL ou DML. A comparação antiga já havia sido demonstrada falsa no diagnóstico anterior. Este SELECT valida o reparo do inventário, não certifica sozinho todas as guardas ou a integração do aplicativo. |
| AC-12.3, proteção atual | Registros vercel-before.json e vercel-protected.json identificam o projeto correto: antes paused=true/all_except_custom_domains/autoassign=false; depois paused=false/all/autoassign=false. O executor confirma leitura de all ainda pausado antes de unpause. O snapshot intermediário all+paused não está nesses dois arquivos; distingo a confirmação do executor da evidência de estado final conferida. |
| Hosts | protection-probes.json e entrypoints.json cobrem os25hosts inventariados:24retornam302 para vercel.com. O alias antigo web-git-agent-hero-responsivo-links retorna410, classificado GONE em protection-confirmed.json. Esse endereço retirado não expõe a aplicação e não é evidência de falha do fechamento; tampouco se afirma que ele redirecionou por SSO. O booleano closed=false bruto desse probe não deve ser convertido em alegação de aplicação pública. |

O teste de collation cria funções sintéticas com as assinaturas do catálogo e executa a guarda real extraída de C. Ele prova a semântica de inventário/canonicalização; não substitui o teste de corpos completos, RLS e transição da suíte de rollout nem os smokes gerenciados OS-06/08. Não foram alterados os testes preexistentes para fazê-los passar.

## Achados e limites de fechamento

| Referência | Classificação | Estado desta entrega | Próximo responsável/aceite |
|---|---|---|---|
| Diagnóstico SQL OS-05/12: inventário dependente de collation | `implementacao` | `verificado`: correção mínima, contraprovas e SELECT real positivos | Executor mantém novo hash exato na OS-07, depois de OS-06; nenhuma alteração adicional autorizada por este parecer. |
| Diagnóstico manutenção OS-05/12: pausa impede build | `contrato` / integração preexistente | Mecanismo substituto all com entradas fechadas conferido; publicação reservada real ainda pertence à OS-05/06 | Executor comprova build/candidata, acesso autenticado real e novos hosts; não reutiliza BLOCKED/Deployment is building como PASS. |

As seguintes ressalvas não são novos defeitos de C nem impedem retomar OS-05, mas impedem declarar toda implantação concluída:

- No momento desta leitura, os resultados exclusivos `12-correcoes-autorizadas.md/json` ainda não existiam. O executor deve consolidar neles os estados antes/depois, a sequência de proteção antes de unpause, logs e delta, preservando seus registros. Há evidências temporárias concretas, mas o parecer do auditor não substitui o resultado operacional do executor ou sua integração documental autorizada.
- A evidência conferida cobre os hosts inventariados; qualquer novo deployment/alias deve ser testado antes de ser usado, mantendo all e autoassign=false. A nova candidata deve ser acessível autenticadamente como BizuMiner pronto; isso ainda será verificado na OS-05/06. Promoção canônica sob all não é reabertura pública.
- OS-06/login Google/consumidores compatíveis/backup vigente não são declarados concluídos por esta auditoria. C só pode seguir quando esses resultados estiverem aprovados e o estado remoto for reconferido. Restauração da proteção anterior e writers continuam dependentes de OS-08/09.

Não foram reabertos requisitos do aplicativo, inventados novos requisitos comerciais ou imposto staging. Não houve escrita remota pelo auditor, alteração de código/SQL/contrato/teste ou deploy. O único arquivo escrito nesta etapa é este parecer. A avaliação automática permanece aplicável; uma rejeição não autoriza contorno por outro transporte. Falha de preflight após este parecer continua sendo parada, não licença para alterar novamente o catálogo ou os bytes.
