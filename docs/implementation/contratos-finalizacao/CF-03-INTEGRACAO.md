# CF-03 — Integração funcional, gates e conclusão

Estado: PRONTA para verificar o núcleo; capacidades sem entrada permanecem BLOQUEADAS conforme registro próprio. Afiliação própria e SaaS continuam negócios permanentes usando o mesmo motor. Não duplicar serviços para fazer o caminho da casa passar.

## Contratos consumidos

Autoridade de domínio: [C-01 a C-09](../03-CONTRATOS-COMPARTILHADOS.md), specs EP-00 a EP-12 e [aceite05](../05-VERIFICACAO-INTEGRAL.md). A tabela aponta implementações verificadas por leitura, não certificação de produção. Divergência entre especificação e código deve ser registrada; não alterar unilateralmente contrato ou chamar HTTP existente de compatível sem conferir seu retorno.

| Fronteira existente | Produtores / consumidores principais | Invariante e verificação |
|---|---|---|
| C-01 identidade/conta | `lib/account-context.ts`, `account-scope.ts`, `api-auth.ts`, `tenant-db.ts`, `owner-account-db.ts`; páginas, actions, workers | Identidade vem do servidor; membership ativa e conta autorizada; handle transacional único e contexto local; sem tenant livre como autoridade. T17/T18, S-DB, J2 |
| C-02 evidência de preço | `lib/price-evidence.ts`; `db.ts`, `member-db.ts`, curadoria, kits e projeções SQL | Moeda/configuração comparável; desconhecidos não equivalem; E3 desligado sem calibração; evidência coerente em todas as superfícies. T06–08/T10, S-PRECO |
| C-03 rubrica/oportunidade | `lib/rubric-contract.ts`, `rubric-db.ts`, `opportunity-contract.ts`, `opportunity-db.ts`, `curation-pipeline.ts` | Q/V/O/A distintos; política versionada; IA em sombra sem ratificação; preço não é veto universal. T01–09/T12, S-RUBRICA |
| C-04/05 campanha/kit/publicação | `lib/commerce-contract.ts`, `commerce-db.ts`, `commercial-workflow.ts`, `kit-validator.ts`, `kit-renderer.ts`, `private-artifact-db.ts`; admin/campanhas e artefatos | Revisão/digest/versão e direitos revalidados; mudança material invalida aprovação; exportado não significa publicado. T10–13, S-KIT, J1 |
| C-06 links/cliques | `lib/short-link-db.ts`, `public-offer-db.ts`, `public-go.ts`, `campaign-attribution.ts`; `/p/[code]`, `/go/[slug]` | Códigos antigos preservados; monetização do dono; origem desconhecida explícita; nenhuma credencial da casa emprestada. T11/T14/T18, S-LINK |
| C-07 financeiro/métricas | `lib/commercial-financial-contract.ts`, `commercial-financial-db.ts`, `commission-import-contract.ts`; financeiro/resultados | Centavos/moeda, origem não inventada, comissão diferente de caixa, receita SaaS separada; importação idempotente. T15/T16, S-FIN |
| C-08 experimento/envio | `lib/experiment-contract.ts`, `experiment-db.ts`, `dispatch-contract.ts`, `dispatch-db.ts`, `dispatch-worker.ts`; painel e `bin/run-dispatch.mts` | Critério anterior à medição; promoção humana; lease/quotas; timeout após possível envio é unknown, sem retry cego. S-DISPATCH |
| C-08 onboarding/plano | `lib/saas-onboarding-contract.ts`, `saas-onboarding-db.ts`, `saas-entitlement-db.ts`; convite/onboarding/plataforma | Sem plano aprovado não ativa; quotas atômicas; owner/operator distintos; isolamento precede cliente real. T17, J2 |
| C-09 borda/erros | Server Actions e serviços tipados existentes; HTTP somente onde há route real | Validação runtime, autorização e conflito de versão no servidor. Não criar API/DTO universal novo para o executor |

Os caminhos `lib/`, `bin/` e `app/` nesta página são relativos a `packages/web/`. Captura também consome `packages/capture/src/types.ts`, `packages/persistence/src/ingest.ts` e `pg-store.ts`; monitoramento usa `packages/persistence/src/monitoring-db.ts`. Tipos estáticos não validam JSON de provedor nem garantem permissão. Reusar decoders/validators, `kit-validator`, import parser, validação de imagem e checagens de permissão existentes.

## Bordas HTTP reais relevantes ao smoke

Não são endpoints novos. Estas condições refletem os handlers lidos nesta rodada; o contrato abstrato C-09 não apaga códigos divergentes existentes.

| Método / rota | Identidade, transporte e resultado | Efeito / falha |
|---|---|---|
| OAuth Google → `GET /auth/callback` | `signInWithOAuth` com provider google em `/entrar`; callback troca code por sessão, valida usuário e redireciona no mesmo origin | Preservar OAuth2 já configurado; next sanitizado/cookie existente. Sessão não é prova de membership de toda conta. Não registrar code/cookies nem reconfigurar Auth global |
| `POST /api/admin/artifacts/upload` | Sessão afiliada + conta autorizada; same-origin; multipart `file`, `kind`, `tenantId` e direitos quando cabíveis; sucesso200 `{id,sha256}` | 403 origem/auth; 413 header acima do limite; 400 arquivo/parâmetro/erro. Arquivo até10MiB e validação de conteúdo; Storage privado fora da TX, metadata ready/orphaned. Não trocar por tipo TS sem validação |
| `GET /api/admin/artifacts/[id]?conta=...&preview=1` | Conta autorizada por query/cookie; bytes com MIME, attachment e `private, no-store` | 403 sem acesso de conta; 404 indisponível/erro, sem revelar metadata privada. Kit revalida revisão/fatos. **Sem `preview=1`, pode preparar exportação e alterar estado**; GET não é automaticamente só leitura |
| `GET /`, `/bizu/[slug]`, `/p/[code]`, `/go/[slug]` | Sem login; funções de projeção pública/role restrita, resolver legado e monetização existente | Conferir status/Location e dados mínimos conforme cada handler e oferta válida. Não impor200 a redirect. `/go` pode gravar clique: smoke sintético não deve inflar relatório de produção; usar resolver/preview apropriado ou acesso legítimo contabilizado |

Artefatos usam SHA256 de domínio para conferir conteúdo/revisão já implementado; isto protege o material aprovado e não constitui checksum novo do agente. Não mandar service_role/chave de criptografia para cliente.

## Aceite por ambiente e capacidade

Entrada da integração: deployment/ref efetivos, C confirmada, baseline/backup válidos e lista de capacidades pretendidas. Saída: matriz `capacidade → versão → cenário → ambiente → evidência → resultado → ativação`, e defeitos/bloqueios identificados. Resultado ausente não é PASS.

| Grupo | Prova local isolada | Prova no ativo, sob manutenção |
|---|---|---|
| Continuidade T18/J3 | Regressões web/capture/persistence/extension e SQL | Login Google do dono, conta, catálogo/detalhe, links antigos/monetização e fluxos usados de curadoria/captura/monitoramento |
| Evidência/rubrica/radar/cockpit | T01–09/T12, S-PRECO, suites price/rubric/opportunity/cockpit | Fonte/dados reais e UI coerente, estados desconhecidos honestos; sem habilitar E3/assistido por fixture |
| Campanhas/kits/distribuição assistida | T10–14, S-KIT/S-LINK, commercial/verified-workflows | Conta legítima e material próprio autorizado; render inspecionado; Storage upload/download antes de habilitar essa capacidade. Se adiado, registrar não homologada/desligada |
| Financeiro/experimentos | T15/T16, S-FIN, financial/experiment/entitlement | Ler informações reais autorizadas; registro manual só de fato real solicitado, sem criar venda/comissão ou promoção fictícia para preencher aceite |
| Isolamento T17/J2/S-DB | Duas contas sintéticas, pessoa em duas contas, owner/operator, worker, Storage, revogação, A/B/A concorrente em PostgreSQL real | Runtime/pooler real, ausência de contexto e negativas públicas; conta legítima funciona. Não criar clientes sintéticos no ativo para alegar piloto homologado |
| Automação/piloto | S-DISPATCH, onboarding e negações de plano/quota | Somente com entradas/autorizações do registro de capacidades. Envio, convite e cobrança reais não fazem parte do smoke genérico |

Todo cenário T01–T18, S-PRECO/RUBRICA/KIT/LINK/DB/FIN/DISPATCH e J1–J3 recebe resultado/ambiente ou pendência explícita na OS-08. Não é necessário repetir cenário sem mudança desde31 quando a evidência cobre os mesmos bytes; declarar reuso histórico e seu limite. Ensaios locais não substituem serviços gerenciados usados. Capacidade essencial sem smoke bloqueia reabertura; opcional permanece desabilitada e pendente.

## Ativação, falha e conclusão

`commercialRolloutReady`/`assertCommercialRolloutReady` e `withCommercialDb` consomem o controle persistido. Ausente/falso: `commercial_rollout_not_ready`. **Controle true não aprova política, imagem, canal, credencial ou plano.** Captura multicliente hoje nega `capture_account_credentials_required`; secrets cifrados existentes não significam que o resolver completo já esteja ligado. Dispatch sem adapter oficial e importação canônica sem parser do programa são lacunas técnicas, além de entradas de negócio pendentes.

Falha funcional → manter o componente parado, registrar `[BLOQUEIO DE FRONTEIRA]`, delimitar os arquivos/contratos/testes e obter ordem corretiva específica. Não há permissão aberta de editar qualquer `lib`, teste ou SQL; reparo material de SQL/segurança exige revisão correspondente. Corrigir e repetir a verificação afetada antes de retomar.

Na OS-10, reconciliar [rastreabilidade08](../08-RASTREABILIDADE.md), planos D00–D14/R00–R14 e 13 épicos/62 requisitos, distinguindo **implementado, instalado, testado localmente, homologado no ativo e ativado**. Em cada pendência indicar responsável, entrada, efeito e próximo trabalho técnico. A implantação do núcleo só conclui quando seu escopo publicado passa integralmente, sem defeito impeditivo. Conclusão integral do Blueprint exige também as capacidades pendentes realmente entregues; fechar relatório ou ordem documental não as implementa.
