# Revalidação da rodada corretiva RX-01 a RX-08

Data: 14/10/2026. Modo: diagnóstico pela skill codex-investigador; nenhuma correção funcional. Esta revisão complementa a investigação 10 e preserva seus registros históricos. Não altera STATUS-EXECUCAO como se o relato do executor tivesse sido ratificado.

## 1. Problema e reprodução

**Esperado:** o fechamento integral dos RX exige mais que compilação: jornadas integradas, isolamento como role runtime e uma verificação que não aprove capacidades não exercitadas. **Relato recebido:** todos os RX solucionados, 443 testes passando, onze migrations reconciliadas, restando gates operacionais. [Texto recebido preservado](evidencias/relato-executor-rodada-corretiva.txt).

**Observado:** houve correções reais, mas continuam falhas de integração e isolamento, além de evidências classificadas incorretamente como E2E. O verificador novo produz aprovação sem consultar qualquer banco.

Alvo desta revisão: working tree local em `/home/many/Documentos/Projetos linux/Garimpa`, HEAD `43700c59f4e24f68f3a2e32c20ee5147fa4816cd`, com alterações anteriores e arquivos não rastreados. [Manifesto do estado revisado](evidencias/manifesto-revalidacao-corretiva.json). HEAD sozinho não identifica o código inspecionado. Deploy, staging e schema remoto atual não foram consultados; nenhuma migration foi aplicada nesta revalidação.

### Execuções realizadas

| Verificação | Resultado observado | Evidência |
|---|---|---|
| `npm run typecheck --prefix packages/web -- --incremental false` | Exit 0; os cinco erros anteriores não se reproduziram | [Log web](evidencias/revalidacao-corretiva-0.log) |
| `npm run typecheck --prefix packages/persistence -- --incremental false` | Exit 0 | [Log persistence](evidencias/revalidacao-corretiva-1.log) |
| Quatro arquivos: affiliate-secret, e2e-commercial-flow, price-evidence e security-isolation-matrix | Runner reportou 4 arquivos aprovados, zero falhas; DATABASE_URL/NODE_OPTIONS removidas só do processo filho | [Comando e log](evidencias/revalidacao-corretiva-3.log) |
| CLI verify-remote-compatibility sem DATABASE_URL, sem env-file | Exit 0, Target none, Status Geral APROVADO, apenas WARN de conexão ausente | [Reprodução do falso positivo](evidencias/revalidacao-corretiva-2.log) |

Cada comando acima foi executado uma vez nesta rodada. Não se extrapola o resultado dos quatro arquivos para os 443 testes declarados, nem para browser, PostgreSQL, Storage ou workers. Não houve execução de migrations, build ou chamadas comerciais reais.

## 2. Evidências e cadeias causais remanescentes

### RC-01 — Isolamento ainda incompleto (RX-03)

**Confirmado por inspeção; runtime SQL não executado.** M-10A2 agora remove *_app_access dentro do primeiro loop, o que corrige parte do achado. Entretanto, affiliate_membership e affiliate_marketplace_config estão fora desse loop; suas seções removem somente *_tenant_scope. As policies *_app_access dessas relações constam no baseline preservado. Também permanecem fora do inventário de substituição outras relações privadas, como extension_device e editorial_assessment.

Cadeia: schema com policy permissiva legada → migration não a remove nessa relação → coexistência com a scoped → isolamento não demonstrado. Usar a função resolve_actor_accounts no bootstrap é uma melhora real, mas não fecha as policies restantes. Não se afirma vazamento ocorrido em produção.

**Reparo/aceite:** inventário por tabela/role/comando, substituição das permissivas aplicáveis e ensaio real de A/B/casa, sem contexto, suspensão e concorrência, incluindo acessos legítimos. Referências: `packages/persistence/supabase/migrations/20261014101000_garimpa_tenant_rls_scoped.sql` e `evidencias/policies-view-constraints.json`.

### RC-02 — Novas ações de kit não estabelecem contexto SQL (RX-08/03)

**Confirmado por inspeção; efeito condicionado à aplicação das policies e role runtime, não executado no banco.** `packages/web/app/admin/marketing/kit-actions.ts:51`, `:95` e `:186` abrem db() e passam o handle diretamente aos serviços. Não usam sql.begin/withAccountDb/set_config. M-04:192 em diante exige garimpa.tenant_id para campanha, kit e link.

Cadeia: membership válida no servidor → SQL numa conexão sem contexto → policy nega a operação apesar da autenticação. Na criação do kit também há duas escritas sequenciais sem a transação exigida pelo contrato. `commerce-db.ts:186` abre conexão sem contexto no resolver público; não foi encontrada a projeção pública restrita planejada para esse caminho. Fechar RLS antes de integrar esses consumidores pode quebrar fluxos que deveriam continuar funcionando.

**Reparo/aceite:** serviços privados recebem handle transacional autorizado; leitura pública usa a fronteira mínima prevista em C-01; falha na segunda escrita não deixa kit parcial. Testar com garimpa_app, sem contornar o problema com policy ampla ou role administrativa.

### RC-03 — “E2E” e jornada completa continuam sem prova (RX-06/08)

**Escopo dos testes confirmado por inspeção; ausência global de outras entradas permanece provável.** O teste financeiro de `e2e-commercial-flow.test.mjs:124` apenas rejeita tenant divergente. createMockDb é definido, mas não usado para gravar uma conversão válida. O teste de link monta targetLocation dentro do próprio teste e não executa a rota. A matriz de segurança agora distingue a razão da recusa e inclui caso positivo, porém ambos vêm de mocks que retornam linhas conforme os argumentos, sem avaliar SQL/RLS.

As ações novas são avanço de integração, mas a busca em app/lib encontrou definições sem consumidores de UI para createCampaignAction, submitManualConversion e revalidateKitBeforeExportAction. O diretório admin/financeiro contém apenas actions.ts. kit-actions.ts não contém a aprovação humana persistida anunciada no relato. validateCommercialKitRevisionAction e revalidateKitBeforeExportAction usam evidência/direitos/preço atual fornecidos pelo cliente, sem recarregar a revisão e os fatos no servidor; isso não prova revalidação comercial confiável.

**Reparo/aceite:** localizar outra entrada real ou completá-la; snapshot/digest/evidência corrente vêm de fonte validada pelo servidor; persistir validação/aprovação e eventos; demonstrar UI→ação→banco→leitura→exportação→confirmação. Manter os testes unitários, classificando-os corretamente. EP-10B continua pendente de matriz real.

### RC-04 — E3 SQL ainda não verifica cobertura e gaps (RX-07)

**Confirmado por inspeção; fixture SQL não executada.** M-01 agora filtra status approved, janela e frescor: essas partes foram corrigidas. Contudo, maximumGapHours, minimumCoverageRatio e bucketHours aparecem no seed e não são usados na condição de lowest_verified. Comparação SQL ainda se concentra em variantKey/preço sem demonstrar todas as condições materiais de C-02.

Cadeia: política aprovada e contagem/dias suficientes, mas amostra esparsa → SQL não verifica lacuna/cobertura → pode emitir selo que o contrato proíbe. Threshold editorial não corrige predicado ausente.

**Reparo/aceite:** executar a mesma fixture em TS/SQL, incluindo amostra com contagem suficiente e cobertura insuficiente, gaps, variantes/condições distintas, janela e frescor. Manter E3 desligado até mecanismo completo e calibração aprovados. Referência: `20261014102000_garimpa_price_evidence_canonical.sql:55–105,121–129`.

### RC-05 — Verificador aprova ausência de verificação (RX-08)

**Confirmado em runtime local, uma tentativa.** Reprodução na pasta packages/persistence:

```bash
env -u DATABASE_URL -u NODE_OPTIONS node --experimental-strip-types bin/verify-remote-compatibility.ts
```

Resultado: APROVADO, Target none, exit 0. Causa direta: runCompatibilityAudit retorna passed:true quando não há URL; não há análise estática de schema nesse ramo, apesar da mensagem. Com URL, tabelas/colunas ausentes e falha ao consultar policies podem ser WARN e, sem FAIL, também produzir passed:true. Esse segundo conjunto de ramos foi inspecionado, não executado remotamente.

O script npm carrega `../web/.env.local`. Por isso não foi usado na reprodução: remover DATABASE_URL do shell não impediria que esse env-file a repusesse. O alvo deve ser explícito e comprovado antes de execução conectada. Não foram lidas nem exibidas credenciais.

**Reparo/aceite:** diferenciar descoberta/preflight de homologação; ausência de banco, objetos obrigatórios ou permissões necessárias resulta em não verificado/falha e não aprova release. Comprovar role/alvo e testes efetivos de contexto, em vez de apenas set_config isolado. Casos automatizados: URL ausente, objeto ausente, acesso insuficiente, schema incompatível e fixture completa.

### RC-06 — Atribuição se perde entre /bizu e /go (RX-02/08)

**Confirmado por inspeção; HTTP/browser não executados.** A assinatura do resolver de /p foi corrigida, mas `app/bizu/[slug]/page.tsx:63` lê somente direto; os CTAs em :114 e :121 geram `/go/${deal.slug}` sem c. `redirect-banner.tsx:46,69` também descarta c. A rota /go lê c e, quando ausente, segue o legado sem atribuição.

Cadeia: /p entrega /bizu?c=code → página não transporta o identificador → /go recebe requisição sem campanha → clique não demonstra a origem pretendida. Separadamente, `campaign-attribution.ts:58` compara slug apenas com `ml-` + external_id ou product.id; não cobre os prefixos públicos shp-/ali- existentes em marketplaces.ts nem o namespace externo planejado.

**Reparo/aceite:** resolver pela publicação e propriedade corretas; preservar c nos caminhos de saída pertinentes, sem cookie global que mistura abas. Testar /p→página renderizada→CTA/banner→/go→clique persistido com duas contas e lojas habilitadas; sem c preserva o legado. Um teste que só monta uma string de URL não cobre essa cadeia.

## 3. Conclusão e hipóteses

**Conclusão:** rodada parcialmente corrigida, ainda sem evidência para encerrar todos os RX ou declarar prontidão operacional integral.

| RX original | Resultado desta revalidação |
|---|---|
| RX-01 | Erros de assinatura corrigidos e Server Actions criadas; fluxo positivo/UI/banco não demonstrado |
| RX-02 | Erros de compilação corrigidos; resolução sob RLS e propagação de c continuam abertas |
| RX-03 | Bootstrap usa função prevista; remoção das policies e adoção de contexto ainda parciais |
| RX-04 | Fallback fixo removido e testes selecionados passam; causa original corrigida no código. Rotação persistida/worker real não certificada |
| RX-05 | Tipos text/GUC e FKs selecionadas corrigidos por inspeção; cadeia de onze migrations não ensaiada nesta revisão |
| RX-06 | Oráculo unitário melhorado; não constitui matriz real T17/J2 |
| RX-07 | Aprovação/janela/frescor corrigidos; cobertura/gaps pendentes |
| RX-08 | Actions, testes e CLI criados; jornada incompleta e CLI com falso positivo reproduzido |

| Hipótese | Evidência / experimento discriminante | Estado |
|---|---|---|
| Os cinco erros de compilação permanecem | Reexecutados os typechecks web/persistence | Descartada para o working tree revisado |
| Testes verdes demonstram escrita válida e jornada HTTP completa | Leitura dos testes: financeiro só rejeita; SQL mockado; rota não chamada | Não sustentada; cobertura insuficiente confirmada |
| O novo verificador pode aprovar sem alvo | Executado sem DATABASE_URL/env-file | Confirmada em runtime |
| Só falta calibrar E3 | Comparação dos predicados SQL com C-02 | Não sustentada; predicados ainda ausentes |

## 4. Correção recomendada — não executada

Fechar contexto/RLS e projeções públicas antes da ativação; implementar a jornada real com revalidação factual no servidor; corrigir transporte da atribuição; completar os predicados E3; tornar o verificador incapaz de aprovar uma checagem não realizada. Não reabrir os contratos do produto nem voltar a permissões amplas para fazer testes passarem.

Migrations devem ser testadas sobre baseline fiel, incluindo policies legadas, em ambiente isolado e com role runtime. Antes de editar arquivo potencialmente aplicado, confirmar o histórico do alvo; criação/revisão de migration não autoriza aplicação remota. A recuperação deve preservar fatos e links já emitidos e não reabrir acesso privado.

## 5. Verificação e aceite

Critério de saída: os aceites RC-01–06 são exercitados nos consumidores reais; integração positiva e negativa passa; typechecks continuam verdes; nenhum mock é apresentado como prova de banco/browser; o CLI falha quando não consegue verificar; STATUS-EXECUCAO distingue componente implementado, jornada validada e gate operacional pendente.

Os logs desta revisão provam somente as execuções listadas na seção 1. Nenhum teste de concorrência SQL, Storage, worker ou browser foi realizado. A inspeção estática estabelece os mecanismos descritos, mas não certifica produção nem todas as onze migrations. Os 443 testes relatados não foram repetidos integralmente.

## 6. Próximo passo e limites

Encaminhar esta revalidação ao executor para concluir os reparos delimitados e demonstrar os fluxos completos. Antes de editar, conferir hashes, revisão e instruções atuais. Manter gates comerciais abertos e separar ativação de produção da implementação local. Não há necessidade de redesenhar o blueprint para corrigir esses caminhos.

Nesta rodada só foram escritos este relatório, logs, manifesto e cópia do relato recebido em docs/implementation/. Nenhum código, teste da aplicação, segredo, configuração ou migration foi modificado. Não houve acesso remoto nem alterações funcionais temporárias.
