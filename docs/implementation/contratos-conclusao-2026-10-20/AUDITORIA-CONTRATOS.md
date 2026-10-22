# Auditoria independente dos contratos de conclusão — 20/10/2026

**Modo:** contrato, skill `auditor-red-team`. **Veredicto:** `CONFORME_COM_RESSALVAS`. A cobertura do levantamento é suficiente e não há autorização remota implícita. Existe uma ressalva de sequência em OS-042/047: resolver REV-CON-01 antes da execução multicliente quando for necessário criar a segunda conta. A ressalva não bloqueia OS-029/030 nem a homologação delimitada da conta própria.

## Versão e limites

Baseline `main`, HEAD `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`, mais working tree extenso preexistente. Snapshot documental fixado pelos vinte hashes abaixo; a auditoria não atribui o diff inteiro à elaboração desses contratos. Fonte de escopo: [levantamento de 20/10](../diagnosticos/estado-atual-2026-10-20/DIAGNOSTICO.md). Os pareceres/resultados históricos não foram modificados.

Leitura independente dos contratos, status introdutórios e serviços/testes locais relevantes. Foram conferidos os scripts de `tools/editorial-tests/package.json`, os quatro pacotes, a fixture PostgreSQL nativa, o serviço de kits e seu caller, governança/calibração/rubrica, experimentos, CLI/worker de dispatch, monitoramento, relatório financeiro e a migration OS-037. Foram lidas também as skills Supabase/Postgres pertinentes; nenhuma API ou SQL remoto foi executado. Não houve pesquisa de provedor ou reexecução de testes de runtime nesta revisão documental. Arquivo de teste futuro é avaliado como entrega autorizada, nunca como prova existente.

Única escrita desta auditoria: este parecer. Não foram alterados código, testes, migrations, contratos ou critérios de aceite. Nenhuma implantação, promoção, mensagem, convite ou commit foi realizado.

## Cobertura e viabilidade conferidas

| Achado ou frente do levantamento | Contratos | Conclusão documental |
|---|---|---|
| Bancada ausente, timestamps, paginação e isolamento | OS-029 | Escopo/arquivos/aceites preservados; ausência de data defensável exige fronteira, sem timestamp inventado |
| BUG-014, BUG-015, BUG-016 e interação autenticada pendente | OS-030/031 | Callers reais e validação no servidor delimitados; kit action já encaminha opportunityId; compatibilidade de oportunidade é lacuna explicitamente coberta |
| Ressalvas ambientais e captura humana nativa | OS-033 | Reutilização de provas exige identidade do snapshot; cópia isolada preserva evidências históricas |
| Concorrência/ordem de commit do gate comparativo v3 | OS-038 | Sessões/roles/barreiras e contraexemplos concretos; prova local não certifica pooler gerenciado |
| Candidata, writers, deploy e migration ainda sem instalação comprovada | OS-039/040 | Manifesto/alvo/backup/revisão e autorização próprios; migration única auditada, sem replay da pasta histórica |
| E3, rubrica e audiência reais | OS-041 | Método/amostra/ator e comandos existentes; resultado negativo e permanência em sombra são válidos |
| Credenciais, captura, Auth/pooler, extensão/dispositivos | OS-042 | Serviços/CLI existentes e limites reais; preserva ML exclusivamente humano; ressalva REV-CON-01 |
| Storage, direitos, formatos, QR, kit, exportação e atribuição | OS-043 | Gates por operação/destino; copiar/exportar não confirma publicação; acesso externo condicionado |
| Relatórios reais, parser e ledger | OS-044 | Expectativa externa ao parser, arquivo privado e rede individual; incompatibilidade encaminhada, sem patch genérico |
| Canal oficial e envio único | OS-045 | CLI e worker reais; inspeção sanitizada, aprovação, kill switch, unknown e reconciliação explícitos |
| Experimento com método anterior e promoção humana | OS-046 | Serviços pareados existentes; sem denominador não fabrica taxa; não exige resultado favorável |
| Piloto/termos/privacidade/quotas e utilidade real | OS-047 | Sem preço, cliente ou cobrança inventados; ressalva de preparação/liberação REV-CON-01 |
| OBS-ESTADO-01, estado final e limitações por requisito | Atualizações introdutórias e OS-048 | Histórico mantido, BUG-021 fechado apenas localmente, capacidade parcial não vira Blueprint integral |

Não se duplicaram parser, resolver, adapters ou correções anteriores resolvidas. A separação OS-033/038/031 corresponde a propriedades diferentes: ambiente/captura humana, concorrência comparativa e jornada transversal. A preparação de contratos condicionais é válida sem obter agora cliente, canal, relatório ou decisão editorial.

A verificação local de links relativos dos dezessete documentos contratuais encontrou **zero destino ausente**. A migration OS-037 tem SHA-256 `44f03a13ab420c94bdfc5456b72ff84322a4c5ddc9978842e096c7fc5b37b4a4`, igual ao hash citado na OS-040. Não se confunde essa identidade com instalação remota.

## Achado delimitado

| ID | Tipo | Estado | Responsável | Tentativas |
|---|---|---|---|---|
| REV-CON-01 | contrato | confirmado | arquiteto | 0 |

**Requisito:** sequência executável das capacidades, dependências explícitas e ausência de paralisação artificial, conforme plano comum; duas contas legítimas para a homologação multicliente, sem liberar capacidade ainda não homologada.

**Cenário:** há somente a conta própria. Um participante e sua preparação estão nominalmente autorizados, com as demais entradas presentes, e o piloto inclui captura por conta. OS-042 precisa da segunda conta para demonstrar o isolamento e remete sua criação à OS-047/autorização própria. A dependência global da OS-047 em homologação aplicável da OS-042 pode, em leitura estrita, impedir o próprio provisionamento necessário para fazer essa homologação. Isso não comprova defeito no código nem autoriza criar conta sem consentimento.

**Evidência:** [OS-042](OS-042.md), linhas 3 e 11, exige contas/identidades para prova multicliente; linha 23 remete criação externa à OS-047/autorização própria. [OS-047](OS-047.md), linha 3, vincula suas dependências a OS-042/043/045; os AC-047.1/.2 (linhas 15–16) contêm preparação de conta/plano/convite/aceite, enquanto AC-047.4/.5 (linhas 18–19) contêm o uso liberado e os marcos reais. O plano prefere 042 antes de 047 sem explicitar a exceção de preparação. O fallback de homologar apenas conta própria da OS-042 qualifica o alcance, mas não fecha a prova multicliente desse cenário.

**Correção mínima:** no plano e referências OS-042/047, separar o gate da preparação inicial nominalmente autorizada de identidade/conta/plano/convite/aceite do gate de liberação das capacidades e dos marcos do piloto. Permitir a preparação necessária de B antes da OS-042 quando B ainda não existir; executar homologação 042/043/045 aplicável antes de liberar seu uso ao participante. Manter decisões de termos/consentimento/plano/destino e autorização específica, sem nova OS, novo fluxo de produto ou habilitação antecipada.

**Critério de fechamento:** leitura da sequência deve admitir, com autorização específica e entradas presentes, `preparar B → homologar isolamento/capacidades → liberar capacidades do piloto`, preservando o ramo com B já existente e o ramo somente conta própria. Ausência de participante/autorização continua bloqueio comercial legítimo. Contraprova documental restrita aos documentos alterados e seus novos hashes; não pede execução remota ou implementação.

## Snapshot auditado

| Documento relativo a docs/implementation | SHA-256 |
|---|---|
| `contratos-conclusao-2026-10-20/PLANO-ENTREGAS.md` | `cef01872f343b294fdff84957d0c204c23dd3b2f28b706aae007b0606798737b` |
| `contratos-conclusao-2026-10-20/OS-038.md` | `472576ff8a928c4c691f7e4a9cbd753d579b21aaa9e7ade5b88670f33436827d` |
| `contratos-conclusao-2026-10-20/OS-039.md` | `038b10b887c545c8fea43ea3d57d1eafccb324f13a94e186269ac26fd8217faf` |
| `contratos-conclusao-2026-10-20/OS-040.md` | `d93974dc11e42996bcc537ea7439ba1251ceaf23a7aa59c4b0142e28eead4116` |
| `contratos-conclusao-2026-10-20/OS-041.md` | `67716b0aac72234a3da44c4ba0315d1691ad1949828e963b425e35f615673f96` |
| `contratos-conclusao-2026-10-20/OS-042.md` | `56b1082e05e5dad797a4d8166629619b009e22dd2fa47aed8f8593d015b05c1b` |
| `contratos-conclusao-2026-10-20/OS-043.md` | `87594a1c6151c92ca1e6f7d69911ce2b9f85ff84ce9d4f979ef10dd5141b8874` |
| `contratos-conclusao-2026-10-20/OS-044.md` | `3dfa39ba3ccc277898994eb9576175c5a025e74755c5e076dd49402aeeec5621` |
| `contratos-conclusao-2026-10-20/OS-045.md` | `64d5a03b7b1a0eb3950e592f93d5a635b01e149adc566660f324f0116b83bd17` |
| `contratos-conclusao-2026-10-20/OS-046.md` | `337a8a05c80ef51e7e2d4568558a1673d5736c05ebddedd6027e51bc159298aa` |
| `contratos-conclusao-2026-10-20/OS-047.md` | `170c4e3b583a35408ee6b3e41be00518b793ca7eb3ff4e578452105028b01f09` |
| `contratos-conclusao-2026-10-20/OS-048.md` | `edc17c85f99b552905dc27dc8ff286c63c272e7660945e0c56b09ba734bb8a47` |
| `contratos-fluxo-unico/OS-029.md` | `ed70f506cbbd002b39f05fde47deed705dc5b25cfda855abe214ceb64646fbbb` |
| `contratos-fluxo-unico/OS-030.md` | `0b0ffe42748aabb8f2edda66a8beed23d7babf70878265c7bfca371416ccc347` |
| `contratos-fluxo-unico/OS-031.md` | `6382b2cecd4af3799281e63934b8b97a966d1ca4648d48387b0994a0a75d36a7` |
| `contratos-fluxo-unico/OS-033.md` | `f7eabb431b8bdb28c71e75fa82b57c773d41f369be27a90eed5f101f6d822d13` |
| `contratos-fluxo-unico/PLANO-ENTREGAS.md` | `e2447abbd2cee917fa96649d77dcc3c76ab986ddeb4c7f164a041a8aec10e142` |
| `STATUS-EXECUCAO.md` | `7439ef1923b8e31f291cb61c981aaf0cfa6e03e6542dea43ef0bc83c60f568e9` |
| `README.md` | `95057dfd3567332d9d82a7b568a28efeaea848de7aa5b406560403edeb27afd8` |
| `07-PRONTIDAO-E-DECISOES.md` | `470f014687ad513f73aa56c1e32f288d81387ca1cee8c8b895ddf9e10726ed38` |

Este parecer é de contrato e não homologa a implementação ou o ambiente ativo. Uma revisão posterior deve preservar este snapshot e registrar o fechamento de REV-CON-01 em adendo identificável.

## Adendo 1 — contraprova documental de REV-CON-01

20/10/2026. Revisão solicitada após a emenda do arquiteto. **Veredicto vigente: `CONFORME`, modo contrato. REV-CON-01: `verificado` e fechado.** A restrição específica de sequência do parecer inicial deixa de existir nos quatro documentos abaixo. Os gates de entrada, autorização e homologação por capacidade continuam vigentes; conformidade documental não concede execução ou operação remota.

O parecer inicial foi preservado integralmente como prefixo deste arquivo. SHA-256 desse prefixo antes do adendo: `9e7a945e45446e24deb7ec0d8c4bca77c66ec1ef52ed6233df4375b04a891cbc`. Os hashes da primeira revisão identificam seu snapshot histórico; os quatro hashes abaixo identificam as emendas ora verificadas.

**Escopo restrito:** leitura de `PLANO-ENTREGAS.md`, `OS-042.md`, `OS-047.md`, `OS-039.md` e conferência da existência de seus links relativos. Não houve nova auditoria geral, teste de runtime, leitura de produção, implementação ou alteração contratual pelo auditor. Os quatro documentos têm zero destino relativo ausente.

**Contraprova de REV-CON-01:** o plano e OS-042 agora aceitam resultado parcial da etapa A da OS-047 quando B ainda não existir. A etapa A tem autorização/entradas próprias e não depende de 042/043/045. A etapa B exige previamente as provas aplicáveis para liberar capacidades ao participante. Portanto a sequência explícita é `preparar B → homologar isolamento/capacidades → liberar piloto`, sem ciclo. B existente é reaproveitada; somente conta própria sem autorização adicional continua alcance limitado, sem cliente inventado.

A emenda também distingue preparo operacional de estado técnico: não presume conta/plano pendentes ou suspensão automática. Exige contenção por identidades autorizadas de homologação, convite do participante ainda não entregue/aceito, segredos/destinos e automação limitados ao ensaio e kill switch aplicável. Se a contenção não for possível, determina parada antes do acesso/aceite e fronteira explícita. Isso atende a correção mínima sem criar flag, novo fluxo de produto ou habilitação antecipada. Participação real na própria homologação depende de autorização específica.

**Clarificação AC-039.2:** permanece obrigatória a prova completa da candidata, admitindo reaproveitamento apenas com mesmos hashes de fontes/dependências, Node/configuração relevante e logs completos preservados. Drift, falha ou prova ausente exigem repetição da parte afetada. Cópia isolada e proteção da evidência histórica permanecem. A emenda evita repetição sem perda da atribuibilidade da verificação; não apareceu achado obrigatório no delta.

| Documento da contraprova | SHA-256 vigente |
|---|---|
| `PLANO-ENTREGAS.md` | `a27e77d220ed595f0c42d66c39a331e7331adccb83a9b67649318b0ae1c7e4bc` |
| `OS-042.md` | `1b5e137e26c17066c60ff29b20ec38a54cbae1e5a35ffe4520b389a3879fc136` |
| `OS-047.md` | `d2b877f9eba38e6164d8759a0fd8dfed71a65d5927fd8455eb76f7f6e3fe2119` |
| `OS-039.md` | `874802ff7bb4538debba80b7592f6f5dcf5a64993603b27c33b0013adf13d86a` |

Única escrita da contraprova: este adendo. Os demais limites e conclusões do parecer inicial permanecem aplicáveis ao snapshot correspondente.
