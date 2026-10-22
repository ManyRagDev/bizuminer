# Caminho seguro para concluir a implementação

15/10/2026. Avaliação de arquitetura baseada no estado local e nos pareceres22/23. **Recomendação: concluir a implantação por expansão compatível, atualização da aplicação e ativação final do isolamento, com ensaio completo em staging.** Esta rodada produziu planejamento; não alterou código, SQL ou banco, não criou recursos e não publicou aplicação.

Conferido e complementado contra o blueprint e o plano original em [25-ADERENCIA-AO-PLANO-ORIGINAL](25-ADERENCIA-AO-PLANO-ORIGINAL.md). Este documento rege a retomada da implantação; as 13 specs, C-01–C-09, gates e critérios funcionais originais continuam normativos. As seis entregas abaixo não substituem os épicos nem reduzem o produto a instalar migrations.

## 1. Resultado esperado

Instalar as capacidades V2 preservando catálogo, monetização, login, comprador, curadoria e captura da operação própria, e demonstrar isolamento/gestão para SaaS. Operação própria e SaaS continuam permanentes e compartilham o mesmo motor comercial. Cada etapa tem entrada e saída observáveis; nenhuma pendência comercial é preenchida com dados ou aprovações fictícias.

Mudança **estrutural** de implantação: a ordem dos arquivos existentes e o pacote de aplicação precisam ser reconciliados. O trabalho já implementado e auditado deve ser aproveitado; não há evidência que justifique reescrever o produto.

## 2. Evidências e estado atual

- [Parecer22, adendos7/8](22-AUDITORIA-INDEPENDENTE-MIGRATIONS.md): auditor independente aprovou somente a manutenção dos complementos e o novo reparo autoral; cadeia completa não liberada no ativo. Novos hashes de M10/M11/M12 revisados, condicionais ao rollout.
- [Execução23](23-CORRECOES-AUDITADAS-E-APLICACAO-SEGURA.md): M1 e dois complementos aplicados; 11 originais pendentes; 379 testes web, 21 suítes SQL, typecheck/build passaram. Esses são resultados anteriores registrados, não testes repetidos nesta avaliação.
- `packages/persistence/supabase/migrations/20261014101000_garimpa_tenant_rls_scoped.sql`: mistura criação de role/helpers com substituição ampla de policies e instalação de triggers. Sua posição anterior às projeções causa a janela incompatível auditada.
- `20261014105000_garimpa_commerce_and_campaign_link.sql` e `20261014107000_garimpa_click_attribution_and_channels.sql`, no mesmo diretório: disponibilizam a superfície pública cuja prontidão é consultada pelo código. M6 precisa da role criada atualmente em M2.
- `packages/web/lib/public-offer-db.ts`, `publicProjectionReady`: exige nove assinaturas, incluindo click recorder e shortlinks. Existência de funções não prova grants corretos nem respostas reais.
- `20261014110000_garimpa_saas_onboarding_entitlements.sql`: cria permissões específicas de gestão de planos/convites/plataforma e percorre tabelas para instalar FKs, triggers e policies restritivas. `20261015021300_garimpa_verified_workflows.sql` também cria controles específicos e depende dos helpers hoje definidos em M2.
- **Inferência adicional da leitura:** mover M2 intacta para depois de M11/M12 faria seus laços encontrarem também tabelas/policies novas e substituir regras especializadas por regras genéricas. Isso pode afetar gestão de planos, convites, reativação e controles de escrita. Não foi executado um novo contraexemplo nesta rodada; é uma dependência estrutural a eliminar na nova candidata, não uma alegação de falha já ocorrida em produção.
- `packages/persistence/src/pg-store.ts`, `packages/web/lib/account-scope.ts`, `tenant-db.ts`, workflows de captura/monitoramento e CLIs: a compatibilidade precisa abranger escritores fora do servidor web.
- Não há `AGENTS.md` aplicável encontrado, `packages/persistence/supabase/config.toml` não existe no caminho inspecionado e o Git contém muitas mudanças locais anteriores. HEAD não identifica sozinho a candidata. Staging e versão publicada ainda não estão comprovados.

O estado remoto acima vem da conferência23, inclusive a verificação independente posterior. Nesta avaliação não foi efetuada nova leitura remota nem presumido que o banco permanece congelado.

## 3. Escopo e condições

Incluído: preparar candidata de implantação revisada, recuperar identidade do deployment e de workers, staging, ensaio de recuperação, implementação dos ajustes de compatibilidade necessários, aprovação por hash e promoção controlada.

Fora desta avaliação: implementação de código/SQL, aplicação remota, provisionamento de serviço pago, deploy ou ativação de E3, canais ou piloto. A autorização humana anterior para migrations permanece condicionada à aprovação técnica; não deve ser solicitada novamente como se não existisse.

Dependências externas reais: ambiente de staging verificável com recursos/acessos próprios; acesso para identificar/publicar deployment e workers; mecanismo de recuperação disponível. A preparação local da candidata pode avançar enquanto esses acessos são resolvidos. A implantação que depende deles fica pendente.

## 4. Decisões e contratos de implantação

1. **Preservar as três aplicações remotas existentes.** Não editar/reaplicar M1 e os complementos para simular história diferente. Reconciliar conteúdo, hash, nome e timestamp MCP. Não marcar uma migration como aplicada só para satisfazer o CLI.
2. **Revisar a cadeia pendente antes de executá-la.** Separar os efeitos aditivos dos efeitos que restringem consumidores existentes. O executor deverá produzir manifesto das unidades novas e sua correspondência com os arquivos originais; não haverá um `db push` da pasta atual.
3. **Expansão compatível:** disponibilizar role/helpers internos, estruturas e superfície pública completa antes de exigir contexto dos consumidores legados. Cada nova tabela mantém seus próprios grants e RLS desde a criação. Mudanças de view, triggers e policies em tabelas existentes entram em matriz de compatibilidade; não são declaradas aditivas apenas por não apagarem linhas.
4. **Isolamento final explícito:** substituir somente policies legadas identificadas, usando uma lista revisada de tabelas e operações. Preservar as policies específicas de M11/M12 e os controles de autoria, suspensão, plataforma e imutabilidade. Objetos inesperados no catálogo devem interromper o preflight. Nenhum laço genérico de M2 intacta será executado no final.
5. **Código compatível antes da restrição:** versão web e todos os escritores devem funcionar com a expansão e com o isolamento final. Uma versão intermediária de compatibilidade será necessária se o candidato atual falhar nessa matriz; não se presume que o build local atual possa ser publicado diretamente.
6. **Staging dedicado ao BizuMiner como preferência.** O projeto ativo é compartilhado com outros produtos. Um projeto dedicado facilita limitar escopo, credenciais e efeitos externos. Branch persistente é alternativa se sua reconstrução de schema, isolamento e configuração forem verificados. Não copiar indiscriminadamente serviços, dados pessoais ou credenciais de outros produtos.
7. **Recuperação compatível em cada estado:** manter artefatos de aplicação testados antes e depois da restrição. Após o isolamento, voltar ao código legado sem contexto não é rollback funcional. Priorizar desativar a capacidade defeituosa e conservar schema/dados; backup restaurado em produção é último recurso, com avaliação dos eventos posteriores e impacto nos demais produtos.
8. **Segurança antes de novas escritas comerciais:** preservar a operação legada durante S1/S2, mas manter as novas escritas comerciais, inclusive da casa, bloqueadas em produção até EP-10A/S3 conferidos. Exercitar os fluxos novos somente no ambiente isolado nesse intervalo; toda tabela nova já nasce protegida. Provisionamento/convites externos e automação permanecem desabilitados por controles verificáveis. Se esses controles ainda não existirem, incluí-los na entrega2. Não adiar o contrato/autorização de conta para o fim: somente a troca compatível das policies legadas ocorre depois de atualizar seus consumidores.
9. **Dependências funcionais preservadas:** financeiro manual08-A/C pode ser liberado após suas dependências, sem aguardar parser08-B; piloto assistido12 não exige experimentos09 ou automação11. Uma capacidade instalada entra no inventário de segurança mesmo com UI oculta. A auditoria10B deve abranger a versão exata, inclusive onboarding, antes de clientes externos. Gates de módulos opcionais não bloqueiam capacidades independentes.

Essas são decisões propostas para a nova candidata. Nenhuma aprova a execução da migration2 rejeitada por fragmentação ou transporte alternativo. A alteração material e as evidências de staging devem receber revisão técnica e avaliação automática próprias.

## 5. Plano executável

### Entrega1 — Fixar a candidata e a linha de base operacional

**Resultado:** identificar exatamente o código que atende produção e todos os processos que escrevem no banco. Congelar pacote/commit e hashes da candidata, incluindo arquivos hoje não rastreados, sem descartar trabalho local.

**Áreas:** Vercel/deployment, `packages/web`, `packages/persistence`, extensão, `.github/workflows/capture-offers.yml`, `.github/workflows/monitor-prices.yml`, manifestos22/23 e catálogo remoto.

**Aceite:** artefato de produção recuperável; inventário de leitores/escritores, roles e configurações por ambiente; versões MCP reconciliadas por conteúdo; preflight confirma alvo antes de cada escrita. Credenciais ficam fora dos documentos.

**Dependência:** pode começar localmente; identificação do deployment precisa de acesso válido à hospedagem. **Verificação:** leituras de histórico/catálogo e inspeção dos artefatos publicados, sem usar `/convite`404 ou SHA local como prova de versão.

### Entrega2 — Construir a sequência revisada em ambiente local

**Resultado:** pacote de expansão e pacote de isolamento final, com dependências e efeito esperado por tabela/policy. Helpers/role hoje presos a M2 antecedem consumidores que precisam deles; regras finais não sobrescrevem indiscriminadamente as novas.

**Áreas:** migrations pendentes2–12, `public-offer-db.ts`, `account-scope.ts`, `tenant-db.ts`, autenticação, persistência/workers e testes. Timestamps novos devem ser gerados pelo CLI quando a implementação começar; este plano não inventa arquivos SQL prontos.

**Aceite:** partir tanto do baseline de staging quanto do estado remoto parcial conhecido, sem reaplicar objetos já instalados. Conferir as permissões especializadas finais, além de FKs e forma de views. Nenhum estado intermediário visível deve selecionar projeções incompletas ou exigir contexto de um escritor ainda legado. Se a detecção do runtime atual muda automaticamente de caminho ao aparecer uma função, a expansão precisa tratar essa transição como uma unidade verificável.

Identificar controles efetivos que mantenham as novas escritas comerciais desabilitadas em produção durante S1/S2; não basta esconder botões. Preservar C-01–C-09 e vincular cada alteração de código/DDL aos requisitos e provas originais. Qualquer pendência implementável encontrada reabre a fatia correspondente de15/17, sem ser rotulada apenas como gate externo.

**Verificação:** ampliar os testes existentes para os estados abaixo e para preservação das policies específicas. Executar `test:auth-merge`, `test:migration-integrity`, `test:public-readiness`, `test:commercial`, `test:onboarding` e `test:dispatch` no pacote `tools/editorial-tests`, mais testes afetados, typecheck e build. Mudar asserções de quantidade de arquivos só depois de validar o conteúdo novo.

**Dependência:** inventário da entrega1; não exige escrita em produção. **Restrição:** sem novas regras comerciais, backfill fictício ou retirada de RLS para fazer teste passar.

### Entrega3 — Disponibilizar staging e recuperação verificável

**Resultado:** aplicação de teste, PostgreSQL/pooler, Auth e Storage próprios, com baseline equivalente ao escopo BizuMiner e dados sintéticos/sanitizados representativos.

**Aceite:** identificação inequívoca do ambiente pelas ferramentas; nenhuma credencial/rota de saída aponta à produção; callbacks OAuth e arquivos privados configurados; controles de envio desligados; snapshot/backup restaurado em ambiente separado e conferido. Inventariar dependências de roles/schemas antes de presumir que um dump apenas de garimpa basta. Não restaurar o projeto ativo compartilhado para testar recuperação.

**Verificação:** testar conexões e origens; ler catálogo e grants; conferir equivalência com o baseline, volume, consultas e restauração. A infraestrutura necessária pode ser preparada em paralelo à entrega2; não é necessário aguardar os ajustes locais para iniciar esse trabalho.

**Referências:** branches têm credenciais próprias e não incluem dados/objetos por padrão; sua reconstrução depende da forma de criação. Auth secrets exigem configuração. [Supabase Branching](https://supabase.com/docs/guides/deployment/branching). Backup de banco não inclui os arquivos do Storage; a recuperação dos objetos precisa de estratégia própria. [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups).

### Entrega4 — Ensaiar a transição completa, incluindo falhas

**Resultado:** provar os estados de compatibilidade e a recuperação da candidata, usando artefatos reais de aplicação e duas conexões independentes.

| Estado | Aplicação | Banco | Saída exigida |
|---|---|---|---|
| S0 | Versão atualmente publicada | Baseline equivalente ao parcial23 | Operação existente reproduzida |
| S1 | Mesma versão publicada | Expansão revisada | Catálogo, login, links e captura continuam funcionando a cada unidade aplicada |
| S2 | Candidata de compatibilidade + workers atualizados | Expansão revisada | Operação legada preservada; fluxos novos exercitados no staging, mas novas escritas comerciais ainda bloqueadas em produção |
| S3 | Mesmos artefatos de S2 | Isolamento final explícito | Mesmas jornadas legítimas funcionam; acessos cruzados/sem contexto falham |

**Aceite:** matriz completa aprovada, sem substituir requests por queries administrativas. Concorrência A/B/A, revogação, suspensão/reativação, último limite, convite único e lease/marker testados em sessões reais; Auth e objetos privados exercitados; locks/latência medidos; falha em cada unidade e recuperação demonstradas.

**Áreas/verificação:** aproveitar as jornadas de [homologação19](19-HOMOLOGACAO-E-RECUPERACAO.md) e os SELECTs do [parecer22](22-AUDITORIA-INDEPENDENTE-MIGRATIONS.md). A ordem numérica do roteiro19 fica substituída pela candidata revisada; suas jornadas continuam úteis. Os 21 testes SQL históricos não certificam esta sequência nova.

Executar e registrar explicitamente **T01–T18, S-PRECO, S-RUBRICA, S-KIT, S-LINK, S-DB, S-FIN, S-DISPATCH e J1–J3** de [05-VERIFICACAO-INTEGRAL](05-VERIFICACAO-INTEGRAL.md). Casos que exigem dados, direitos ou destino ainda indisponíveis recebem NÃO EXECUTADO/CONDICIONAL, com gate e responsável, nunca aceite por presença de código. G-EVIDENCE exige amostra real autorizada por fonte para promover comparaçãoE2; E3 continua sujeito a G-PRICE. O quadro25 liga os 13 épicos à retomada.

**Dependências:** entregas2/3 concluídas. **Restrição:** envio oficial positivo continua dependente de gate/destino/autorização específicos; não usar adapter que finge sucesso.

### Entrega5 — Auditar e promover exatamente a candidata ensaiada

**Resultado:** aprovação por hashes/ambientes e implantação em produção por unidades funcionais já testadas.

**Ordem:** confirmar backup/recuperação e catálogo atuais → expansão compatível → conferir operação existente → publicar aplicação e atualizar escritores → confirmar migração de tráfego/encerramento de instâncias e jobs antigos → ativar isolamento final → conferir operação e isolamento. Evitar troca de banco ou desvio de tráfego como dependência adicional sem necessidade demonstrada.

Depois de EP-10A/S3 aprovado em produção, habilitar gradualmente as capacidades permitidas para a casa: sombra/comparação → assistido autorizado → observação operacional, antes de qualquer expansão externa. Repetir10B para a superfície de onboarding e demais módulos instalados. Não exigir EP-09/11 ativados para um piloto assistido cujo escopo e gates12 estejam aprovados.

**Aceite:** auditor técnico libera os artefatos exatos; avaliação automática pertinente aceita a operação revisada; cada unidade tem limites de lock/tempo medidos, catálogo esperado, SELECTs e teste funcional antes de avançar. FKs e índices não são executados em lote cego. Interrupção aborta a sequência para conferir commit/catálogo, sem repetir um arquivo presumindo rollback.

**Recuperação:** antes da restrição, retornar ao artefato que passou em S1; depois dela, usar artefato que passou em S3 ou corrigir progressivamente. Nenhum retorno a policies globais `using(true)`, exclusão de histórico ou restauração ampla automática do projeto compartilhado.

**Dependência:** todas as provas da entrega4. A aprovação antiga do reparo autoral não cobre esta candidata. Registros de aplicação só podem ser acrescentados após sucesso confirmado, com mapeamento local/remoto.

### Entrega6 — Encerrar tecnicamente e liberar capacidades por evidência

**Resultado:** relatório final com código publicado, writers atualizados, schema efetivo, isolamento e continuidade demonstrados; pendências comerciais separadas por capacidade, com responsáveis e entradas objetivas.

**Aceite:** nenhum defeito técnico impeditivo aberto; todas as unidades mapeadas/aplicadas ou formalmente substituídas por artefatos equivalentes conferidos; zero autoria/referências cruzadas indevidas; publicações/links/vendas reais preservados. Testes em produção não fabricam venda, clique ou postagem para produzir números verdes. Verificações com escrita comercial ficam no staging ou em ato real explicitamente autorizado.

Fechamento obrigatório por **EP-00–EP-12 e por cada um dos62 requisitos**, associado a C-01–C-09, teste/log, ambiente, hash, resultado e impedimento. Registrar também a situação das entregasD00–D14 eR00–R14 dos planos15/17. Separar implementado localmente, instalado, homologado e ativado. EP-08 completo continua condicional sem um formato autorizado comprovado; EP-11 completo exige envio oficial autorizado; EP-12 completo exige piloto real autorizado. Nenhum desses três se encerra apenas com fixture ou um núcleo técnico local.

E3 depende de calibração real; rubrica, de amostra humana; importação específica, de relatório sanitizado; automação, de canal oficial; piloto, de termos/quotas/privacidade. O código pode estar tecnicamente concluído com capacidades protegidas por esses gates, mas não será descrito como funcionalidade comercial plenamente homologada enquanto faltar sua evidência.

Preservar todos os gates do registro07, inclusive G-EVIDENCE, G-RIGHTS/G-PROGRAM e G-EXPERIMENT, no alcance da capacidade afetada. A falta de comparação histórica ou de canal automático não impede recomendação qualitativa/assistida permitida. REQ-MKT-01–03 também entram no fechamento: cadência sem volume artificial, distinção de boa compra/queda especial, demonstração com fontes e limites, tempo observado e separação de comissões, receita SaaS, custos e horas humanas. Não inventar ROI, receita zero ou um novo módulo de marketing para cumprir essas provas.

## 6. Verificação de ponta a ponta

Cobertura mínima: home, detalhe/OG, shortlinks de quatro e doze caracteres, saída monetizada e atribuição correta; callback/login/merge/comprador; owner/operator de casa/A/B e pessoa com home diferente; revisão/seleção/radar/campanha/kit/material; financeiro/idempotência/ledger; convite e administração de conta; captura/extensão/monitoramento; suspensão/reativação; Storage/hash/negação cruzada; processos concorrentes e recuperação.

Na integração final, executar os scripts existentes de testes e typecheck de web, capture, persistence e extension, além das suítes SQL e build web; registrar limitações do ambiente e repetir apenas o necessário para resolvê-las. Mudanças nesta sequência afetam também os escritores externos ao servidor web. O relatório deve conter T01–T18 e as provas originais, não só contagens de testes.

Comparar dados de negócio, catálogos e efeitos esperados, com contagens atualizadas e amostras coerentes. Contagens iguais são uma verificação parcial; não equivalem a backup ou identidade integral do conteúdo. Privilégios efetivos devem ser exercitados com a role real, sem BYPASSRLS. Latência/erros antes e depois têm registro, e limites operacionais são definidos no ensaio para o ambiente efetivo, sem inventar limiares de sucesso nesta avaliação.

## 7. Riscos e definição de conclusão

Riscos principais: nova sequência apagar policies especializadas; consumidor/worker antigo sobreviver à troca; drift de schema/histórico; recuperação perder eventos posteriores; staging incompleto de Auth/Storage; serviços herdados do projeto compartilhado produzirem efeitos externos. As entregas acima dão uma prova específica a cada risco.

**Pronto para executar em produção:** candidata materializada e congelada, S0–S3 aprovados, recuperação comprovada, acesso/alvo confirmados, aprovação técnica e avaliação automática correspondentes. **Implementação técnica encerrada:** entrega6 satisfeita e registro final atualizado. **Liberação comercial:** evidências dos gates correspondentes aprovadas. Nenhum desses estados será inferido dos outros.

Estado deste artefato: **plano de retomada definido; execução ainda CONDICIONAL à materialização/ensaio da candidata e aos acessos indicados**. A próxima implementação pode avançar sequencialmente pelas entregas1/2 enquanto se prepara a infraestrutura3. A intervenção necessária é concentrada na implantação e na compatibilidade comprovada; não exige reabrir decisões estratégicas do blueprint.
