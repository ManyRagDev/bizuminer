# Evolução de dados e plano de migrations

## Atualização operacional de16/10/2026 — OS10

A/B/C substitutas instaladas no Supabase spbuwcwmxlycchuwhfir / garimpa, sem db push da pasta histórica e sem reaplicar originais:

| Unidade | Histórico remoto | SHA256 exato |
|---|---|---|
| A |20261016185521 / garimpa_v2_foundation|33e03729f9e058169844fc353cba083cb3d5fe270b98ea890dafd0fb0a87c40c|
| B |20261016185708 / garimpa_v2_expansion|02810325f1eecc16dfc05121f44b75a64c5ce0655b9329f2662ffb0d74cbecaa|
| C |20261016223906 / garimpa_v2_scoped_cutover|a08659287c10e2b7e3358bf6029bec75277cc0ca0ce07655d7e9f70acef92597|

M1 remota20261015034755 e complementos20261015035126/20261015041540 preservados. As11 originais pendentes foram substituídas, não reaplicadas. C anterior111498… é histórica, sem autorização de execução. Manifesto selado não foi alterado para declarar productionApproved; autorização técnica33/12 e humana específica estão nos resultados.

Controle true,185 policies, zero *_app_access,66 tabelas,145 FKs e a única FK NOT VALID de experiment_evaluation prevista em B. [Aplicação07](contratos-finalizacao/resultados/07-unidade-c.md), [preservação/backup06](contratos-finalizacao/resultados/06-pre-c.md), [retomada09](contratos-finalizacao/resultados/09-retomada.md). Recuperação é compatível/seletiva; controle false não desfaz RLS e não autoriza restaurar banco compartilhado ou policies amplas.

---

## Registro anterior preservado — não representa o estado atual


Nenhum DDL executável é entregue e nenhuma migration foi aplicada. IDs M-* abaixo são identificadores de planejamento, **não nomes de arquivos de migration**. Na execução, gerar nome/timestamp pela CLI disponível após consultar --help, dentro de `packages/persistence/supabase/migrations/`, seguindo o histórico reconciliado. Não fazer push do diretório completo: há stubs, timestamps divergentes e uma migration gated inválida para o schema atual.

## Protocolo obrigatório por alteração

1. Confirmar por leitura deployment, projeto, ambiente, schema `garimpa`, role runtime e role DDL; obter autorização de escrita para o alvo se não estiver concedida na futura tarefa. MCP autenticado não é autorização. Não atingir outros schemas do projeto compartilhado.
2. Comparar objeto real, migration local e remoto; capturar definições/grants/policies/índices e contagens. Congelar manifesto/hash do arquivo revisado. Validar backup recuperável e ensaio de restauração em ambiente isolado antes de mudança de produção.
3. Criar/revisar migration aditiva e testar em fixture/staging explícito. Versão anterior e nova da aplicação devem coexistir. Medir locks em tabelas usadas por /go e ingestão. Criar índices grandes de forma compatível com transação/CONCURRENTLY; planejar etapa própria quando necessário. Não executar DDL em startup ou GET.
4. Backfill em lotes delimitados por PK, checkpoints, contagens antes/depois, chave idempotente e registro de proveniência. Não preencher desconhecido. Constraints NOT VALID quando útil, validar depois do backfill; coluna NOT NULL somente após prova de cobertura.
5. Aplicação remota futura como entrega própria, somente arquivo revisado, com feature off. Verificar objetos, FKs, grants, RLS com role real, planos de consulta e amostra de comportamento. Ativar leitura nova gradualmente; observar erros/latência/cliques válidos sem postar campanhas de teste em público.
6. Reversão padrão: desligar feature afetada, preservar novos fatos e servir projeção compatível. Reverter DDL destrutivamente só com plano específico e prova de ausência de dados dependentes; preferir correção aditiva. Segurança externa não pode voltar para using(true); suspender contas externas se for necessário recuar aplicação.

## Registro ordenado

| ID / dono | Objetos e pré-condições | Backfill / pós-verificação | Recuperação |
|---|---|---|---|
| M-10A1 / EP-10A | Membership/autoria transversal, campos de contexto/secret version, índices; baseline 00 | Converter vínculos humanos antigos para membership correspondente somente quando comprovado; manter autoria antiga caso ambíguo; verificar usuário em duas contas | Campos antigos preservados; desativar multi-conta se ambiguidade; não duplicar auth_user_id |
| M-10A2 / EP-10A | Substituir policies permissivas por scoped em tabelas atuais, funções públicas mínimas; aplicação inteira já usa transação real | Ensaiar pooler com A/B/A, sem contexto e role runtime; revisar view security_invoker e trigger seed_product_curation | Reverter deploy para versão compatível com contexto ou suspender externos; nunca reabrir tabela privada |
| M-01 / EP-01 | Price policy versionada e função canônica de evidência/compat view; JSONB v2 mantém v1 | Nenhuma variantKey/currency inventada; backfill de proveniência só documentado; confirmar mesmos IDs/preços, divergências de claims esperadas | Consumidor v1 via adapter seguro; apagar claim inseguro não é regressão a restaurar |
| M-02 / EP-02 | analysis_assessment/comparison_review; evolução validada do payload editorial_assessment v2; FK de ator de 10A | v1 continua v1; mode shadow para IA nova; nada reclassificado em massa | Desativar rubric_v2; manter avaliações/eventos, interface antiga decodifica projeção |
| M-03 / EP-03 | audience_policy/version, opportunity e domain_event; acrescenta analysis_assessment.policy_version_id nullable e FK composta após criar a política; 01/02/10A disponíveis | Traduzir guideline para draft, sem ativar regras comerciais sem aprovação; oportunidades sob demanda; análises de 02 conservam rubric_version e policy null | Restaurar policy anterior e pausar nova priorização; sem apagar catálogo |
| M-04 / EP-04 | campaign, destination, kit/revision/validation/approval, campaign_publication, campaign_link; reutiliza domain_event de M-03; FK oportunidade existente | Não backfill social a partir de publication web; criar drafts só por ação. Proteger observações/revisões contra purge; assets com digest | Feature commerce off; preservar drafts/links já emitidos e snapshots; manter resolução de links externos já distribuídos |
| M-05 / EP-05 | Nenhuma migration central; consulta/projeção usa 01–04 | Sem seed de métricas; indexes somente se plano/medida justificar, sob revisão | Voltar navegação antiga; mesmos comandos e dados |
| M-06 / EP-06 | Assets privados e permissões Storage, referências de kit já criadas em 04 | Não republicar imagens sem direito confirmado; validação do objeto/digest | Retirar geração, manter download autorizado de versões preservadas; revogar arte se direito expirou |
| M-07 / EP-07 | Colunas nullable de atribuição em click_event; FK composta para campaign_link/publication; índices por conta/canal/data | Cliques legados permanecem null; código antigo continua inserindo. Cross-check conta+produto+link | Flags de criação off; resolver antigo e novo continua válido para material já na rua; não perder afiliação |
| M-08 / EP-08 | conversion/attribution, commission_entry, import_batch/row, operational_cost e saas_revenue_entry separada; depende de 04/10A; FK de atribuição já existe em 04, não requer M-07 | Nenhuma venda fictícia. Importar apenas após preview aceito; preservar bruto em bucket privado separado e auditado; receita SaaS pertence à conta operadora, nunca como despesa | Desabilitar importador; desfazer lote por lançamentos de correção/reversão, não DELETE de ledger |
| M-09 / EP-09 | policy_experiment, assignment/evaluation e instrumentação operacional | Não preencher impressão ausente; observações shadow não alteram produção | Desligar experiência, política baseline preservada |
| M-10B / EP-10B | Auditoria de novas relações; somente migration corretiva se diferença concreta, antes de externos | Inventário inclui todas relações efetivamente instaladas e Storage; 09 não é pré-requisito; repetir ao adicionar 08/09/11/12 ou outra superfície | Pausar acesso externo e sanar brecha; nunca esconder teste falho |
| M-11 / EP-11 | dispatch_job/outbox/attempt, quota reservations; 04/06/07 e destino autorizado | Nenhum enqueue de publication legado; reservas únicas e retries seguros | Kill switch por conta/global, cancel queued, reconcile leased/unknown; preservar confirmações |
| M-12 / EP-12 | entitlement/onboarding/usage; 10B-base dos módulos existentes aprovado; repetir 10B após integrar 12-A e antes de convidar externos | Provisionamento assistido com IDs novos e termos aprovados; validar primeiro com contas fictícias isoladas; não clonar segredos da casa | Suspender piloto/revogar sessões e destinos; manter financeiro/evidências; processo explícito de retenção |

Cadeia de DDL: 10A1→10A2→01/02→03→04. De 04 saem dois ramos: 06/07 e 08; 09 depende de ambos os ramos. 10B verifica a superfície integrada do piloto sem exigir 09; 11/12 exigem verificação adicional 10B antes de acesso externo. EP-05 sem DDL pode ocorrer após 04. 01-0 não tem DDL e pode preceder 10A. M-02 pode nascer antes de M-01 somente se deixar priceEvidenceRef desconhecido e não emitir claims; ordem recomendada evita isso.

## Proteções concretas de compatibilidade

- `curation_queue_facts`: preservar nomes/tipos das colunas existentes na substituição; adicionar dados no fim ou criar v2 e adapter. Seus SELECTs e snapshots não podem receber tipos novos silenciosamente. `lowest_verified` passa a refletir política válida, inclusive false com E3 off.
- `product`, `publication`, `short_link`: não renomear, trocar PKs ou recriar slugs da casa; resolver externo usa publication persistida. unique global de slug continua.
- Eventos de curadoria e financeiro mantêm versão/proveniência original. `last_seen_at` permanece presença; não substituir por horário de análise/kit.
- `price_observation`: não tornar o legado inválido adicionando CHECK de campos não existentes. V2 valida novas escritas, guarda snapshots para consumidores. Bloquear scripts cleanup/purge para linhas referenciadas por fatos comerciais; o executor deve inspecionar `bin/cleanup-lifecycle.ts` e `bin/purge-catalog.ts` antes de ativar EP-04.
- Novas políticas removem as permissivas equivalentes; policies permissivas em OR com true não dão isolamento. Tabelas sem tenant_id exigem resolução via affiliate_id/membership; não copiar o loop gated antigo.
- Prever indisponibilidade e latência na leitura do ledger/import; endpoint público /go não depende de consulta financeira nem de modelo IA.
