# Auditoria Técnica e Operacional do BizuMiner
## Documento 02: O Motor de Curadoria, Inteligência de Preços e Agrupamento

**Data da Auditoria:** 14 de Outubro de 2026  
**Status do Módulo Auditado:** Parcialmente Implementado / Inconsistência Estrutural em Produção  
**Escopo:** Motores de Triagem Determinística e Semântica (`curation-pipeline.ts`, `ai-curation-service.ts`, `triage-value-policy.ts`), Histórico de Preços (`offer-history.ts`, `db.ts`), Classificação de Famílias (`product-family.ts`, `editorial-groups.ts`) e Análise Factual de Decisões no Banco de Dados (`garimpa`).

---

## Sumário Executivo do Módulo

O módulo de curadoria e inteligência de preços é o "coração editorial" do BizuMiner. Sua proposta é receber centenas de produtos brutos extraídos diariamente e selecionar apenas ofertas de alto apelo comercial, seguras e com vantagens financeiras reais.

A auditoria deste subsistema revelou uma dualidade crítica:
1. **A engenharia do pipeline é sofisticada no código**, estruturada em estágios limpos (Hard Filters $\rightarrow$ Anti-Saturação $\rightarrow$ Avaliação Semântica LLM $\rightarrow$ Roteamento e Snapshot). A integração com o Gemini 2.5 Flash é robusta, dotada de fallback de modelos (`gemini-2.0-flash`), retries exponenciais com jitter e schema JSON estrito.
2. **Entretanto, ocorrem falhas de projeto que comprometem a operação em produção:**
   - **Ausência de Teto de Preço:** A triagem determinística possui apenas piso mínimo (R$ 20,00). Não há teto de preço, permitindo que itens de luxo ou maquinário industrial de R$ 5.299,00 passem direto para a vitrine pública de "achadinhos".
   - **Autoridade Desmedida da IA:** Com `auto_publish = true` e nota $\ge 4$, o Gemini 2.5 Flash aprova produtos monocraticamente. Um item sem nenhum histórico comparável pode ser publicado automaticamente na vitrine pública.
   - **Quebra Estrutural do Menor Preço Histórico (`lowest_verified`):** Uma dependência do campo `offer_evidence->>'variantKey'` em consultas SQL (`sameOfferConfigurationSql`) faz com que 100% das 9.017 observações de preço do banco sejam consideradas incomparáveis (`history_comparable = false`). O selo de "Menor Preço Verificado" nunca é emitido, e filtros de menor preço retornam zero resultados.
   - **Agrupamento Frágil (Apenas 37,9% Coberto):** O classificador de famílias é baseado em 10 grupos com palavras-chave estáticas. Como consequência, 62,1% dos produtos (1.029 de 1.657) não possuem família atribuída (`family_key is null`) e furam completamente o filtro de anti-saturação.

---

## 1. O Motor de Curadoria e Decisão (Triage Engine)

O processo de ingestão e triagem é orquestrado pela função `processIngestionPipeline()` em `packages/web/lib/curation-pipeline.ts`. Ele é dividido em quatro estágios sequenciais.

```mermaid
flowchart TD
    subgraph E1["Estágio 1: Hard Filters Determinísticos (Custo Zero)"]
        A[Candidato da Ingestão] --> B{Preço < R$ 20?}
        B -- Sim (sem histórico) --> B1[Held: insufficient_evidence / weak_offer]
        B -- Não (>= R$ 20) --> C{Termos Adultos?}
        C -- Sim (Regex) --> C1[Rejected: adult_sexual]
        C -- Não --> D{Peças Industriais?}
        D -- Sim (Regex) --> D1[Rejected: low_utility]
        D -- Não --> E{Avaliação < 4.0?}
        E -- Sim (ratingStar > 0) --> E1[Rejected: low_quality_listing]
        E -- Não / Nula --> S1[Sobreviventes Estágio 1]
    end

    subgraph E2["Estágio 2: Anti-Saturação por Família"]
        S1 --> F{Possui familyKey?}
        F -- Não (62.1% dos casos) --> S2[Avança sem restrição]
        F -- Sim --> G{Mais de 1 no lote?}
        G -- Não --> S2
        G -- Sim --> H[Seleciona até 3 Representantes por Evidência]
        H --> S2[Representantes Avançam]
        H --> H1[Excedentes: Held family_saturation]
    end

    subgraph E3["Estágio 3: Avaliação Semântica (Gemini 2.5 Flash)"]
        S2 --> I[Monta Lote de até 25 itens com Schema JSON]
        I --> J[Gemini 2.5 Flash + Diretriz Editorial + Golden Examples]
        J --> K{hasMisleadingClaim?}
        K -- Sim --> K1[Rejected: misleading_claim]
        K -- Não --> L{isAdultOrUnsafe?}
        L -- Sim --> L1[Rejected: unsafe_restricted]
        L -- Não --> M{Score <= 2 ou peca_chata?}
        M -- Sim --> M1[Rejected: low_utility]
        M -- Não --> N[Score >= 3]
    end

    subgraph E4["Estágio 4: Roteamento Final"]
        N --> O{auto_publish = true E Score >= minScore?}
        O -- Sim (Ex: Score >= 4) --> P[APPROVED: Vitrine Pública]
        O -- Não (Ex: Score = 3) --> Q[PENDING: Fila de Revisão Humana]
    end
```

---

### 1.1 Matriz de Regras Determinísticas

As regras determinísticas rodam antes de qualquer chamada de LLM, com o objetivo de eliminar candidatos inadequados a custo zero de computação e API.

| Ordem / Prioridade | Nome da Regra | Código Fonte | Critério Exato e Limiares | Ação Resultante | Efeitos Colaterais Identificados |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `invalid_price` | `triage-value-policy.ts` (L32-34) | `!Number.isSafeInteger(priceCents) \|\| priceCents <= 0` | **Reter (`held`)** com razão `insufficient_evidence` | Bloqueia itens com preço zerado ou raspagem corrompida. |
| **2** | `low_value_floor` | `triage-value-policy.ts` (L35-38) | `priceCents < 2000` (R$ 20,00) sem histórico comparável com $\ge 3$ observações e $\ge 7$ dias de histórico. | **Reter (`held`)** com razão `insufficient_evidence` | Bloqueia produtos muito baratos por falta de margem/comissão, a menos que haja desconto comprovado sobre valor anterior $\ge$ R$ 20. |
| **3** | `verified_discount` | `triage-value-policy.ts` (L40-41) | `priceCents < 2000`, porém histórico comparável tem `referencePriceCents >= 2000`, $\ge 3$ obs e $\ge 7$ dias. | **Permite Avanço** (classificado como `verified_discount`) | Como `history_comparable` está quebrado em produção (0 itens têm `variantKey`), **esta exceção nunca é ativada**. |
| **4** | `adult_sexual_blacklist` | `curation-pipeline.ts` (L57-58, 97-106) | Regex insensível a maiúsculas contra o título: `\b(erotico\|erotica\|sexy\|vibrador\|anabolizante\|replica\|lingerie sensual\|masturbador\|dildo\|plug anal\|fantasia sensual)\b` | **Rejeitar (`rejected`)** com razão `adult_sexual` | Bloqueio imediato no Estágio 1. |
| **5** | `low_utility_blacklist` | `curation-pipeline.ts` (L60-61, 109-118) | Regex contra o título: `\b(parafuso\|porca sextavada\|arruela\|cabo extensor generico\|engrenagem\|rolamento\|conector engate rapido\|bico injetor\|bomba hidr[aá]ulica)\b` | **Rejeitar (`rejected`)** com razão `low_utility` | Elimina peças industriais de baixo apelo de vitrine. |
| **6** | `low_rating_threshold` | `curation-pipeline.ts` (L121-131) | `ratingStar !== null && ratingStar > 0 && ratingStar < 4.0` | **Rejeitar (`rejected`)** com razão `low_quality_listing` | Descarta produtos avaliados com nota média inferior a 4.0 estrelas. Itens sem avaliação (`null` ou `0`) passam. |
| **7** | `family_saturation` | `curation-pipeline.ts` (L137-192) + `editorial-groups.ts` | Produtos no mesmo lote com mesma `family_key`. Mantém até `maxRepresentatives` (padrão: 3). | **Reter excedentes (`held`)** com razão `family_saturation` | Seleciona os melhores representantes por evidência e variedade de marketplace. **Efeito colateral grave:** 62,1% dos itens não possuem `family_key` e ignoram este filtro. |
| **NÃO EXISTE** | **Teto de Preço Máximo** | Inexistente em todo o código | Não há limite superior para `priceCents`. | **Nenhum bloqueio** | **Produtos de R$ 5.000 ou R$ 50.000 avançam livremente para a IA.** |

---

### 1.2 O Motor de IA (LLM)

A camada semântica é responsável por entender a desejabilidade comercial do produto, identificar promessas abusivas que burlam regex e categorizar a oferta editorialmente.

#### Configuração Técnica
- **Modelo Primário:** `gemini-2.5-flash` (`DEFAULT_GEMINI_MODEL`).
- **Cadeia de Fallback:** `gemini-2.0-flash` (`DEFAULT_FALLBACK_MODELS`), acionada em caso de erro 503 ("high demand") ou esgotamento de quota transitória.
- **Tamanho do Lote:** 25 produtos por requisição (`AI_CURATION_BATCH_SIZE = 25`).
- **Temperatura:** `0.1` (foco em determinismo, reprodutibilidade e consistência de classificação).
- **Modo de Resposta:** `responseMimeType: "application/json"`, com `responseSchema` validado diretamente na API do Gemini.
- **Estratégia de Resiliência:** 3 tentativas (`maxAttempts: 3`), espera inicial de 1.200 ms, teto de 10.000 ms, backoff exponencial com jitter aleatório para erros transitórios (`408, 429, 500, 502, 503, 504` e falhas de parse de JSON).

#### Prompt de Sistema Completo
O prompt é montado pela função `buildDynamicSystemPrompt()` em `packages/web/lib/ai-curation-service.ts`:

```text
Você é o curador especialista do canal de "Achadinhos" BizuMiner no Brasil.
Sua missão é classificar produtos para garantir que apenas itens desejáveis, viáveis e seguros cheguem à vitrine.

DIRETRIZES DE AVALIAÇÃO:
1. Promessa enganosa / charlatanismo (hasMisleadingClaim):
   - Marque TRUE para cosméticos, suplementos ou itens de saúde que prometem curas rápidas, emagrecimento milagroso, rejuvenescimento irreal ou propriedades terapêuticas mágicas.
2. Segurança e Conteúdo Adulto (isAdultOrUnsafe):
   - Marque TRUE para sex shop, estimulantes, armas, réplicas perigosas, produtos falsificados ou itens ilegais.
3. Desejabilidade (desirabilityScore de 1 a 5):
   - NOTA 5: Gadgets inovadores, soluções inteligentes para o dia a dia, tecnologia prática e presentes criativos com alto fator de compra por impulso.
   - NOTA 4: Bons achadinhos, úteis, com proposta de valor clara e apelo comercial.
   - NOTA 3: Itens úteis, porém comuns (ex: garrafa térmica padrão, suporte de celular articulado comum, pano de microfibra simples).
   - NOTA 1 ou 2: Peças de reposição técnica, insumos industriais, parafusos, ferramentas secas ou itens chatos sem apelo de vitrine.
4. Categoria Editorial (editorialCategory):
   - 'gadget_util': soluções práticas para casa, cozinha, setup ou rotina.
   - 'novidade': produtos curiosos, virais, presentes ou gadgets divertidos.
   - 'peca_chata': cabos genéricos sem diferencial, porcas, parafusos, mangueiras e peças de reposição.
   - 'outro': o que não se enquadrar nos anteriores.
5. Preço promocional e referência verificada:
   - Um preço atual muito baixo não torna o produto sem valor. Quando houver verifiedPriceReference, ela informa o menor preço ANTERIOR observado da mesma configuração, não um preço riscado declarado pelo vendedor.
   - Essa referência permite avaliar uma promoção abaixo do piso; não comprova qualidade, não garante aprovação e não substitui utilidade, segurança ou clareza da compra.
6. Justificativa (justification):
   - Frase concisa e comercial (1 a 2 sentenças, máx 150 caracteres) sintetizando o apelo do produto para o curador.

DIRETRIZ EDITORIAL VIGENTE DO DIRETOR DA LOJA:
"Foco em utilidades práticas de casa, cozinha e gadgets."
Priorize produtos que se alinhem fortemente a esta diretriz e penalize o que desviar dela.

EXEMPLOS REAIS DE CALIBRAÇÃO FEITOS PELO DIRETOR DA LOJA (USE COMO REFERÊNCIA DE CRITÉRIO):
- Produto: "Capa Protetora Solar para Suporte de Celular Universal Contra Sol e Calor" -> APROVADO (Exemplo positivo)
- Produto: "Kit de Iniciação para Mudas - 1/2/3 Conjuntos, 8 Luzes LED de Cultivo, Brilho Ajustável..." -> APROVADO (Exemplo positivo)
- Produto: "Kit De Sachês Para Cuidados Com A Pele SKIN1004 3 Unidades | Seleção De Linhas Mistas" -> APROVADO (Exemplo positivo)
- Produto: "ASX - Tomada Carregador USB Duplo Veicular 12V 24V Carga Rápida..." -> APROVADO (Exemplo positivo)
```

#### Schema Estruturado da Resposta (Gemini Schema)
```json
{
  "type": "ARRAY",
  "items": {
    "type": "OBJECT",
    "properties": {
      "productId": { "type": "STRING" },
      "desirabilityScore": { "type": "INTEGER" },
      "hasMisleadingClaim": { "type": "BOOLEAN" },
      "isAdultOrUnsafe": { "type": "BOOLEAN" },
      "editorialCategory": { 
        "type": "STRING", 
        "enum": ["gadget_util", "novidade", "peca_chata", "outro"] 
      },
      "justification": { "type": "STRING" }
    },
    "required": [
      "productId", 
      "desirabilityScore", 
      "hasMisleadingClaim", 
      "isAdultOrUnsafe", 
      "editorialCategory", 
      "justification"
    ]
  }
}
```

#### Autoridade Decisória da IA
- **A IA aprova e publica diretamente:** Se `editorial_guideline.auto_publish = true` e o `desirabilityScore >= min_score_auto_publish` (configurado como 4 no banco), o produto transiciona de forma instantânea para `status = 'approved'`, com `actor_type = 'llm'`.
- **Condições de Rejeição pela IA:** Se a IA indicar `hasMisleadingClaim = true` $\rightarrow$ rejeitado por `misleading_claim`; se `isAdultOrUnsafe = true` $\rightarrow$ rejeitado por `unsafe_restricted`; se `desirabilityScore <= 2` ou `editorialCategory = 'peca_chata'` $\rightarrow$ rejeitado por `low_utility`.
- **Reter para Avaliação Humana:** Se o score for 3 (ou score $\ge 4$ com `auto_publish = false`), o produto fica com `status = 'pending'`, aguardando um operador na interface web de curadoria.

---

### 1.3 Rastreamento de Decisões Reais no Banco de Dados

#### Caso 1: O Caso da Impressora 3D Bambu Lab A1 Combo (~R$ 5.299,00)
A análise deste caso real demonstra como as fragilidades do pipeline se combinam para gerar falhas comerciais graves em produção.

- **Identificação:** `product_id = '05c1c335-c541-4696-8be6-7b6d0580e257'`, Mercado Livre `MLB7476671028`.
- **Captura:** Realizada em `13/10/2026 17:04:41Z` via extensão de navegador na página de Ofertas do Mercado Livre (`capture_run_id = '820acf6e-d137-4251-bf68-313515d9188b'`).
- **Dados Capturados:** Preço R$ 5.299,00 (`price_cents = 529900`), Preço Original R$ 5.999,00, Desconto declarado 11,67%, Avaliação 4.9 estrelas, 1.000 vendas declaradas.
- **Histórico no Momento:** **1 única observação**, 0 dias de histórico, sem observações comparáveis prévias.
- **Execução da Triagem:** Processado no `triage_run = '3b442a71-a604-4efb-9f76-1e1417ae243a'` em `13/10/2026 17:05:45Z`.
- **Trilha passo a passo nos filtros:**
  1. *Filtro de Preço:* `evaluateTriageValue()` testou se 529.900 $\ge$ 2.000. Como R$ 5.299 $\ge$ R$ 20, retornou `outcome: 'current_price'`. **Aprovado no Estágio 1.**
  2. *Filtros de Blacklist e Avaliação:* Sem termos proibidos, nota 4.9 $\ge$ 4.0. **Aprovado no Estágio 1.**
  3. *Filtro de Saturação de Família:* O classificador verificou as palavras-chave de 10 famílias. "Impressora 3D" não corresponde a nenhuma delas $\rightarrow$ `family_key = null`. **Ignorou totalmente o Estágio 2.**
  4. *Avaliação Semântica (LLM):* O Gemini 2.5 Flash recebeu o título e o preço. Respondeu com `desirabilityScore: 5`, `editorialCategory: 'novidade'` e justificativa: *"Gadget inovador com alto potencial criativo e tecnológico, perfeito para a vitrine de achadinhos."*
  5. *Roteamento e Publicação Automática:* O pipeline consultou `editorial_guideline`: `auto_publish = true` e `min_score_auto_publish = 4`. Como $5 \ge 4$, o item foi **marcado como APROVADO (`status: 'approved'`) com `actor_type: 'llm'`**.
- **Resultado Operacional:** Um produto com ticket de R$ 5.300,00 — incompatível com o conceito de compra por impulso de um canal de achadinhos e sem qualquer histórico que comprovasse a legitimidade do desconto — foi publicado diretamente no catálogo público sem passar por nenhum ser humano.

---

### 1.4 Amostra Representativa de 20 Decisões Reais Auditadas no Banco

A tabela a seguir apresenta 20 decisões tomadas em rodadas de triagem e curadoria reais no banco de dados do BizuMiner, confrontando os dados observados com a lógica do motor:

| # | ID / Título do Produto | Marketplace | Preço Obs. | Histórico Prévio | Resultado Triagem | Agente Decisor | Regra ou Justificativa Registrada | Avaliação Comercial |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | Impressora 3d Bambu Lab A1 Combo (`05c1c335...`) | Mercado Livre | R$ 5.299,00 | 1 obs / 0d | **Aprovado** | LLM | Score 5 / novidade: *"Gadget inovador com alto potencial criativo..."* | **Incorreta:** Ticket exorbitante para compra por impulso de achadinhos. |
| **2** | Celular Motorola Moto G56 256GB (`49a719c6...`) | Mercado Livre | R$ 1.399,00 | 1 obs / 0d | **Pendente** | LLM | Score 3 / outro: *"Smartphone comum, não se destaca como achadinho..."* | **Correta:** Reteve para humano por ser commodity sem diferencial. |
| **3** | Câmera Wi-Fi Externa TP-Link Tapo C320WS (`d0daaf65...`) | Mercado Livre | R$ 209,92 | 1 obs / 0d | **Aprovado** | LLM | Score 5 / gadget_util: *"Câmera Wi-Fi de alta qualidade... gadget essencial"* | **Correta:** Produto aderente ao nicho de automação residencial. |
| **4** | Ventilador De Teto Antuvi 42 Pol. c/ Controle (`0f30509a...`) | Mercado Livre | R$ 327,60 | 1 obs / 0d | **Aprovado** | LLM | Score 4 / gadget_util: *"Ventilador de teto com controle remoto..."* | **Aceitável:** Utilidade para casa, embora ticket seja médio/alto. |
| **5** | Creatina Monohidratada Dark Lab 1kg (`45bfb83f...`) | Mercado Livre | R$ 78,92 | 1 obs / 0d | **Rejeitado** | LLM | Score 2 / outro: *"Suplemento alimentar, foge do foco editorial de casa..."* | **Correta:** IA aplicou a diretriz editorial e eliminou suplemento. |
| **6** | TESTO ESSENCIAL - Fórmula Exclusiva (`2ebce794...`) | Mercado Livre | R$ 56,77 | 1 obs / 0d | **Rejeitado** | LLM | Score 2 / outro: *"Suplemento alimentar, não se enquadra no foco..."* | **Correta:** Filtro semântico barrou estimulante/suplemento duvidoso. |
| **7** | Creatina Soldiers Nutrition 1kg (`02c309c8...`) | Mercado Livre | R$ 65,45 | 1 obs / 0d | **Rejeitado** | LLM | Score 2 / outro: *"Suplemento alimentar, não se alinha com o foco..."* | **Correta:** Descarte consistente de suplementação. |
| **8** | Máquina De Lavar Branca Consul 12kg (`152c008b...`) | Mercado Livre | R$ 1.599,00 | 1 obs / 0d | **Rejeitado** | LLM | Score 2 / outro: *"Eletrodoméstico de grande porte, não se alinha com o conceito..."* | **Correta:** IA reconheceu porte excessivo e descartou. |
| **9** | Ventilador De Teto 6 Vel. Fechamento Retrátil (`dcfebcbe...`) | Mercado Livre | R$ 284,05 | 1 obs / 0d | **Pendente** | LLM | Score 3 / gadget_util: *"Ventilador de teto retrátil com design moderno..."* | **Correta:** Score intermediário enviado para validação de curador. |
| **10** | Varal Dobrável De Chão 3 Andares (`393ac094...`) | Mercado Livre | R$ 78,91 | 1 obs / 0d | **Aprovado** | LLM | Score 4 / gadget_util: *"Solução prática e compacta para secagem de roupas..."* | **Excelente:** Típico achadinho de utilidade doméstica de ticket baixo. |
| **11** | Cesto de Roupa Malha de Nylon Alça (`01d8e578...`) | AliExpress | R$ 23,32 | 1 obs / 0d | **Aprovado** | Humano | Curadoria manual em lote inicial sem IA | **Excelente:** Produto clássico de achadinho com preço baixo. |
| **12** | Produtos mais vendidos 2025 verão (`0000a63c...`) | AliExpress | R$ 0,00 | 1 obs / 0d | **Rejeitado** | Regra | `invalid_price` (preço raspado igual a 0) | **Correta:** Barrou lixo de raspagem na entrada. |
| **13** | A Série Planetária - Lábios Brilhantes (`00030588...`) | Shopee | R$ 0,00 | 1 obs / 0d | **Rejeitado** | Regra | `invalid_price` (preço raspado igual a 0) | **Correta:** Barrou anúncio sem preço válido. |
| **14** | Caixa Organizadora 60x40x30cm Dobrável (`05f1593c...`) | Shopee | R$ 13,99 | 1 obs / 0d | **Retido** | Regra | `insufficient_evidence` (R$ 13,99 < piso R$ 20,00 sem histórico) | **Problemática:** Produto bom de R$ 14 foi barrado apenas pelo piso. |
| **15** | Brincos de anel de jade real verde (`053cbfd3...`) | AliExpress | R$ 25,99 | 1 obs / 0d | **Retido** | Humano | `weak_offer` | **Correta:** Curador julgou apelo comercial insuficiente. |
| **16** | Óculos Fotossensíveis Motocicleta (`02476d05...`) | AliExpress | R$ 78,69 | 1 obs / 0d | **Retido** | Regra | `insufficient_evidence` (sem evidência de desconto confiável) | **Aceitável:** Reteve para acompanhamento. |
| **17** | Suporte telefone bicicleta liga alumínio (`06497fba...`) | AliExpress | R$ 19,99 | 1 obs / 0d | **Aprovado** | LLM | Score 4 / gadget_util: *"Suporte de celular resistente..."* | **Aceitável:** R$ 19,99 aprovado (na margem do piso de R$ 20). |
| **18** | Suporte Veicular IT-BLUE Retrovisor (`00520ce5...`) | Shopee | R$ 32,90 | 2 obs / 3d | **Aprovado** | Humano | Decisão humana direta na fila | **Excelente:** Bom produto para canal de promoções. |
| **19** | Fritadeira Elétrica Air Fryer Mondial (`056d9a92...`) | Shopee | R$ 219,99 | 1 obs / 0d | **Aprovado** | Humano | Decisão humana direta na fila | **Excelente:** Produto campeão de busca e apelo comprovado. |
| **20** | Organizador Armazenamento Metal Multiuso (`03c27e85...`) | AliExpress | R$ 190,59 | 1 obs / 0d | **Aprovado** | Humano | Decisão humana direta na fila | **Correta:** Utilidade para organização doméstica. |

---

### 1.5 Avaliação Crítica do Motor

| Dimensão | O que o motor faz bem | O que o motor faz mal ou não faz |
| :--- | :--- | :--- |
| **Velocidade e Custo** | Elimina 30% a 40% das ofertas lixo antes do LLM a custo zero. O uso de lotes de 25 no Gemini com temperatura 0.1 torna a triagem de IA extremamente barata. | Não faz processamento assíncrono distribuído nem fila de background; todo o lote é processado no mesmo request HTTP. |
| **Filtro Temático e Segurança** | Identifica com alta precisão suplementos, cosméticos com promessas milagrosas e itens sexuais/restritos. | É vulnerável a títulos genéricos em inglês ou anúncios com palavras rebuscadas que enganam o regex. |
| **Critério de Preço** | Protege a margem inferior descartando itens abaixo de R$ 20,00 sem apelo. | **Não tem teto de preço:** aprova produtos de R$ 5.000 ou R$ 10.000 como "achadinhos". Não verifica se o preço é vantajoso de fato. |
| **Governança Editorial** | Injeta a diretriz do diretor (`editorial_guideline`) e golden examples humanos nas chamadas de IA. | Permite que a IA aprove produtos monocraticamente (`auto_publish = true`) sem que nenhum operador valide o anúncio. |

---

## 2. Inteligência de Preços e Ofertas

### 2.1 O que o Sistema Efetivamente Sabe Sobre Preços

A auditoria dos dados de preços nas tabelas `garimpa.price_observation` (9.017 registros) e `garimpa.product` (1.657 registros) revelou as seguintes características operacionais:

1. **Fontes de Dados:**
   - Mercado Livre: Dados raspados via extensão Chrome no DOM da página de ofertas (`/ofertas`).
   - Shopee e AliExpress: Dados obtidos via scrapers/APIs internas a partir de listagens públicas de termos buscados.
2. **Granularidade e Frequência:**
   - A coleta é **pontual e esporádica**, dependente de rodadas de captura disparadas manualmente ou em lotes de teste (`capture_run`).
   - Não existe um cron contínuo que monitore o preço de um produto individual a cada X horas. Dos 1.657 produtos, 78% possuem menos de 3 observações registradas.
3. **Mecanismo de Comparação:**
   - A comparação é feita **exclusivamente dentro do mesmo registro de produto** (`product_id`), que por sua vez é indexado apenas pela tupla `(tenant_id, marketplace, external_id)`.
   - **Não há comparação cross-marketplace:** O sistema não sabe se uma fritadeira Mondial na Shopee por R$ 219 está mais barata ou mais cara que a mesma fritadeira no Mercado Livre ou na Amazon.
   - **Não há uso de EAN, GTIN ou UPC:** Códigos de barra universais não são capturados e não são indexados.
4. **Condições Comerciais Adicionais:**
   - **Frete:** Completamente ignorado. Um produto de R$ 25 com frete de R$ 40 é avaliado como se custasse R$ 25.
   - **Forma de Pagamento:** Não distingue preço no Pix versus parcelado em 12x. O valor capturado é apenas o número bruto em destaque no HTML.
   - **Cupons e Cashback:** Não há modelagem para descontos aplicados via cupom na tela de checkout.

---

### 2.2 O Bug Estrutural do Menor Preço Histórico (`lowest_verified`)

O sistema possui uma funcionalidade planejada de "Menor Preço Verificado" (`lowest_verified`), cuja finalidade é exibir um selo na vitrine para ofertas que atingiram a mínima histórica observada.

No entanto, a auditoria do código e do banco revelou uma **quebra de contrato completa** que inutiliza a funcionalidade:

#### A Raiz Técnica do Problema
1. No arquivo `packages/web/lib/offer-history.ts`, a função `sameOfferConfigurationSql()` define quando duas observações de preço pertencem exatamente à mesma oferta:
   ```sql
   (${latest}.offer_evidence->>'variantKey' is not null
     and ${historical}.offer_evidence->>'variantKey' is not null
     and ...
   ```
2. Essa cláusula SQL exige expressamente que tanto a observação mais recente quanto a observação histórica possuam a chave `variantKey` dentro do JSONB `offer_evidence`.
3. Na consulta de busca de ofertas em `packages/web/lib/db.ts` (linhas 117 e 136):
   ```sql
   bool_and(${sql.unsafe(configurationComparison)}) as history_comparable
   ...
   (s.history_comparable and s.observation_count >= 3 and s.history_days >= 7 
    and l.price_cents <= s.previous_min_price_cents) as lowest_verified
   ```
4. **Evidência Factual no Banco de Dados:**
   - Total de registros na tabela `garimpa.price_observation`: **9.017**
   - Registros com `offer_evidence` nulo: **8.972 (99,5%)**
   - Registros com `offer_evidence` preenchido (metadados de extensão): **45 (0,5%)**
   - Registros com `offer_evidence->>'variantKey'`: **0 (ZERO)**

#### Consequência Direta
- Como nenhuma observação possui `variantKey`, a expressão SQL sempre avalia para `false` ou nulo.
- O campo `history_comparable` é SEMPRE `false`.
- O campo `previous_min_price_cents` e `min_price_cents` é SEMPRE `null`.
- O selo `lowest_verified` é SEMPRE `false`.
- Quando um usuário na vitrine pública ou o operador no painel ativa o filtro `lowestOnly: true`, **a consulta retorna exatamente ZERO produtos**.

---

### 2.3 O que o Sistema NÃO Sabe Sobre Preços

| Lacuna Identificada | Impacto Comercial para Afiliados | Requisito para Viabilizar |
| :--- | :--- | :--- |
| **Menor Preço Real do Mercado** | O sistema só sabe o menor preço que *ele próprio* observou nas suas raspagens. Se o produto estava 30% mais barato na semana passada antes de ser cadastrado, o BizuMiner não sabe. | Integração com históricos de terceiros (APIs de comparadores) ou monitoramento contínuo de longo prazo. |
| **Diferenciação de Variações** | Variações de voltagem (110V vs 220V) ou tamanho (P, M, G, 1kg vs 500g) muitas vezes têm preços diferentes no mesmo anúncio. O sistema não isola o preço por SKU/variação. | Extração estruturada de atributos da variação (`variantKey`, SKU) no scraper. |
| **Preço Riscado Falso** | Vendedores inflam o preço de tabela para simular "50% de desconto". O sistema armazena `claimed_discount_rate` baseado nesse número inflado sem validar. | Calcular desconto exclusivamente sobre o preço mediano ou mínimo observado nos últimos 30 dias. |
| **Impacto do Frete e Região** | Um "achadinho" de R$ 25 torna-se inviável se o frete para o usuário final custar R$ 35. | Coleta de frete para CEPs de referência (capitais principais) nas coletas automatizadas. |

---

## 3. Famílias de Produtos e Agrupamento

### 3.1 Mecanismo de Agrupamento Existente

O agrupamento tem o papel de evitar que múltiplos anúncios do mesmo produto (ou produtos praticamente idênticos) inundem o canal de divulgação.

O agrupamento atual é executado por `packages/persistence/src/product-family.ts`. Suas características são:
- **Técnica:** Correspondência determinística de palavras-chave no título (`FAMILY_METHOD = "title-keywords"`, versão `v1`).
- **Escopo do Dicionário:** Contém apenas **10 famílias fixas**:
  1. `manoplas_moto` (termos: manopla, punho de moto...)
  2. `unhas_manicure` (termos: unha em gel, polygel...)
  3. `suportes_veiculares` (termos: suporte celular carro, suporte veicular...)
  4. `iluminacao` (termos: luminaria, lampada, fita led...)
  5. `organizacao` (termos: organizador, caixa organizadora...)
  6. `cozinha` (termos: utensilio de cozinha, panela, pote hermetico...)
  7. `carregamento` (termos: carregador, cabo usb, power bank...)
  8. `audio` (termos: fone bluetooth, headset, caixa de som...)
  9. `cuidados_pessoais` (termos: skincare, escova secadora...)
  10. `ferramentas` (termos: furadeira, parafusadeira, alicate...)

#### Cobertura Real no Banco de Dados
A consulta aos 1.657 produtos do banco revelou:
- **Produtos com Família Atribuída:** **628 (37,90%)**
- **Produtos sem Família (`family_key is null`):** **1.029 (62,10%)**

A distribuição entre as 10 famílias é assimétrica:

```text
Distribuição de Famílias no Catálogo:
  organizacao:          131 produtos (20,9%)
  carregamento:         124 produtos (19,7%)
  audio:                 92 produtos (14,6%)
  iluminacao:            80 produtos (12,7%)
  cozinha:               77 produtos (12,3%)
  cuidados_pessoais:     69 produtos (11,0%)
  ferramentas:           32 produtos ( 5,1%)
  unhas_manicure:        17 produtos ( 2,7%)
  suportes_veiculares:    4 produtos ( 0,6%)
  manoplas_moto:          2 produtos ( 0,3%)
```

---

### 3.2 Como Funciona a Deduplicação e o Tratamento de Variações

1. **Deduplicação de Catálogo:**
   - Ocorre unicamente pela restrição de unicidade do PostgreSQL:
     `UNIQUE INDEX product_tenant_id_marketplace_external_id_key ON garimpa.product (tenant_id, marketplace, external_id)`
   - Se o mesmo anúncio for capturado 10 vezes no Mercado Livre, o sistema apenas atualiza o registro existente e adiciona novas observações de preço na tabela `price_observation`.
   - Se 5 vendedores diferentes no Mercado Livre venderem o mesmíssimo produto, o sistema cria **5 produtos completamente independentes**.
   - Se o produto for vendido na Shopee e no Mercado Livre, são criados **2 produtos independentes sem nenhum vínculo entre si**.
2. **Tratamento de Variações (Cores, Voltagens, Kits):**
   - Não há separação por SKU ou variação. O título e a imagem salvos são os que estavam ativos no anúncio no momento da raspagem.

---

### 3.3 Saturação de Família e Regras de Cooldown

O controle de saturação opera em dois níveis:

#### 1. Saturação no Lote de Triagem (`curation-pipeline.ts` L137-192)
- Quando múltiplos produtos pertencentes à mesma `family_key` chegam no mesmo lote de triagem, a função `selectRepresentatives()` seleciona até 3 representantes (`MAX_REPRESENTATIVES_DEFAULT = 3`).
- **Critério de Seleção:**
  1. Primeiro representante: O melhor absoluto por evidência (ordenação: `lowestVerified` $\rightarrow$ `ratingStar` $\rightarrow$ `salesCount` $\rightarrow$ `observationCount`).
  2. Próximos representantes: Diversificação por marketplace (busca o melhor candidato de uma loja diferente da já selecionada).
- **Destino dos excedentes:** São marcados como `status = 'held'` com razão `family_saturation`.

#### 2. Fragilidades Críticas da Saturação
- **Falta de Cooldown Temporal:** Não existe regra de cooldown no banco de dados (ex.: "se já publicamos um fone de ouvido bluetooth há menos de 24 horas, reter novos fones"). A regra só analisa produtos presentes **dentro do mesmo lote de triagem**. Se 5 lotes forem executados em horários diferentes, o mesmo fone pode ser aprovado 5 vezes.
- **Furo do Filtro por Falta de Família:** Como 62,1% dos produtos não têm `family_key`, mais da metade do catálogo avança diretamente para a triagem de IA sem qualquer restrição de saturação.

---

## 4. Síntese do Diagnóstico de Curadoria e Preços

| Componente | Classificação | Resumo Diagnóstico |
| :--- | :--- | :--- |
| **Pipeline de Hard Filters** | **Plenamente Operacional** | Executa rapidamente, descarta lixo e termos adultos com eficácia. |
| **Motor Semântico (Gemini 2.5 Flash)** | **Plenamente Operacional** | Integração impecável com fallback, retry exponencial e schema estrito. |
| **Governança de Aprovação (`auto_publish`)** | **Problemático / Risco Operacional** | Ausência de teto de preço permite aprovação automática de itens de alto valor (R$ 5.300) sem revisão humana. |
| **Inteligência de Preços Históricos** | **Parcialmente Implementada** | Armazena séries temporais por produto, mas sem integração entre lojas e sem dados externos. |
| **Selo de Menor Preço (`lowest_verified`)** | **Inoperante em Produção (Bug)** | Dependência de `variantKey` (inexistente nos scrapers) anula a verificação em 100% dos casos. |
| **Agrupamento de Famílias** | **Parcialmente Implementada** | Dicionário de 10 famílias cobre apenas 37,9% do catálogo. Não há cooldown temporal global. |
| **Deduplicação Cross-Marketplace** | **Inexistente** | Não há matching por EAN, título fuzzy ou embeddings entre lojas diferentes. |
