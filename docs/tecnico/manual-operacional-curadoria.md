# Manual Operacional Diário: Workflow de Curadoria BizuMiner

**Versão:** 1.0 — 08/09/2026  
**Público-alvo:** Afiliado Administrador / Editor-Chefe  
**Meta de tempo diário:** 10 a 15 minutos  
**Objetivo:** Manter a vitrine abastecida com ofertas qualificadas, atraentes e com preços frescos, ensinando a IA progressivamente com baixo esforço cognitivo.

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

1. Abra **Pauta de divulgação** e escolha WhatsApp ou Stories. A lista consulta o catálogo da sua conta a cada atualização. Para entrar, a oferta precisa estar aprovada, ter preço exato em reais observado nas últimas 48 horas e ter um link de afiliado válido.
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

- [ ] **Vitrine viva:** Pelo menos **15 a 30 ofertas ativas** na Seleção do Dia, todas com preço verificado recentemente (< 48h).
- [ ] **Exceções sob controle:** Nenhum grupo repetitivo volumoso acumulado na fila de exceções.
- [ ] **IA calibrada:** 3 a 5 produtos auditados no Spot-Check com *Concordo/Discordo*.
- [ ] **Frescor garantido:** Ofertas desatualizadas foram pausadas ou revalidadas pela nova rodagem.
- [ ] **Destaques compartilhados:** 1 a 3 ofertas publicadas nos canais de comunicação com a audiência.

### Descoberta ampliada da Shopee

A Shopee usa por padrão 12 departamentos, até duas páginas de 20 anúncios por departamento (480 posições de consulta, antes de repetições, páginas incompletas e falhas da fonte). `--keyword` mantém a consulta manual, e `--plan keywords` seleciona explicitamente o plano anterior. A ingestão preserva faixas de preço, gera links afiliados por conta e mantém os produtos existentes por ID. Os limites de descoberta são 50 novos por departamento e 25 por família por consulta; cortes são contados em `itemsSkippedByPolicy`.

O workflow `discover-shopee.yml` executa a descoberta da conta da casa às 09:25 e 21:25 UTC (06:25 e 18:25 em Brasília), separadamente de `monitor-prices.yml`, que acompanha preços por ID. Exige as flags já existentes `MONITORING_ENABLED` e `SHOPEE_CAPTURE_ENABLED`, respeita a pausa da Shopee no painel e pula a rodada se outro lote estiver ativo. Cada execução registra um `capture_batch` e passa pelo mesmo worker de captura, links, triagem e atualização da vitrine. Não envia mensagens ao WhatsApp.

A triagem em lote percorre os candidatos em ciclos de até 200; o teto de três representantes por família não é aplicado antes da IA por padrão. Ofertas avaliadas com nota 3 continuam sinalizadas para decisão editorial quando a nota mínima de publicação automática é 4. Isso é diferente de um produto ainda não avaliado. Falhas em páginas posteriores preservam tanto os produtos já gravados quanto seus contadores no resumo, mantendo a consulta marcada como falha.
