# BizuMiner — planejamento integral do Blueprint V2

## Atualização de 20/10/2026 — continuidade da implementação

Referência vigente: [levantamento](diagnosticos/estado-atual-2026-10-20/DIAGNOSTICO.md) e [contratos de conclusão](contratos-conclusao-2026-10-20/PLANO-ENTREGAS.md). Núcleo implantado conforme fechamento de 16/10; correções posteriores estão comprovadas no escopo local. BUG-021 fechado localmente pela OS-037; próxima implementação é OS-029, seguida da bancada/navegação OS-030 e verificação OS-033/038/031. As OS-039–048 cobrem candidata, implantação, homologação comercial por capacidade e fechamento documental, com suas dependências e gates. Esta rodada elaborou contratos; não implementou ou publicou essas entregas.

Os registros abaixo conservam o estado e os limites nas respectivas datas; alegações históricas de software ausente ou staging obrigatório não substituem o levantamento atual. A matriz de prontidão de specs não é prova de implementação/homologação.

## Atualização operacional de16/10/2026 — OS10

**Implantação do núcleo concluída; Blueprint integral ainda parcial.** [Fechamento e alcance](contratos-finalizacao/resultados/10-fechamento.md), [matriz por requisito/épico](contratos-finalizacao/resultados/10-fechamento.json), [integração](contratos-finalizacao/resultados/08-integracao.md) e [retomada](contratos-finalizacao/resultados/09-retomada.md).

C aprovada12 foi aplicada após autorização específica do proprietário: histórico20261016223906, hash a0865928…f92597. A/B previamente aplicadas foram preservadas. Produção é dpl_EwDxnLU8t7BLFrNFVjsnxbWQVuhp / commit f60b6187ada88addd37ff5b967f1d0f2e8eca2b9. Controle comercial true;28 policies legadas substituídas; dados originais íntegros, com deltas legítimos de monitoramento documentados.

Site público reaberto sob proteção original all_except_custom_domains; /admin exige login. Monitor-prices retomado, primeiro run38977824431 success nos dois jobs/mesmo SHA, com17 observações reais AliExpress. Capture-offers/dispositivos não homologados permanecem parados. Backup pré-C atualizado/restaurado e persistente no diretório privado já autorizado; nenhuma credencial no Git.

Concluído significa o núcleo da conta própria descrito nos resultados. Não conclui calibração/comparabilidade E3, rubrica promovida, material/Storage/kit real, parser específico, credenciais de coleta por conta, envio oficial, experimentos com método ou piloto SaaS. [Entradas e trabalho restantes](contratos-finalizacao/CAPACIDADES-PENDENTES.md). A confirmação visual pósC por automação não foi repetida (timeout CUA); provas reais de login/UI06, runtime/HTTP/consumidores/provedor08–09 têm seus limites explícitos. Não se afirma homologação integral comercial.

Estado atual é o fechamento10. As alegações31 abaixo são históricas; o roteiro36 e os resultados06–10 registram a execução real.

---

## Registro anterior preservado — não representa o estado atual


**Estado atual — rodada31:** correção local de privilégios após reconciliação real Supabase, candidata A/B/C novamente selada e testada. Supabase e Vercel MCP/CLI estão acessíveis; produção identificada no commit43700c59, ainda sem os reparos locais. Passaram 39 verificações/aplicações nativas, 21 operacionais, 21 suítes SQL, 379 testes web, testes/typechecks dos quatro pacotes e buildNode24. Pacote de fontes preparado, sem deploy ou nova migration remota.

Ver [resultado31 e impedimentos](31-RECONCILIACAO-E-PACOTE-DE-HOMOLOGACAO.md), [parecer31](31-AUDITORIA-INDEPENDENTE-RECONCILIACAO.md), [guia A/B/C](../../packages/persistence/supabase/rollouts/v2/README.md) e [status](STATUS-EXECUCAO.md). Falta disponibilizar staging isolado: o servidor exige confirmação de custo com ferramentas que não estão expostas. Auth/Storage/pooler, recuperação e matriz com deployments/writers precedem aprovação técnica de produção. Os relatórios27/28 e seus impedimentos de acesso são históricos. O [plano24](24-CAMINHO-SEGURO-PARA-CONCLUSAO.md) e a [aderência25](25-ADERENCIA-AO-PLANO-ORIGINAL.md) seguem normativos; não executar a pasta antiga por db push.

O [plano 17](17-PLANO-SEQUENCIAL-DE-CORRECAO-CF01-CF18.md) orientou os reparos; as [conferências 16](16-CONFERENCIA-D00-D14-PONTOS-A-CORRIGIR.md) e [18](18-VERIFICACAO-DAS-CORRECOES-CF01-CF18.md) documentam defeitos históricos, sem ser reescritas como se fossem resultados atuais.

**Planejamento estrutural concluído e auditado em 14/10/2026.** Treze specs, EP-00 a EP-12, preparadas para implementação incremental. Na etapa original de planejamento não houve implementação. A rodada posterior de execução e conferência alterou código e migrations locais; consulte o [status atual](STATUS-EXECUCAO.md) e o [relatório de implementação](12-RELATORIO-DE-IMPLEMENTACAO-E-CONFERENCIA.md). As modificações locais anteriores foram preservadas. Para o estado mais recente, o relatório31 e o status prevalecem sobre as alegações anteriores.

**Prontidão das specs:** 4 PRONTAS, 7 CONDICIONAIS, 2 BLOQUEADAS. Prontidão documental não significa implementação concluída, produção validada ou SaaS liberado. Os bloqueios são explícitos e não substituídos por suposições.

**Revisão pré-implementação:** [parecer de viabilidade](09-REVISAO-DE-VIABILIDADE.md), 14/10/2026. O plano é tecnicamente plausível e alinhado aos dois negócios, com execução condicionada por entrega. A revisão corrigiu sequência, dependências e contratos; não comprova rentabilidade, capacidade de produção ou segurança já implantada.

## Ordem de leitura

1. [Reconciliação e evidências reais](01-RECONCILIACAO.md): código, banco, auditorias, testes e divergências.
2. [Arquitetura global](02-ARQUITETURA-GLOBAL.md): decisões, fronteiras, sequência e ownership de componentes.
3. [Contratos compartilhados](03-CONTRATOS-COMPARTILHADOS.md): identidade, evidência, oportunidade, kit, postagem, links, financeiro e jobs.
4. [Evolução de dados e migrations](04-EVOLUCAO-E-MIGRATIONS.md): ordem, preflight, compatibilidade e recuperação.
5. [Verificação integral](05-VERIFICACAO-INTEGRAL.md): 18 casos do blueprint, suítes adicionais e comandos reais.
6. [Auditoria cruzada](06-AUDITORIA-CRUZADA.md): conflitos encontrados e corrigidos no conjunto.
7. [Prontidão, gates e critérios de entrada/saída](07-PRONTIDAO-E-DECISOES.md): índice de execução e impedimentos.
8. [Rastreabilidade](08-RASTREABILIDADE.md): 62 requisitos explícitos, decisões, invariantes e experimentos.
9. [Viabilidade e próxima rodada](09-REVISAO-DE-VIABILIDADE.md): aderência ao objetivo, riscos de execução, correções e marcos de valor.

## Specs

| Épico | Resultado | Status da spec |
|---|---|---|
| [EP-00](epicos/EP-00.md) | Pré-voo e reconciliação | PRONTA |
| [EP-01](epicos/EP-01.md) | Histórico comparável e claims seguros | CONDICIONAL |
| [EP-02](epicos/EP-02.md) | Rubrica de qualidade/valor e sombra | CONDICIONAL |
| [EP-03](epicos/EP-03.md) | Oportunidade contextual e radar | CONDICIONAL |
| [EP-04](epicos/EP-04.md) | Campanha, kit e publicação social | PRONTA |
| [EP-05](epicos/EP-05.md) | Cockpit Pauta/Radar/Resultados | PRONTA |
| [EP-06](epicos/EP-06.md) | Geração, aprovação e invalidação do kit | CONDICIONAL |
| [EP-07](epicos/EP-07.md) | Divulgação assistida e atribuição | CONDICIONAL |
| [EP-08](epicos/EP-08.md) | Venda, comissão, importação e economia | CONDICIONAL |
| [EP-09](epicos/EP-09.md) | Métricas e experimentos | CONDICIONAL |
| [EP-10](epicos/EP-10.md) | Contexto/isolamento inicial e auditoria final | PRONTA |
| [EP-11](epicos/EP-11.md) | Automação autorizada por canal | BLOQUEADA |
| [EP-12](epicos/EP-12.md) | Onboarding e piloto SaaS | BLOQUEADA |

Tronco recomendado: **00 → 01-0 → 10A → 01 A/B/C → 02 → 03 → 04 → 05/06 → 07 → 10B → 12**, conforme gates. Antecipar **08-A/C manual após 04**; parser 08-B depende do relatório real. **09** segue os resultados disponíveis e **11** depende de canal autorizado; nenhum é pré-requisito do piloto assistido. Receita SaaS/financeiro prometidos no piloto exigem a parte correspondente de 08. O [índice por dependências](07-PRONTIDAO-E-DECISOES.md) define entradas e saídas. Entregas parciais não criam novos épicos: continuam 13 specs.

As specs são separadas, mas incorporam os contratos e protocolos compartilhados desta pasta. Enviar ao executor a spec escolhida **junto destes documentos**, não apenas um trecho isolado.

## Descobertas do baseline de planejamento (históricas)

- Zero variantKeys confirmados, mas a view de curadoria retorna **297 lowest_verified verdadeiros** sem verificar variante; outros consumidores também mantêm fórmulas antigas. A correção precisa ser transversal.
- Gerador de Story **existe**; renderização em produção e direitos das imagens ainda exigem verificação.
- **739/1.657 produtos** têm menos de três observações, incluindo 313 sem nenhuma; o percentual de 78% da auditoria não foi reproduzido.
- Helper de tenant não abre a transação prometida; policies permanecem permissivas. Cliente externo depende de EP-10, não apenas da presença de tenant_id/RLS enabled.
- Dois testes web falharam no baseline; captura, persistência e extensão passaram. Não houve aplicação de migrations, inclusive em fixture.

## Evidências preservadas

[Blueprint original, sem edição](BLUEPRINT-MESTRE-BIZUMINER-V2-fonte.md), [schema observado](evidencias/schema-observado.json), [policies/view/constraints](evidencias/policies-view-constraints.json), [histórico remoto filtrado](evidencias/migrations-remotas-garimpa.json), [consultas somente leitura](evidencias/consultas-leitura.sql), [resultados agregados](evidencias/resultados-leitura.json), [estado inicial do working tree](evidencias/worktree-inicial.txt) e logs dos quatro pacotes em `evidencias/`.

A fonte anexada recomenda planejamento por épico; o pedido atual de planejamento integral prevalece. A estratégia comercial permanece intacta: operação própria e SaaS são negócios complementares e permanentes sobre o mesmo motor.
