# Manual Operacional Diário: Workflow de Curadoria BizuMiner

**Versão:** 1.0 — 08/09/2026  
**Público-alvo:** Afiliado Administrador / Editor-Chefe  
**Meta de tempo diário:** 10 a 15 minutos  
**Objetivo:** Manter a vitrine abastecida com ofertas qualificadas, atraentes e com preços frescos, ensinando a IA progressivamente com baixo esforço cognitivo.

---

## 1. Visão Geral do Ciclo Editorial

O BizuMiner opera pelo princípio de **curadoria por exceções**:
- A **máquina faz a triagem pesada**: coleta centenas de produtos, descarta itens baratos inúteis (lixo), filtra peças industriais/peças de reposição, agrupa ofertas duplicadas e pré-classifica candidatos promissores com base na diretriz editorial configurada.
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

Com o catálogo do dia aprovado e balanceado:

1. Escolha **1 a 3 "Achados de Ouro"**:
   - Itens com desconto real comprovado, boa avaliação de compradores e apelo visual forte.
2. Copie o link curto ou o link do Bizu (`/p/<code>` ou `/bizu/<slug>`).
3. Dispare nos canais de distribuição:
   - Grupo VIP / Canal do WhatsApp / Telegram
   - Stories do Instagram (@bizuminer)

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
