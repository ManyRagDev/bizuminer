# Manual Operacional Diário: Workflow de Curadoria BizuMiner

**Versão publicada:** 2.0 — 17/11/2026 · revisão operacional em produção

**Público-alvo:** Afiliado Administrador / Editor-Chefe  
**Objetivo:** Acompanhar recebimentos, processamento e pauta, com caminhos claros para resolver pendências na conta correta.

Para entender por que uma oferta capturada chega à pauta, perde a vaga ou aparece na vitrine, consulte a [auditoria de escolha de produtos de 18/11/2026](auditoria-escolha-produtos-2026-11-18.md). Ela acompanha lotes reais e compara as escolhas do sistema com exemplos indicados pelo criador.

> **Estado conferido em produção — 17/11/2026:** a revisão operacional está publicada em `https://www.bizuminer.com.br`, com Hoje, Capturas, andamento/problemas e acesso à pauta. A curadoria automática v2 conserva sua configuração anterior. As capturas manuais de Mercado Livre, Amazon e AliExpress e a captura Shopee abastecem o processamento; aprovação, seleção e disponibilidade na pauta têm condições próprias. Os três workflows do GitHub permanecem `disabled_manually`, por decisão do dono. Use a rotina vigente abaixo. As seções 1 a 4 preservam procedimentos anteriores e não devem orientar uma nova ativação nem exigir triagem manual de todo o catálogo. A [auditoria da jornada na seção 5](#5-auditoria-da-jornada-operacional-em-15-de-novembro-de-2026) documenta os problemas encontrados em 15/11 e a origem desta revisão.

A área **Curadoria → Configurações e diagnóstico** oferece configuração versionada da política v2 para o responsável pela conta. A ativação exige ação explícita e pode reduzir o catálogo exibido até existirem avaliações e conferências compatíveis. Se executores externos já estiverem habilitados e com orçamento, uma alteração da política poderá gerar trabalho para eles. A permanência DOM acima de 24 horas é uma escolha explícita, até 48 horas; a pauta mantém seu próprio limite por canal.

A passagem automática de um candidato pendente exige tanto a opção específica da política v2 quanto a publicação automática na Bússola. A escala antiga de 1 a 5 não é convertida em limiar v2. A passagem registra evento de curadoria e não dispensa verificação de preço, vínculo afiliado ou seleção; bloqueios e decisões humanas continuam prevalecendo.

## Rotina vigente: Hoje → Capturas → Curadoria → Pauta

Esta é a rotina publicada das fases 1–5. As três expansões e as imagens web/executor foram aplicadas e conferidas em produção em 17/11/2026, preservando configuração e agendamentos suspensos. Consulte o [registro de publicação e seus limites](publicacao-revisao-operacional.md#aplicação-e-conferência-em-produção--17112026). O aceite humano de autonomia continua pendente. As seções 1–4 abaixo são histórico da rotina anterior; os registros de entrega local ao final conservam o estado na data de cada fase.

1. Abra **Hoje**, confira a conta no cabeçalho e a hora da consulta. Veja fila, execução confirmada e pendências. Fila não comprova que o avaliador começou; resultado incerto não significa falha sem custo.
2. Depois de importar Mercado Livre, Amazon ou AliExpress pela extensão, confira **Capturas recebidas recentemente** ou abra **Capturas** e filtre a loja. Para Shopee, use **Capturas → controles de captura e conexões** quando a API estiver habilitada. Os agendamentos continuam suspensos.
3. Abra o recibo ou lote. **Produtos distintos**, **observações salvas**, **novos**, **reencontrados** e **recusados na entrada** são medidas diferentes. Reencontrar um produto em outra página não exige criar outro produto; repetir o mesmo envio não cria outro recebimento. O detalhe conserva fatos históricos e mostra a situação atual separadamente.
4. Use **Curadoria → Andamento** para acompanhar avaliação e conferência. Em **Problemas**, escolha a categoria, abra o item e retorne ao filtro de origem. Operadores acompanham os mesmos estados operacionais; dados privados dos jobs e a liberação de avaliações incertas continuam restritos ao dono.
5. Abra **Pauta → WhatsApp ou Stories**. A seleção disponível pode coexistir com fila ou problemas de outras ofertas. Produto aprovado no catálogo pode ficar fora de um canal, do corte ou da validade. Copiar e preparar mantêm o fluxo existente; registre a divulgação somente depois do envio real.
6. Ao sair e voltar à aba, a situação é consultada novamente. Use **Atualizar situação** se precisar de outra leitura. A consulta pausa quando ociosa, em espera humana, com falha ou com fila sem progresso confirmado; deixar a aba aberta não executa a curadoria.

Em **Lojas e novas capturas**, “manual/API habilitada” descreve a modalidade disponível na instalação. A configuração afiliada da conta aparece separada e não garante que uma credencial externa continue válida. Produtos com preço observado nas últimas 48 horas, aprovados no catálogo e selecionados para cada canal não são contagens intercambiáveis. A seleção por loja acompanha a edição preparada e respeita o vencimento; indisponível não vira zero.

**Configurações** reúne lojas/extensão, critérios/canais e administração da conta. **Conteúdo** e **Ferramentas avançadas** ficam recolhidos. Os endereços antigos continuam acessíveis; links operacionais preservam conta, produto, opção e retorno. Contas com a área comercial já habilitada mantêm sua navegação própria; esta revisão não habilita a área comercial.

| Situação encontrada | Próximo passo no painel |
| --- | --- |
| Não localizo a captura | Capturas: confira conta, loja e data. Conferências internas ficam em Finalidade própria. Use a referência do envio quando disponível. |
| Importação parcial ou recusas | Abra o resultado registrado do recebimento e os produtos realmente salvos. Confira o motivo da entrada antes de reenviar. |
| Avaliação na fila sem execução confirmada | Consulte Andamento e o prazo registrado. Após a pausa, atualize a situação. Persistindo sem progresso, o responsável pelo executor precisa conferir o serviço. |
| Resultado incerto ou execução sem confirmação | Abra Problemas e confira o item. Somente o dono pode justificar nova tentativa após conferir o efeito anterior; o recebimento original permanece salvo. |
| Conexão ou vínculo afiliado ausente | Abra o item e Configurações → lojas e extensão. Uma nova captura não substitui a configuração afiliada. Mudanças de conexão dependem do dono. |
| Aguardando navegador | Confira a extensão pareada e o estado da sessão de conferência, pelo caminho indicado no item. |
| Aguardando cota ou prazo | Aguarde o prazo apresentado; a atualização da tela não reinicia o orçamento. |
| Oferta aprovada fora da pauta | Abra o item e leia o motivo por canal: requisitos, corte, validade, conexão e opção atual. |
| Seleção preparada ainda não consultável | Abra a Pauta do canal e consulte a edição disponível. O resumo de Hoje não prepara uma edição a cada consulta. |
| Falha de consulta ou atualização do banco ausente | Atualize a consulta. Os demais canais/dados conhecidos permanecem identificados. Persistindo, encaminhe ao responsável pela aplicação; não trate como fila ou pauta vazia. |

Configuração do provedor, executor indisponível e aplicação de migrações são intervenções administrativas legítimas. O painel deve informar a pendência e seu contexto; a revisão não promete resolver esses serviços externos nem autoriza chamadas reais de teste.

---

## 1. Visão Geral do Ciclo Editorial

O BizuMiner opera pelo princípio de **curadoria por exceções**:
- A **máquina faz a triagem pesada**. Coleta produtos, filtra peças industriais e de reposição e classifica candidatos pela utilidade e pela diretriz editorial da conta.
- O **humano atua como editor-chefe**: define o tom editorial, resolve dúvidas limítrofes, audita uma pequena amostra diária e decide o que ganha destaque na vitrine do dia.

```
[08:00] 1. Ingestão & Triagem Automática (Loop Fechado) (~2 min)
   ↓
[08:02] 2. Julgamento de Exceções & Grupos Repetitivos (~5 min)
   ↓
[08:07] 3. Auditoria Amostral & Spot-Check de Aprendizado (~2 min)
   ↓
[08:09] 4. Revisão Visual da Vitrine do Dia (~2 min)
   ↓
[08:11] 5. Seleção dos Destaques & Compartilhamento (~2 min)
   ↓
[08:13] ✅ TAREFA DO DIA CONCLUÍDA
```

---

## 2. Passo a Passo do Workflow

### Passo 1: Ingestão e Triagem com Loop Fechado (~2 min)

O dia começa atualizando o catálogo das lojas parceiras e rodando a triagem de novos produtos.

Produtos com preço válido entram na triagem em qualquer faixa de valor. Use a faixa completa quando houver variações. Afirmações de queda de preço exigem histórico comparável da mesma configuração. Produtos recentes retidos automaticamente pelo antigo piso de R$ 20 podem voltar à triagem da fila geral.

#### Opção A: Pelo Terminal (Recomendado)
Basta rodar a varredura com a flag `--trigger-triage`. Ela captura as ofertas e dispara a IA automaticamente ao terminar:

```powershell
# Para Shopee:
node --experimental-strip-types packages/persistence/bin/sweep-shopee.ts --trigger-triage

# Para AliExpress:
node --experimental-strip-types packages/persistence/bin/sweep-aliexpress.ts --trigger-triage

# Para Mercado Livre:
node --experimental-strip-types packages/persistence/bin/sweep.ts --trigger-triage
```

#### Opção B: Pela Interface Web
1. Abra o navegador em: `/admin/curadoria?aba=bussola`.
2. Verifique o **Pulso Operacional** e clique no botão **"✨ Executar Triagem com Gemini"**.
3. O status mudará para *Executando triagem com Gemini...* e atualizará a lista de lotes ao concluir.

---

### Passo 2: Julgar Exceções e Grupos Repetitivos (~5 min)

Acesse a aba **[Exceções para Julgamento](/admin/curadoria?aba=excecoes)**. Esta mesa reúne apenas os itens onde a máquina não teve certeza absoluta ou onde há grande volume repetitivo.

1. **Grupos Repetitivos (Massa):**
   - Produtos da mesma família de busca (ex: 20 cabos USB ou 15 adesivos).
   - *Como agir:* Avalie o grupo como um todo. Se a categoria for fraca, clique em **"Rejeitar Grupo"**. Se houver um ou dois itens claramente superiores em acabamento/preço, aprove esses e mande o restante para espera.
2. **Produtos Singulares (Mesa de 20):**
   - Produtos isolados limítrofes (ex: ferramentas, eletrônicos ou itens de tíquete médio sem histórico robusto de preço).
   - *Como agir:*
     - **Aprovar:** Envia imediatamente para a vitrine ativa.
     - **Em Espera:** O produto é bom e aprovável, mas hoje o preço está normal ou já há itens semelhantes na vitrine.
     - **Rejeitar:** Produto fútil, de baixa durabilidade, sem utilidade real ou fora do perfil da marca.

---

### Passo 3: O "Spot-Check" de 2 Minutos (~2 min)

Acesse a aba **[Auditoria & Amostragem](/admin/curadoria?aba=auditoria)**.

Esta é a etapa mais importante para o aprendizado da IA. Você audita de 3 a 5 decisões tomadas automaticamente pela máquina:

1. A tabela mostra produtos recentemente avaliados como `approved` ou `held` pela automação.
2. Clique em:
   - **👍 Concordo:** Se a decisão da IA foi correta (ex: aprovou um bom jogo de chaves ou reteve uma capinha boba).
   - **👎 Discordo:** Se a máquina errou. Ao discordar, selecione o motivo real:
     - *"Interessante, mas caro demais no momento"*
     - *"Falta utilidade prática real"*
     - *"Peça de reposição ou componente técnico"*
     - *"Item genérico/sem diferencial"*
3. **Efeito prático:** Suas correções alimentam os exemplos canônicos (*golden examples*), incluindo o preço no momento da decisão. As próximas rodagens da IA usarão seus julgamentos como referência direta.

---

### Passo 4: Olhar Crítico na Vitrine do Dia (~2 min)

Acesse a aba **[Seleção do Dia](/admin/curadoria?aba=selecao)**.

Esta tela reflete o que os visitantes reais estão vendo no site:

Na vitrine pública, o catálogo pagina todas as ofertas publicadas com preço observado nos últimos sete dias. A ordem inicial intercala as lojas disponíveis. A capa usa a edição editorial da conta.

1. Percorra visualmente a grade de produtos ativos.
2. Verifique se há boa diversidade de categorias:
   - Cozinha e casa prática
   - Ferramentas e utilidades
   - Gadgets e eletrônicos inteligentes
3. Se algum produto destoa da qualidade desejada:
   - Clique em **"Pausar"** (sai da vitrine e vai para a fila de espera sem penalizar o produto).
   - Ou clique em **"Rejeitar"** se o item não deveria ter sido aprovado.

---

### Passo 5: Seleção de Destaques e Publicação (~2 min)

1. Abra **Pauta de divulgação** e escolha WhatsApp ou Stories. A lista consulta o catálogo da sua conta a cada atualização. Para entrar, a oferta precisa estar aprovada, ter preço em reais observado nas últimas 48 horas e ter um link de afiliado válido. A Shopee também pode entrar com a faixa completa em reais quando a API informa os dois limites. A mensagem informa que o valor varia conforme a opção escolhida.
   - Para o AliExpress, filtre **AliExpress** no **Histórico de capturas** e abra **Confirmar preço da opção** em uma oferta aprovada. Escolha a variante na loja e salve o preço em reais e as condições no BizuMiner. Uma nova coleta do preço geral do anúncio não renova a validade da opção conferida.
2. Abra **Pendências de curadoria** quando houver decisões humanas ou ofertas que podem voltar à triagem com IA. Use o **Histórico de capturas** para consultar motivos e filtrar por loja.
3. Escolha as ofertas em **Prontas para divulgar**. O mérito editorial e a recência definem a ordem, com os limites configurados para cada canal. Os links copiados abrem no BizuMiner. O botão de compra leva ao anúncio com a atribuição da conta de afiliado, inclusive quando a oferta do Mercado Livre ainda está fora da vitrine.
4. Copie a mensagem ou o link e publique no canal. Use **Confirmar divulgação** depois de publicar para iniciar o intervalo daquele produto no canal.

---

## 3. Critérios Editoriais Rápidos (Guia de Bolso)

| Perfil do Produto | Decisão Recomendada | Justificativa |
|---|---|---|
| **Ferramenta multifuncional, organizador prático, gadget que resolve problema** | **Aprovar** | Valor claro de utilidade para o comprador diário. |
| **Adesivo, brinde barato, capinha genérica, futilidade descartável** | **Rejeitar** | Desgasta a autoridade da marca como garimpo qualificado. |
| **Produto excelente de R$ 300, mas com preço sem desconto evidente** | **Em Espera** | Bom produto que aguarda uma promoção real para ser vitrine. |
| **Bico injetor, placa de circuito interno, engrenagem avulsa** | **Rejeitar** | Peça industrial de reposição técnica, fora do público geral. |
| **10 modelos parecidos da mesma luminária** | **Aprovar 1 e Espera no resto** | Evita saturar a vitrine com o mesmo produto repetido. |

---

## 4. Checklist de Fechamento do Dia

Você pode considerar o expediente de curadoria encerrado quando cumprir este checklist:

- [ ] **Vitrine viva:** conferir as vagas e manter apenas ofertas com evidência válida; a escassez pode deixar posições vazias.
- [ ] **Exceções sob controle:** Nenhum grupo repetitivo volumoso acumulado na fila de exceções.
- [ ] **IA calibrada:** 3 a 5 produtos auditados no Spot-Check com *Concordo/Discordo*.
- [ ] **Frescor garantido:** Ofertas desatualizadas foram pausadas ou revalidadas pela nova rodagem.
- [ ] **Destaques compartilhados:** 1 a 3 ofertas publicadas nos canais de comunicação com a audiência.

### Próximo passo na curadoria

Ao abrir **Curadoria → Começar**, o resumo da conta orienta a próxima ação: **Analisar capturas com IA** quando houver candidatos, **Revisar produtos** quando houver decisões pendentes ou **Conferir pauta de divulgação** quando houver ofertas elegíveis no canal. Sem ofertas elegíveis, a tela orienta conferir canais e impedimentos; capturas incompletas ou em andamento recebem orientação própria. Uma falha de leitura não é apresentada como pauta pronta. Zero candidatos para IA não comprova que toda captura foi analisada; lotes ainda em processamento só aparecem após a conclusão. A quantidade de aprovados recentes também não garante elegibilidade na pauta, que confere preço, opção e link por canal. Ajustes de política, canais, equivalências e indicadores ficam em **Configurações e diagnóstico**; a revisão editorial específica permanece acessível separadamente.

### Descoberta ampliada da Shopee

A Shopee usa por padrão 12 departamentos, até duas páginas de 20 anúncios por departamento (480 posições de consulta, antes de repetições, páginas incompletas e falhas da fonte). `--keyword` mantém a consulta manual, e `--plan keywords` seleciona explicitamente o plano anterior. A ingestão preserva faixas de preço, gera links afiliados por conta e mantém os produtos existentes por ID. Os limites de descoberta são 50 novos por departamento e 25 por família por consulta; cortes são contados em `itemsSkippedByPolicy`.

No localhost, uma falha pontual `10000 — System Error` recebe as tentativas limitadas do cliente e não impede consultar os outros departamentos. Se a rodagem terminar incompleta, expanda sua linha em **Rodagens · Shopee** e use **Retomar consultas pendentes**. A retomada mantém o mesmo lote, reutiliza as consultas concluídas e repete somente as pendentes. Os fatos preparados permanecem fora do catálogo até a fonte concluir; só então seguem confirmação, links e fila de atributos. O painel acompanha o lote mesmo quando a retomada reutiliza os IDs anteriores.

Essa retomada é limitada a lotes locais exclusivos da Shopee, sem publicação anterior, encerrados por falha conhecida do CLI e iniciados há menos de 48 horas. Exige a credencial da conta e ausência de outra captura ativa. Timeout, resultado incerto e ensaios de tentativa única continuam exigindo reconciliação; lotes antigos exigem nova captura. O erro `10020 — Invalid Signature` exige conferir a credencial antes de retomar. Esta capacidade não ativa o executor durável nem altera o ambiente da VPS.

Os workflows legados de descoberta e monitoramento estão bloqueados no código local da integração v2. Não conte com os antigos horários automáticos para renovar preços. A operação durável depende de configuração e ativação posteriores autorizadas; não envia mensagens ao WhatsApp.

A triagem em lote percorre os candidatos em ciclos de até 200; o teto de três representantes por família não é aplicado antes da IA por padrão. Ofertas avaliadas com nota 3 continuam sinalizadas para decisão editorial quando a nota mínima de publicação automática é 4. Isso é diferente de um produto ainda não avaliado. Falhas em páginas posteriores preservam tanto os produtos já gravados quanto seus contadores no resumo, mantendo a consulta marcada como falha.

### Pauta vazia e desenvolvimento local

Uma pauta carregada sem ofertas é diferente de `Não foi possível consultar a pauta`. A seleção exige fatos recentes e os demais critérios editoriais; a lista de capturas da pauta cobre as últimas 48 horas. Migrations e backfill preservam o instante observado e não tornam um preço antigo atual. Sem capturas recentes, faça uma nova captura pelo fluxo autorizado e confira as pendências antes de preparar a divulgação.

Em 14/11/2026 foram aplicadas 20 migrations pendentes e o backfill no Supabase usado pelo localhost, preservando os produtos e o histórico. A leitura autenticada da pauta foi conferida no navegador, sem ativar política v2 ou executores externos. Esse registro não certifica o banco nem o deploy da VPS.

### Produção e extensão — deploy de 14/11/2026

A extensão envia as capturas ao endereço configurado em **Ambiente/Destino**. Capturas enviadas a `https://www.bizuminer.com.br` devem ser conferidas na curadoria desse site. O localhost usa outro banco; publicar o código não copia capturas entre esses ambientes.

O deploy de produção publicou o contexto `contexts-20261114T195205.189663Z`, atualizando somente `garimpa-web` e `garimpa-capture-executor`. Foram aplicadas as 13 migrations de curadoria entre `20261113202044` e `20261114141730`, mais `20261114200500_curation_projection_helper_access.sql`. O backfill preservou as datas observadas; produtos, observações, publicações e decisões existentes permaneceram íntegros. Login HTTPS, recarga autenticada, menu entre curadoria/pauta/operação e consulta de WhatsApp/Stories foram conferidos, incluindo navegação no navegador. O ensaio não executou IA, captura externa ou publicação de ofertas.

Na VPS, o papel de manutenção `supabase_admin` difere do proprietário `postgres` das projeções públicas existentes. Os cinco helpers factuais privados precisam de execução para esses proprietários internos; a migration de compatibilidade concede somente esse acesso e mantém a execução direta proibida para `anon`, `authenticated` e `garimpa_public_runtime`. A falha foi reproduzida e a correção verificada numa cópia PostgreSQL isolada antes da aplicação. O teste de implantação deve abranger as projeções com o papel público real, além das leituras privadas da conta.

Backup, manifesto, validações e recibo estão no diretório privado da VPS `/opt/platform-staging/runtime/releases/garimpa-20261114T194705/`. As imagens anteriores foram retidas com a tag `deploy-rollback-20261114T194705`. Reverter imagens não reverte o schema: confira compatibilidade e novas gravações antes de qualquer restauração do banco. As flags de comparação v2, atributos e conferência adicional Shopee foram preservadas desativadas; o executor de captura existente permaneceu conectado e saudável.

### Falha de autenticação na análise com IA

O botão **Analisar capturas com IA** usa a credencial de IA do servidor. Em 14/11, as execuções `4572b3fc-496d-4abb-8b09-5446584ce825` e `959450b6-320e-4868-9fa0-06c60caa2697` falharam com `openrouter_authentication_failed`; a consulta de metadados `GET /api/v1/key` confirmou `401 — API key expired` tanto para o web quanto para o executor. As capturas existentes permaneceram salvas.

Servidor saudável e `aiCurationReadiness().ready=true` não comprovam validade remota da chave: esse helper valida somente a configuração local. Confira a autenticação pelo endpoint de metadados antes de um ensaio de análise. Não registre a chave ou o corpo completo da resposta. Preserve os limites de gasto e a finalidade da credencial ao substituí-la; a chave local sem limite não equivale à chave de produção limitada a US$ 1.

O histórico distingue **Itens recebidos** de decisões efetivamente salvas, apresenta **Interrompida** nas falhas e mostra o motivo em português. Uma falha de credencial exige atualizar a configuração antes de tentar novamente. Para resultado incerto, confira o histórico e as decisões antes de repetir; mantenha os registros antigos para auditoria.

No ensaio inicial, o usuário autorizou usar a chave local com **limite total de 20 chamadas** no BizuMiner. Essa configuração de teste substituiu o teto monetário anterior somente para esta aplicação: a chave de origem continua com sua configuração no OpenRouter, enquanto o BizuMiner aplica a restrição de quantidade no banco. Naquele ensaio, painel e executor usaram `AI_CURATION_CALL_LIMIT=20`, o mesmo banco e o mesmo contador. A operação normal de produção é descrita abaixo.

A migration `20261114205951_curation_provider_call_limit.sql` cria `curation_provider_call_budget`, `curation_provider_call_reservation` e o comando privado de reserva. A conta do aplicativo não pode alterar ou zerar o contador, nem acessar as tabelas diretamente; `anon`, `authenticated` e o papel público não podem executar o comando. Cada tentativa reserva uma unidade numa transação confirmada **antes** da requisição ao provedor. Falhas e resultados incertos não devolvem a unidade. O contador não se renova por dia, reinício ou implantação, e a impressão criptográfica da chave precisa corresponder à configuração autorizada. Uma chamada pode avaliar até 20 produtos; chamadas não equivalem a produtos.

Os ensaios sem provedor comprovaram 20 autorizações em 30 tentativas concorrentes, bloqueio das seguintes, persistência entre sessões e proteção contra duplicação ou reset pelo aplicativo. As imagens finais de web e executor também bloquearam os dois caminhos de IA (triagem e atributos) contra um contador isolado esgotado, sem enviar requisição ao provedor. Recibos, backup e rollback ficam em `/opt/platform-staging/runtime/releases/triage-auth-budget-20261114/`. As flags dos executores opcionais v2 permaneceram desativadas.

O aceite real foi feito pelo botão da curadoria em produção: execução `2892bca7-ad1f-4b1f-9fea-3fc1dc32182c`, concluída em 14/11/2026 às 18:16 de Brasília, com 100 produtos processados (96 anotados para revisão e 4 rejeitados), sem aprovação automática. Foram utilizadas 5 chamadas, restando 15 no contador naquele momento. Produtos, observações de preço e publicações existentes foram preservados. A tela confirmou o resultado e a navegação não registrou novos erros de console. O histórico usa horário explícito de Brasília e só calcula a idade relativa após a hidratação no navegador.

`npm run dev` usa `.next-dev` por padrão; `next build` continua usando `.next`. A separação impede que um build apague os chunks de um servidor de desenvolvimento em execução. `BIZUMINER_DIST_DIR` explícito prevalece: use diretórios diferentes se executar os dois processos ao mesmo tempo.

### Processamento local de atributos v2

O executor de atributos permanece desligado por padrão. Quando sua ativação for autorizada, ele exige `CURATION_COMPARISON_ENABLED=true` e contas explícitas em `CURATION_COMPARISON_TENANTS`; `CURATION_ATTRIBUTE_WORKER_ENABLED=true` e `CURATION_ATTRIBUTE_TENANTS` habilitam o processamento apenas para um subconjunto dessas contas, que também devem constar de `CAPTURE_WORKER_TENANTS`. `CURATION_ATTRIBUTE_DAILY_CALL_LIMIT` limita chamadas por conta por dia, entre 1 e 1000. O provedor e o modelo são escolhidos pela configuração de IA existente; a credencial não deve ser registrada neste manual.

O limite conta chamadas em lotes de até vinte itens, não produtos. Uma execução interrompida ou de resultado externo desconhecido vai para reconciliação e não é reenviada automaticamente; verifique o estado antes de decidir qualquer nova tentativa. Falta de credencial válida deixa a avaliação pendente. Essas opções não iniciam sozinhas um processo nem demonstram que a integração foi testada ou ativada.

Quando disponível, o avaliador usa até cinco exemplos de decisões humanas com motivo explícito e título registrados no retrato da decisão, excluindo o conjunto de avaliação reservado, os produtos do próprio lote e equivalentes confirmados. O conteúdo e a revisão desses exemplos ficam registrados com a avaliação; aprovações da IA não são convertidas em exemplos humanos.

A reconsideração de rejeições automáticas antigas também fica desligada por padrão. `CURATION_RECONSIDER_LEGACY_ENABLED=true` permite ao executor de comparação processar lotes limitados apenas nas contas da lista autorizada com política v2 ativada. O processo registra a decisão anterior e devolve candidatos elegíveis ao estado pendente; não publica nem remove veto humano ou bloqueio de segurança. Ativar a variável exige decisão operacional posterior e não faz parte da implementação local.

A conferência oficial da Shopee também fica desligada por padrão. Para uma ativação futura autorizada, use `SHOPEE_VERIFICATION_ENABLED=true`, relacione somente as contas autorizadas em `SHOPEE_VERIFICATION_TENANTS` e defina `SHOPEE_LOOKUP_DAILY_LIMIT`. Cada conta precisa constar também das listas de comparação e do executor. A ausência ou inconsistência da lista impede a habilitação; a configuração isolada não demonstra que houve consulta ou ensaio.

### Recaptura dirigida local

A recaptura fica fechada por padrão. Para uma ativação futura autorizada, o serviço web precisa de `EXTENSION_CAPTURE_ENABLED=true`, `RECAPTURE_PROTOCOL_ENABLED=true` e `RECAPTURE_SCOPE` com pares de conta e fonte separados por vírgula, por exemplo `conta-a/mercadolivre,conta-b/amazon`. As fontes aceitas são `mercadolivre`, `amazon` e `aliexpress`; as opções existentes de captura por loja continuam aplicáveis. Uma lista vazia ou com item inválido mantém a recaptura fechada.

O executor também precisa da mesma lista de contas e fontes, de `RECAPTURE_PLANNER_ENABLED=true` e da conta na lista de comparação já descrita. `RECAPTURE_LISTING_DAILY_LIMIT` define o limite diário de listagens; `RECAPTURE_PDP_DAILY_LIMIT` tem padrão 30 e aceita até 40. A sessão conserva seus próprios limites. Não adicione credenciais às listas ou ao manual.

Enquanto houver acompanhamentos com conferência pendente, a reserva de páginas preserva até um quarto do limite diário por tipo, arredondado para cima, para esse trabalho. A consulta Shopee também prioriza essa parcela para acompanhamentos elegíveis; uma consulta agrupada pode atender pedidos editoriais e acompanhamentos ao mesmo tempo. O painel mostra quantas reservas incluíram acompanhamento. A reserva não amplia o limite total e não garante atendimento antes do vencimento.

Na extensão, a pessoa escolhe a loja e o intervalo entre ações ao iniciar a sessão, e pode pausá-la ou cancelá-la. O intervalo escolhido permanece com a sessão, inclusive após retomada; para alterá-lo, inicie outra sessão. Sem a permissão opcional para a loja, pode usar o modo assistido na aba ativa. Login, bloqueio, ausência de preço, falta de URL segura e cota esgotada mantêm a conferência pendente; não demonstram indisponibilidade do produto. Pausar as flags interrompe novas ações dirigidas, mas não elimina fatos, acompanhamentos ou declarações de envio. Essas instruções descrevem o código local e não comprovam instalação, ativação ou ensaio real.

### Curadoria automática em produção — 14/11/2026

A autorização posterior do usuário restringiu o teto total de vinte chamadas ao **ambiente de teste**. Na operação normal, web e executor usam `AI_CURATION_CALL_LIMIT=platform`, aceito somente com `NODE_ENV=production`; isso não consome nem zera o contador histórico do ensaio. O modo de teste `20` continua disponível e protegido. Lotes, reservas diárias, deduplicação por fatos/modelo e reconciliação de resultados incertos continuam sendo proteções operacionais, sem exigir autorização a cada lote.

O fluxo ativo avalia atributos v2, incorpora decisões humanas, calcula mérito relativo e seleciona ofertas por vagas, diversidade, família, configuração de compra, preço vigente e vínculo de afiliado. Elegibilidade no catálogo não garante destaque. As notas legadas de 1 a 5 não viram aprovação v2; a ação antiga de análise apenas sinaliza o executor quando a política automática está ativa. A página passa a mostrar a fila automática e as exceções efetivas; a revisão manual do catálogo é opcional.

A integração prepara rotas locais de afiliado para Amazon e Mercado Livre após avaliação compatível e elegibilidade. Ela exige a configuração ativa da própria conta, não reativa publicações inativas, não cria evidência de preço e não dispara contato com a loja. O AliExpress continua sem vínculo configurado nesta conta e fica fora da seleção pública até essa configuração existir.

A migration `20261114235526_legacy_browser_observation_provenance.sql` identifica importações antigas da extensão com procedência `browser`, marketplace e URL de produto correspondentes e página de origem reconhecida. Registra o método conservador `listing`, com marcador de origem da compatibilização; preserva opção, valor e horário observado. Não transforma listagem em página de produto nem consulta antiga da Shopee em `id_lookup`. Na cópia nativa, 368 observações passaram pela validade factual original após essa compatibilização.

O ensaio PostgreSQL com o papel real do executor encontrou uma trava `FOR SHARE` sobre avaliações que só permitem leitura e inserção. A composição agora trava apenas produto, decisão e projeção mutáveis; a avaliação permanece imutável. Não foi concedida permissão de edição à aplicação. As imagens finais passaram no ensaio isolado com 24 destaques, preparação idempotente de rotas e preservação de publicação expirada, sem requisições de IA no ensaio.

Contexto final: `contexts-20261115T000434.845175Z`. Evidências privadas do build, cópia de ensaio e aceite ficam em `/opt/platform-staging/runtime/releases/automatic-curation-20261115/`; a tentativa inicial reverteu preventivamente as imagens ao detectar um deploy independente do PostSpark em paralelo. A retomada preserva esse deploy e mantém somente os dois serviços BizuMiner no comando Compose, com backup e recibo próprios em `/opt/platform-staging/runtime/releases/automatic-curation-20261115-retry/`. O banco de ensaio contém avaliações simuladas e não deve ser confundido com o resultado editorial real da produção.

Ativação real confirmada em 14/11 às 21:14 de Brasília. A interface da pauta foi atualizada separadamente com `contexts-20261115T001707.913943Z`, sem reiniciar o executor. Web e executor saudáveis usam o modo `platform`; o contador histórico de teste permaneceu em 10. A leitura autenticada comprovou ofertas em WhatsApp e Stories; na conferência posterior, WhatsApp apresentou 12 ofertas e as pendências passaram a indicar processamento automático, sem atribuir uma decisão humana a todo item ainda na fila. Não houve envio de mensagens ou confirmação de divulgação. Às 21:22, havia 429 produtos avaliados e 22 chamadas operacionais, comprovando continuidade além do teto de teste; a carga inicial restante continuou no executor durável, sem erro de projeção. Os destaques podem variar enquanto os novos lotes alteram a competição.

A cópia temporária PostgreSQL `garimpa_auto_verify_20261115` foi removida após o aceite; backups e recibos privados foram preservados. Typecheck, testes do provedor/modo de teste e jornadas SQL T01–T08 passaram; o aceite nativo complementar utilizou as imagens de produção com os papéis reais, sem ampliar a permissão das avaliações imutáveis.

## 5. Auditoria da jornada operacional em 15 de novembro de 2026

A captura, a avaliação automática e a pauta têm registros reais em produção, mas a interface ainda não permite ao responsável acompanhar uma operação e resolver suas pendências de ponta a ponta. Há defeitos de integração e de navegação além da organização do menu. A prioridade proposta é tornar confiável a jornada de captura, curadoria e pauta, reutilizando a persistência existente.

### Escopo e comprovação

Foram percorridas, com a sessão existente da conta **BizuMiner (casa)**, as telas Hoje, Operação, Curadoria, histórico da IA, pauta de WhatsApp e Stories, filtro AliExpress e o detalhe de uma oferta bloqueada. As consultas SQL usaram transações `READ ONLY`, filtros explícitos de `tenant_id='local'` e limites de tempo. Dez arquivos relevantes do checkout tiveram hashes iguais aos arquivos do contêiner web em produção. As [evidências da auditoria](evidencias-auditoria-operacao-2026-11-15.json) conservam consultas, horários, contagens, fontes e reprodução dos caminhos.

Os retratos SQL principais foram obtidos às 17h01, 17h04 e 17h07 de Brasília. A operação existente continuou durante a observação; contagens de retratos diferentes não representam uma única transação. Não foram iniciadas capturas, avaliações, novas tentativas, liberações de reconciliação, decisões editoriais ou envios para testar a jornada. Recuperações foram inspecionadas na interface e no código. O escopo não inclui homologação mobile, isolamento entre contas ou revisão completa dos módulos comerciais e de marketing.

### O que aconteceu com as capturas de hoje

| Fonte | Registro confirmado | Observações de preço | Produtos distintos |
| --- | --- | ---: | ---: |
| Mercado Livre | 3 recibos da extensão entre 13h03 e 13h04 | 149 | 145 |
| Amazon | 3 recibos da extensão entre 13h04 e 13h05 | 205 | 153 |
| AliExpress | 3 recibos da extensão às 13h06 | 144 | 99 |
| Shopee | Lote solicitado às 13h06 e encerrado às 13h12, com 12 buscas | 220 itens somados nas buscas | 216 |

As nove importações manuais geraram **498 observações sobre 397 produtos distintos**. As observações não têm `capture_run_id`, mas os recibos persistem em `extension_capture_receipt` com os produtos importados. Isso permite reconstruir o recebimento sem inventar rodagens nem agrupar páginas apenas pela proximidade de horário. Contagens por recibo não são contagens de produtos novos; há reencontros entre páginas.

Às 17h04, todos os 397 produtos das importações manuais tinham alguma avaliação registrada, sem job ativo ou em reconciliação. Essa cobertura não significa que uma nova chamada de IA tenha sido necessária para cada observação, nem garante aprovação ou presença na pauta. A reutilização de avaliações é parte do fluxo. Três produtos Amazon desse conjunto ainda estavam `pending` no catálogo.

O lote Shopee `488698fe-32ea-48cc-9828-7b8dfc63ac24` terminou `partial` por `affiliate_links_pending`; suas 12 buscas terminaram `ok`. O resumo do lote gravou `attribute_queue` com zero encaminhados, enquanto a avaliação automática continuou independentemente. Às 17h07, 203 dos 216 produtos tinham alguma avaliação, 13 tinham jobs em reconciliação e 212 tinham publicação web ativa com URL afiliada preenchida. As quatro ausências de vínculo e as 13 avaliações incertas são dimensões diferentes; não devem ser somadas como produtos distintos.

A pauta carregou **12 ofertas para WhatsApp e 8 para Stories**, com itens de Amazon, Mercado Livre e Shopee. O AliExpress não tinha configuração afiliada nesta conta; os 12 primeiros itens observados no seu filtro explicavam a exclusão pela falta de vínculo válido. Capturar novamente não é uma solução demonstrada para essa ausência de configuração.

### Problemas confirmados e correções mínimas

**Alta prioridade — Hoje e o histórico da IA não representam o motor atual.** Hoje mostrou “Triar 33 produtos com IA”, aprovação por nota 4 e 34 pendências manuais. A Curadoria mostrou 1.081 produtos avaliados pela automação v2 e trabalho ativo. O resumo de operação consulta o último lote, `triage_run` e runs recentes; não consulta `curation_attribute_job`. O histórico da IA também lê a triagem anterior e eventos legados, apresentando como última execução 14/11 às 20h31. Isso pode induzir nova triagem e faz trabalho atual parecer ausente. A correção mínima é projetar o estado do motor ativo em Hoje e no histórico, distinguindo fila, processamento, avaliação reutilizada, resultado incerto e espera por conferência. O acompanhamento deve atualizar enquanto houver trabalho, com data da leitura e erro de consulta explícitos, sem polling ocioso permanente. Fontes: [resumo de operação](../../packages/web/lib/today-operation-db.ts), [Hoje](../../packages/web/app/admin/today-command-center.tsx), [histórico](../../packages/web/lib/editorial-compass.ts) e [fila v2](../../packages/web/lib/curation-automation.ts).

**Alta prioridade — o histórico omite as importações manuais e perde a captura solicitada entre conferências internas.** Mercado Livre mostra “Nenhuma rodagem registrada ainda”, Amazon não tem seção de rodagens e os recibos da extensão não são consultados. As 20 execuções recentes da Shopee eram `verification`; a captura com 12 buscas já não aparecia nessa janela. A interface traduz esse modo como “AVULSA”, embora os dados identifiquem sua finalidade. A correção mínima é reunir recibos manuais e lotes API em uma consulta de atividades, preservando suas identidades, e oferecer conferências internas como detalhe ou filtro. A pessoa deve localizar o lote solicitado, suas páginas, quantidades e pendências mesmo após novas verificações. O histórico de produtos das últimas 48 horas, hoje dentro da pauta, é uma visão útil diferente do histórico de operações. Fontes: [recibos](../../packages/web/lib/extension-db.ts), [consulta de rodagens](../../packages/web/lib/admin-db.ts), [painéis](../../packages/web/app/admin/page.tsx) e [rótulos](../../packages/web/app/admin/admin-panel.tsx).

**Alta prioridade — o detalhe oferecido para resolver um bloqueio redireciona e perde o produto.** A oferta UGREEN no histórico AliExpress informa falta de vínculo e oferece “Ver detalhes da oferta”. O destino `/admin/ofertas/01ce73ff-caa9-4975-b15d-c09c048d9dbe?conta=local#confirmar-opcao-01ce73ff-caa9-4975-b15d-c09c048d9dbe` redirecionou para `/admin/curadoria?aba=selecao`. O layout exige o workspace comercial, desligado na conta atual, mesmo para os links de operação emitidos pela pauta. A ação não chega à conferência prometida. A correção mínima é encaminhar a revisão a uma superfície autorizada para a operação desta conta, preservando produto, opção, motivo e conta. Não se deve remover o gate comercial global para corrigir esse caminho. Links de produtos em reconciliação e outros pontos que usam `/admin/ofertas` também precisam ser conferidos. Fontes: [gate do detalhe](../../packages/web/app/admin/ofertas/layout.tsx) e [links da pauta](../../packages/web/app/pauta/pauta-client.tsx).

**Alta prioridade — pendências técnicas reais ficam fora do contador de exceções e da orientação de recuperação.** A Curadoria mostrou “Exceções: 0” ao lado de 13 avaliações incertas da Shopee. A liberação existe, mas fica em “Configurações e diagnóstico → Operação da curadoria → avaliações aguardando conferência”. O resumo não oferece acesso direto a esses casos. O worker preserva a trava de incerteza, porém seu tratamento genérico não registra ali a causa original detalhada da falha. A correção mínima é separar exceções editoriais de problemas de execução e apresentar ação, evidência disponível e impacto de repetir a chamada. A investigação não determinou a causa das 13 ocorrências; não há prova de que seja necessário repetir a captura. Preservar a exigência de conferência e justificativa antes de outra tentativa. Fontes: [curadoria](../../packages/web/app/admin/curadoria/page.tsx), [operação](../../packages/web/app/admin/curadoria/operations-metrics.tsx), [liberação](../../packages/web/app/admin/curadoria/attribute-reconcile.tsx) e [worker](../../packages/web/lib/curation-attribute-worker.ts).

**Média prioridade — o resultado parcial da captura não conduz ao problema que resta.** O resumo avisa falha em parte do lote, mas as buscas podem estar todas `ok`; neste caso o problema registrado é de vínculo afiliado. A tela oferece contagens de encaminhamento congeladas no encerramento e um histórico dominado por consultas posteriores. A correção mínima é separar recebimento dos fatos, preparação de vínculos, avaliação e seleção, mostrar quantos itens continuam bloqueados e levar à ação correspondente. O resultado histórico da captura deve permanecer preservado; a evolução posterior precisa aparecer separadamente. Repetir a operação completa não deve ser a orientação padrão.

**Média prioridade — os indicadores por loja confundem catálogo, frescor e pauta.** O bloco “Ofertas <3h na pauta” conta produtos com observação recente e curadoria `approved`, sem medir a seleção efetiva do canal. O mesmo bloco omite AliExpress. A tabela Plataformas classifica AliExpress pela API desligada e pode mostrar zero produtos ativos/recentes apesar das importações manuais. Depois de três horas, Hoje já pede rodagem de Amazon e Mercado Livre, enquanto a pauta ainda aceita ofertas dessas capturas sob suas próprias regras de validade. A correção mínima é apresentar separadamente recebimento recente, elegibilidade no catálogo, seleção em cada canal e validade factual; incluir as quatro lojas e distinguir capacidade manual de API. Fontes: [saúde das lojas](../../packages/web/lib/today-operation-db.ts), [classificação](../../packages/web/lib/today-operation.ts), [registro de marketplaces](../../packages/web/lib/marketplaces.ts) e [plataformas](../../packages/web/app/admin/platform-status.tsx).

**Média prioridade — a hierarquia prioriza controles técnicos e mistura configuração com rotina.** O menu tem 11 destinos principais; Operação fica em Sistema. Na página de rodagens, o histórico antigo do GitHub e formulários do motor de disparo, com identificadores e parâmetros técnicos, aparecem antes das capturas por loja. “Configurações” abre critérios editoriais, enquanto conexões das lojas ficam em Primeiros Passos. O filtro da bancada omite Amazon, embora mostre produtos Amazon. Esses caminhos exigem conhecimento interno e ampliam a procura no chat. A correção mínima é priorizar o trabalho diário e oferecer ferramentas administrativas em acesso secundário, sem eliminar capacidades nem misturar papéis de contas. O começo deste manual também apresentava como desativado um motor cuja ativação estava registrada ao final; o quadro inicial foi reconciliado nesta auditoria. Fontes: [menu](../../packages/web/app/_components/admin-shell.tsx), [operação](../../packages/web/app/admin/page.tsx) e [bancada](../../packages/web/app/admin/workbench-interactive-table.tsx).

### Direção proposta para a revisão

O [plano de implementação da revisão operacional](plano-integracao-captura-curadoria-vitrine-pauta.md#21-plano-de-implementação-da-revisão-operacional-do-painel), consolidado em 15/11/2026, detalha os esboços de telas, estados, compatibilidade dos recibos, cinco fases de execução e critérios de aceite. As evidências de cada achado continuam sendo a referência do problema; a sequência de implementação fica naquele plano existente.

O fluxo principal deve responder, na mesma conta, **o que recebi, o que está acontecendo, o que depende de mim e o que posso divulgar**. A navegação inicial proposta é Hoje, Capturas, Curadoria, Pauta e Resultados. Marketing e Campanhas podem compor uma área de conteúdo; conexões e critérios precisam de entradas claras em Configurações; Governança, Experimentos e diagnóstico técnico podem ter acesso secundário. A frequência real de uso deve orientar essa organização; a auditoria não demonstra que essas capacidades devem ser excluídas.

Hoje deve combinar atividades recentes identificáveis, processamento em curso, problemas acionáveis e disponibilidade por canal. Uma pauta disponível pode coexistir com avaliações pendentes. O registro de uma captura deve permanecer consultável após fechar o navegador e mostrar etapas independentes, quantidades com denominadores claros e última atualização. “Sem trabalho ativo”, “consulta indisponível”, “aguardando sua ação” e “pauta disponível” não são estados equivalentes.

Capturas deve reunir o início das modalidades disponíveis e seu histórico real. Curadoria deve mostrar o processamento atual, resultados e revisões opcionais, com separação visível entre problema técnico e decisão editorial. Pauta deve continuar permitindo escolher o canal, conferir condições e preparar a divulgação, explicando exclusões sem exigir busca por configurações internas. Consultas de status e abertura de telas não devem repetir chamadas de IA nem consultas às lojas.

A persistência existente já fornece recibos, produtos, observações, jobs, avaliações, projeções, promoções e histórico de seleção. A implementação deve primeiro compor essas fontes e identificar lacunas específicas de correlação, estados ou diagnóstico. Não há evidência para exigir uma sessão editorial global, uma nova cadeia de OS ou a substituição do motor. Avaliação reaproveitada não pode ser apresentada como chamada nova; avaliação existente não garante validade atual ou vaga na seleção.

### Ordem de correção e critérios de aceite

1. Corrigir os desvios de navegação e a apresentação do motor ativo, mantendo gates comerciais, isolamento da conta, limites, deduplicação e trava de resultados incertos.
2. Integrar recibos e lotes em atividades consultáveis, com separação entre captura solicitada e conferência interna, e conectar falha ao caminho de resolução.
3. Reorganizar Hoje e o menu a partir dessa jornada; reconciliar indicadores e orientações antigas na interface e no manual.

O aceite deve reproduzir a jornada das quatro lojas: localizar os recebimentos, distinguir observações de produtos novos e repetidos, acompanhar avaliação nova ou reutilizada, reconhecer uma falha parcial, abrir o item exato e consultar a pauta por canal. Fechar e reabrir o painel deve preservar a compreensão da operação. Casos sem ofertas precisam explicar se há processamento, bloqueio de vínculo, evidência vencida, exclusão editorial ou ausência de vaga. Uma falha de consulta não pode parecer fila vazia. A recuperação deve conservar fatos e evitar repetir efeitos incertos sem conferência. Os testes de mutação dessa etapa precisam de ambiente e operações adequadamente autorizados.

Os workflows `capture-offers.yml`, `discover-shopee.yml` e `monitor-prices.yml` foram reconsultados no GitHub e estão `disabled_manually`. As políticas de monitoramento e descoberta desta conta não tinham registros; o painel de cron mostra pausado por padrão. As 71 consultas Shopee identificadas como `verification` pertencem ao processamento de conferência observado, não a novas descobertas demonstradas. Esses estados precisam aparecer com nomes distintos no painel. A auditoria não alterou nenhum agendamento, serviço, credencial, política ou dado operacional.

### Correção inicial implementada localmente em 15/11/2026

A fase 1 da [revisão operacional](plano-integracao-captura-curadoria-vitrine-pauta.md#216-sequência-de-implementação) está implementada, ainda sem publicação em produção. Na versão local, Hoje mostra a avaliação automática quando a política v2 está ativa; iniciar a triagem antiga e decidir manualmente todo o catálogo deixam de ser instruções da rotina v2. Os números são um retrato da consulta, sem garantir que uma fila já tenha começado a executar.

O caminho **Curadoria → Avaliações incertas** abre diretamente as pendências de execução; o contador não representa exceções editoriais. O dono pode conferir o produto e justificar uma eventual nova tentativa pelo controle já existente. Resultado incerto não confirma falha sem consumo e pode ter gerado custo; abrir a tela não libera o job.

Os links operacionais da Pauta e das pendências levam a **Conferir oferta**, sob Curadoria, preservando conta e retorno. O detalhe mostra dados recebidos, conexão e motivos da seleção vigente por canal. Se a opção do link não corresponde mais à opção atual, a tela avisa e exige abrir a opção atual antes de uma nova conferência. A consulta não prepara links nem altera avaliações. Na entrega da fase 1, captura unificada, acompanhamento contínuo e reorganização completa do menu permaneciam pendentes nas fases seguintes. Os agendamentos continuam suspensos.

### Histórico de recebimentos implementado localmente em 15/11/2026

A fase 2 acrescenta **Capturas** (`/admin/capturas`): localize importações da extensão e lotes, filtre por loja/data/origem/situação e abra o detalhe. **Hoje → Capturas recebidas recentemente** mostra os seis recebimentos mais recentes. O filtro padrão deixa conferências automáticas e acompanhamento de preço em separado; selecione **Finalidade → Conferências e acompanhamento** para consultá-los. Um lote conserva o conjunto de suas buscas mesmo depois de novas conferências.

No detalhe, **Resultado registrado do recebimento** é histórico. Observações salvas, produtos distintos, itens recusados na entrada e produtos novos têm medidas próprias. Os novos recibos preservam essas contagens; nos antigos, “Não registrado” é diferente de zero. Em **Produtos e fatos desta captura**, o preço daquela captura só aparece quando a associação é demonstrável, separado do último preço conhecido. **Conferir situação atual e impedimentos** abre a oferta e conserva o retorno à captura e seus filtros. A avaliação e a pauta continuam sendo etapas posteriores, com os acessos da fase 1; o acompanhamento contínuo será integrado na fase 3.

O histórico pode ser consultado por donos e operadores ativos da conta, inclusive após a revogação do dispositivo que enviou os fatos. Isso não autoriza novo envio por dispositivo revogado. Repetir a mesma requisição mantém uma única atividade e seu resultado original. A extensão instalada continua compatível e não requer novo pareamento.

**Estado de publicação:** somente implementação e ensaios locais. A migração aditiva `20261115234320_capture_activity_history.sql` está preparada e testada, sem aplicação remota. Sem essa atualização, a área informa indisponibilidade do histórico, não ausência de recebimentos. As consultas não disparam captura ou IA. Controles anteriores continuam em `/admin?aba=rodagens` e `/admin?aba=captura-manual`. Nenhum agendamento foi reativado.

### Andamento e problemas implementados localmente em 16/11/2026

A fase 3 integra **Hoje**, **Curadoria → Andamento** e o andamento dos produtos da página aberta em **Capturas**. Fila, execução confirmada, espera por prazo/cota, resultado incerto e revisão anterior têm contagens distintas. Uma avaliação registrada pode precisar de atualização; a reutilização só é indicada quando a compatibilidade com os fatos atuais é comprovada. Essas contagens não representam chamadas novas de IA nem vagas garantidas na pauta.

**Curadoria → Problemas para resolver** filtra e pagina resultados incertos, falhas, falta de confirmação, configuração do avaliador, conexão da loja, vínculo afiliado, cota, navegador e prazo. Abra o item para conferir a oferta e volte ao mesmo filtro/página. Os fatos do recebimento permanecem no histórico. O dono pode justificar uma liberação pelo controle existente; o operador não ganha essa autorização. A liberação é auditada e não confirma que uma chamada já começou. Após corrigir credencial Shopee, o controle existente mantém a conferência, justificativa e corte temporal dos pedidos autorizados. Nenhum limite é reiniciado para contornar espera.

O status se atualiza enquanto há trabalho a acompanhar, pausa em aba oculta, espera humana ou erro e faz uma consulta final ao terminar. Se a fila permanece sem mudança e sem execução confirmada por três consultas, o acompanhamento pausa e informa isso; use **Atualizar situação/problemas**, retorne à aba ou execute uma ação conhecida para consultar novamente. Falha de um canal não apaga o outro. “Seleção preparada ainda não consultável” é diferente de pauta vazia; abrir o status não prepara uma edição nova.

O **Histórico da curadoria** contém os registros v2 e mantém a triagem anterior em seção identificada. Para o dono, inclui liberações auditadas conforme a permissão existente. Resultados incertos antigos continuam com causa detalhada não registrada; novos diagnósticos usam somente códigos e categorias sanitizados. Se o avaliador estiver sem configuração válida, o responsável pelo sistema precisa corrigir essa configuração; a tela não solicita segredos nem libera uma chamada incerta automaticamente.

**Estado de publicação:** implementação e verificações locais. A migração `20261116195549_curation_operation_diagnostic.sql` está preparada, sem aplicação remota. O pacote desta fase também altera o worker de atributos para registrar diagnóstico e limite observado; isso não autoriza ativá-lo, alterar cotas ou reativar agendamentos. Na entrega da fase 3, a revisão geral de Hoje/menu/indicadores e o aceite integrado em ambiente nativo permaneciam nas fases 4 e 5; consulte a rotina preparada no início deste manual para a entrega atual.
