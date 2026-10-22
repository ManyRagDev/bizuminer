# Auditoria Técnica e Operacional do BizuMiner
## Documento 04: Diagnóstico Consolidado, Prontidão B2B e Diretrizes Estratégicas

**Data da Auditoria:** 14 de Outubro de 2026  
**Status Geral do Sistema:** Laboratório Próprio Funcional / Pré-SaaS (Inapto para B2B Imediato)  
**Escopo:** Avaliação Multi-Tenant (`tenant_id`, RLS, isolamento), Quadro Geral de Maturidade do Sistema, Métricas Operacionais dos Últimos 30 Dias, Top 10 Descobertas e Decisões Estratégicas de Negócio.

---

## 1. Capacidade Multi-Tenant e Prontidão para Plataforma B2B

A visão de longo prazo do BizuMiner prevê sua evolução de uma operação própria de afiliados para uma **plataforma de inteligência comercial como serviço (SaaS B2B)** para outros afiliados e criadores de conteúdo.

A auditoria avaliou a distância técnica real entre a base atual e uma arquitetura multi-inquilino pronta para terceiros.

---

### 1.1 Diagnóstico de Isolamento de Dados

#### Suporte no Banco de Dados vs. Implementação em Código
- **Presença da Coluna `tenant_id`:** O schema `garimpa` possui a coluna `tenant_id` em praticamente todas as 27 tabelas principais (`product`, `price_observation`, `capture_run`, `product_curation`, `curation_event`, `triage_run`, `publication`, `click_event`, `affiliate_account`, etc.).
- **Realidade dos Dados em Produção:**
  - 100% dos 1.657 produtos possuem `tenant_id = 'local'`.
  - 100% das 9.017 observações de preço possuem `tenant_id = 'local'`.
  - 100% das 1.494 publicações possuem `tenant_id = 'local'` e `affiliate_id = 'aff_local'`.
- **Hardcoding no Código de Aplicação:**
  - Em praticamente todas as funções de leitura e escrita (`curation-db.ts`, `db.ts`, `admin-db.ts`, `editorial-compass.ts`), o parâmetro é tipado como `tenantId = "local"` por padrão.
  - Diversos endpoints de API e scripts de manutenção sequer aceitam o tenant como parâmetro, assumindo a string fixa `"local"`.

#### Diagnóstico de RLS (Row Level Security) no Supabase
A análise das migrations de segurança (`20260826030000_garimpa_tenant_rls.sql` e `20260826070000_garimpa_rls_defense.sql`) revelou um achado crítico:
1. O RLS está formalmente ativado nas tabelas via `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
2. No entanto, as políticas atribuídas ao usuário da aplicação (`garimpa_app`) são permissivas e globais:
   ```sql
   create policy tenant_isolation_policy on garimpa.product
     for all to garimpa_app
     using (true)
     with check (true);
   ```
3. **Vulnerabilidade de Isolamento:** O usuário de banco da aplicação possui acesso irrestrito a todas as linhas de todos os tenants. O isolamento multi-tenant depende **100% da disciplina do desenvolvedor** em lembrar de incluir `WHERE tenant_id = ${tenantId}` em cada consulta SQL. Se uma nova rota esquecer esse filtro, haverá vazamento de dados entre clientes.

#### Isolamento de Credenciais de Afiliados
- As tabelas `garimpa.affiliate_account` e `garimpa.affiliate_marketplace_config` foram desenhadas para suportar múltiplas contas com credenciais isoladas (Tracking ID e Tool ID do Mercado Livre).
- A resolução de links no endpoint `/go/[slug]` já possui um caminho (V2) que busca as credenciais da conta proprietária da publicação.
- No entanto, a criação de novos afiliados exige intervenção manual no banco ou no painel `/admin?aba=afiliados`, não havendo fluxo de autoatendimento.

---

### 1.2 O que Falta para se Tornar uma Plataforma B2B (SaaS)

Para que um afiliado externo possa contratar o BizuMiner e utilizar o sistema de forma autônoma e segura, é necessária a construção dos seguintes blocos ausentes:

| Requisito B2B | Situação Atual | O que Precisa Ser Construído |
| :--- | :--- | :--- |
| **Autenticação e Multi-Tenancy** | Usuário único autenticado na aplicação | Gestão de organizações/equipes, login social ou por e-mail, controle de papéis (Owner, Editor, Visualizador) e alternador de contas na interface. |
| **Arquitetura de Catálogo (Compartilhado vs. Isolado)** | Catálogo duplicado por tenant na modelagem atual | **Decisão de Arquitetura Crítica:** Separar o "Data Lake de Ofertas e Preços" (catálogo global compartilhado da plataforma) da "Operação Editorial" (curadoria, vitrines, campanhas e pautas isoladas por cliente). |
| **Onboarding e Gestão de Credenciais** | Formulário cru em tela administrativa interna | Wizard de boas-vindas com configuração guiada de tags de afiliados (Mercado Livre, Shopee, AliExpress, Amazon, Magalu) e teste automático de funcionamento. |
| **Isolamento de Canais e Automação** | Mensagens copiadas à mão para apps pessoais | Configuração de canais próprios por cliente (integração do cliente com seu próprio bot de Telegram ou instância de WhatsApp). |
| **Cobrança e Assinaturas (Billing)** | Inexistente | Integração com Stripe, Asaas ou similar para cobrança recorrente, limites de produtos curados por mês e gestão de planos. |
| **Termos de Uso e Governança LGPD** | Anônimo com hash de IP | Termos de serviço de SaaS, política de privacidade para afiliados terceiros e segregação estrita de logs de cliques. |

---

## 2. Quadro Consolidado de Capacidades do Sistema

A tabela abaixo sumariza o estado técnico e operacional de todos os módulos auditados do BizuMiner, categorizados pelo seu grau de maturidade real:

| Módulo / Funcionalidade | Estado Atual | Esforço Estimado para Completar | Principais Dependências |
| :--- | :--- | :--- | :--- |
| **Captura via Extensão Chrome (DOM)** | **Plenamente Operacional** | Baixo (Manutenção) | Estabilidade dos seletores CSS do Mercado Livre. |
| **Captura Automatizada de Mercado Livre** | **Parcialmente Implementada** | Médio | Depende de proxies residenciais para contornar bloqueios antibot no backend. |
| **Captura via APIs Oficiais (Shopee / AliExpress)** | **Plenamente Operacional** | Baixo | Manutenção de credenciais de desenvolvedor ativas. |
| **Hard Filters Determinísticos** | **Plenamente Operacional** | Baixo | Adicionar teto de preço máximo e regras para novas categorias. |
| **Triagem Semântica com IA (Gemini 2.5 Flash)** | **Plenamente Operacional** | Baixo | Calibração contínua de diretrizes editoriais e exemplos. |
| **Governança de Publicação (`auto_publish`)** | **Problemático / Risco Operacional** | Baixo | Implementar travas de ticket e exigir aprovação humana para ofertas sem histórico. |
| **Histórico Temporal de Preços Próprio** | **Plenamente Operacional** | Baixo | Aumentar frequência e recorrência das capturas. |
| **Selo de Menor Preço (`lowest_verified`)** | **Inoperante em Produção (Bug)** | Baixo (Correção pontual) | Ajustar SQL em `offer-history.ts` ou remover dependência cega de `variantKey`. |
| **Agrupamento de Famílias (Anti-Saturação)** | **Parcialmente Implementada** | Médio | Expandir dicionário para além de 10 famílias ou adotar embeddings semânticos. |
| **Deduplicação Cross-Marketplace** | **Inexistente** | Alto | Implementar extração de EAN/GTIN e matching por título fuzzy/vetorial. |
| **Composer de Mensagens (WhatsApp/Telegram)** | **Plenamente Operacional** | Baixo | Adicionar templates para Instagram, Stories e formatos promocionais variados. |
| **Encurtador de Links e Roteamento (`/p/`, `/go/`)** | **Plenamente Operacional** | Baixo | Adicionar parâmetros de canal dinâmicos nos subIDs (`wpp`, `tg`, `ig`). |
| **Distribuição Automatizada (WhatsApp / Telegram API)** | **Inexistente** | Médio | Contratar/configurar provedor de mensageria (Evolution API, Z-API, Telegram Bot API). |
| **Geração de Criativos Visuais para Redes** | **Inexistente** | Médio | Criar pipeline de renderização gráfica automatizada para imagens verticais/quadradas. |
| **Métricas de Tráfego de Cliques (`click_event`)** | **Plenamente Operacional** | Baixo | Incluir métricas de visualização de página na telemetria. |
| **Telemetria de Vendas, Comissões e Receita** | **Inexistente** | Alto | Integração com relatórios de conversão ou pós-back de plataformas de afiliados. |
| **Ciclo de Aprendizado Comercial da IA** | **Inexistente** | Médio | Injetar dados de cliques e conversões na entrada da triagem semântica. |
| **Isolamento Multi-Tenant Real (RLS e SaaS)** | **Parcialmente Implementada** | Alto | Refatorar RLS para validar claims do Supabase Auth e desacoplar catálogo global. |

---

## 3. Tabela de Indicadores Operacionais (Janela Factual de 30 Dias)

Dados consolidados a partir do banco de dados de produção (`garimpa`) cobrindo o período de **14 de Setembro de 2026 a 14 de Outubro de 2026**:

| Indicador Operacional | Valor nos Últimos 30 Dias | Total Histórico Acumulado | Observação e Contexto Factual |
| :--- | :--- | :--- | :--- |
| **Novos Produtos Ingeridos** | **780** | 1.657 | Média de **26,0 produtos novos por dia**. |
| **Registros de Preço Coletados** | **7.483** | 9.017 | Média de **249,4 observações por dia** (densidade de 9,6 obs/produto recente). |
| **Rodagens de Captura Executadas** | **285** | 385 | 270 com sucesso (`status = ok`), 15 falhas (**taxa de erro: 5,26%**). |
| **Rodagens de Triagem de IA Executadas** | **14** | 17 | 14 com sucesso, 0 falhas (**taxa de sucesso: 100%**). |
| **Produtos Submetidos à Triagem de IA** | **829** | 986 | Volume avaliado nas rodadas do período. |
| — *Aprovados para Vitrine* | **209 (25,21%)** | - | Média de **7,0 produtos aprovados por dia**. |
| — *Retidos para Acompanhamento* | **246 (29,67%)** | - | Retidos por saturação de família ou piso de preço. |
| — *Rejeitados Definitivamente* | **233 (28,11%)** | - | Descartados por baixa nota, promessa abusiva ou utilidade fraca. |
| — *Pendentes com Anotação de IA* | **141 (17,01%)** | - | Score intermediário (3) aguardando curador humano. |
| **Publicações Geradas no Catálogo** | **780** | 1.494 | Publicações associadas à vitrine e links `/bizu`. |
| **Cliques de Saída Registrados (`/go`)** | **505** | 670 | Média de **16,8 cliques por dia**. |
| **Taxa Média de Cliques / Aprovados** | **2,41 cliques/item** | - | Razão entre cliques totais e produtos aprovados no período. |
| **Vendas / Conversões Registradas** | **0** | 0 | Métrica não monitorada pelo sistema. |
| **Comissão Total Rastreada** | **R$ 0,00** | R$ 0,00 | Métrica não monitorada pelo sistema. |

---

## 4. Top 10 Descobertas da Auditoria Técnica e Operacional

As constatações a seguir representam os achados de maior impacto estrutural e comercial identificados durante a auditoria, acompanhados do respectivo nível de evidência comprovada:

| # | Descoberta Factual | Impacto Comercial / Operacional | Grau de Confiança na Evidência |
| :--- | :--- | :--- | :--- |
| **1** | **Bug do Menor Preço Histórico (`lowest_verified` sempre falso):** A consulta exige `offer_evidence->>'variantKey'`, mas 100% das 9.017 observações no banco têm esse campo nulo. | O selo de "Menor Preço Verificado" nunca acende e filtros de menor preço retornam 0 produtos, matando a proposta de valor central. | **Fato Comprovado** (Código-fonte + Query direta no banco). |
| **2** | **Ausência de Teto de Preço e IA sem Supervisão:** O filtro determinístico só tem piso (R$ 20). Com `auto_publish = true` e score $\ge 4$, itens de R$ 5.299 (Impressora 3D Bambu Lab) são aprovados direto para a vitrine com 1 observação. | Publicação de produtos de altíssimo ticket incompatíveis com a compra por impulso de "achadinhos", quebrando a linha editorial. | **Fato Comprovado** (Código em `triage-value-policy.ts` + Registro ID `05c1c335...`). |
| **3** | **Distribuição 100% Manual (Zero Integrações de API Ativas):** Nenhuma linha de código integra WhatsApp Cloud API ou Telegram Bot API. O operador copia texto e links manualmente. | Gargalo físico severo: cada produto publicado consome de 3 a 5 minutos humanos, impedindo escala comercial. | **Fato Comprovado** (Varredura integral do repositório). |
| **4** | **Cegueira Financeira Total (Sem Vendas e Comissões):** O banco de dados só registra cliques (`click_event`). Não há registros de pedidos, receita gerada ou comissões recebidas. | O negócio opera no escuro: a liderança não sabe quais categorias, produtos ou canais geram retorno financeiro real. | **Fato Comprovado** (Schema das 27 tabelas e dados em `garimpa`). |
| **5** | **Ausência Completa de Ciclo de Aprendizado (Feedback Loop):** O motor de triagem da IA e o ranking da vitrine ignoram totalmente os dados de cliques e conversões. | O sistema não aprende com o sucesso ou fracasso das ofertas, mantendo os mesmos critérios sem evolução. | **Fato Comprovado** (Código em `ai-curation-service.ts` e `curation-pipeline.ts`). |
| **6** | **Rastreamento sem Identificação de Canal de Origem:** No redirecionamento monetizado, o parâmetro `subId` recebe apenas o `slug` do produto, sem distinção de canal (`wpp`, `tg`, `ig`). | O lojista (Mercado Livre/Shopee) não consegue reportar qual rede social converteu a venda. | **Fato Comprovado** (Código em `app/go/[slug]/route.ts` e `db.ts`). |
| **7** | **Agrupamento Frágil Cobre Apenas 37,9% dos Produtos:** O classificador tem apenas 10 famílias estáticas por palavras-chave. 62,1% dos itens (1.029 de 1.657) não têm família. | A maioria dos produtos fura a trava de anti-saturação e avança sem controle de saturação para a IA. | **Fato Comprovado** (Código em `product-family.ts` + Query de contagem no banco). |
| **8** | **Deduplicação Restrita ao Mesmo ID de Marketplace:** Não existe correspondência por EAN, título aproximado ou embeddings entre lojas diferentes. | O mesmo produto vendido na Shopee, ML e AliExpress gera 3 registros isolados, sem consolidação de preço. | **Fato Comprovado** (Índices únicos no PostgreSQL e código de ingestão). |
| **9** | **Multi-Tenancy é Decorativo no Código e Inoperante no RLS:** A coluna `tenant_id` existe nas tabelas, mas as políticas RLS usam `using (true)` e o código fixa `"local"` por padrão. | A base não está pronta para receber múltiplos clientes B2B com segurança de isolamento. | **Fato Comprovado** (Migrations SQL + Defaults no código TypeScript). |
| **10** | **Excelente Engenharia de Custo e Resiliência na IA:** O pipeline com Gemini 2.5 Flash opera em lotes de 25 com temperatura 0.1, fallback para 2.0 Flash e retry com jitter exponencial. | O custo de computação e chamadas de IA é extremamente baixo, com taxa de sucesso de 100% nas triagens recentes. | **Fato Comprovado** (Código em `ai-curation-service.ts` + Métricas de execução). |

---

## 5. O que Ainda Precisamos Descobrir (Lacunas de Conhecimento)

A presente auditoria limitou-se aos artefatos disponíveis no repositório, nos servidores e no banco de dados operacional. Permanecem como incógnitas externas que requerem esclarecimento junto ao operador do negócio:

1. **Taxa Real de Conversão de Cliques em Vendas:** Dos 505 cliques registrados nos últimos 30 dias no endpoint `/go`, quantos se converteram em compras efetivas nos painéis do Mercado Livre e da Shopee? Qual foi a receita gerada em comissões?
2. **Desempenho Comercial por Canal:** Quais canais de distribuição (Instagram Stories, Grupos de WhatsApp ou Tráfego Orgânico do site) são os principais responsáveis pelos cliques atuais?
3. **Padrão de Retenção e Engajamento da Audiência:** Qual é a taxa de cliques por visualização (CTR) das mensagens postadas manualmente nos grupos? O público reage melhor a ofertas de ticket baixo (R$ 20 a R$ 60) ou aceita itens de ticket médio (R$ 150 a R$ 300)?
4. **Viabilidade dos Programas de Afiliados dos Marketplaces:** Quais contas de afiliados estão aprovadas e em conformidade? As chaves de API da Shopee e AliExpress continuam com cotas ativas e operacionais junto aos lojistas?

---

## 6. Decisões Estratégicas que Dependem do Dono do Produto

Antes de elaborar qualquer novo plano de implementação de software ou refatoração, a liderança executiva do BizuMiner precisa deliberar e definir as seguintes diretrizes de negócio:

### Decisão 1: Posicionamento Estratégico do Produto
- **Opção A (Laboratório Próprio Otimizado):** Focar 100% dos esforços em automatizar a distribuição e aumentar a lucratividade da operação própria de afiliados do BizuMiner, postergando o modelo SaaS B2B.
- **Opção B (Evolução para Plataforma B2B / SaaS):** Priorizar o desacoplamento da arquitetura (catálogo global vs. contas isoladas, RLS seguro, onboarding e billing) para permitir que outros afiliados assinem a ferramenta.

### Decisão 2: Governança Editorial e Limites de Ticket
- Qual deve ser a faixa de preço ideal para um "Achadinho BizuMiner"?
  - Devemos impor um **teto rígido de preço** no filtro determinístico (ex.: máximo de R$ 250,00 ou R$ 500,00 para compra por impulso)?
  - Devemos desativar o `auto_publish` e exigir que **100% dos produtos** passem por validação de um curador humano antes de entrarem na vitrine pública?

### Decisão 3: Nível de Automação da Distribuição
- Devemos contratar e integrar uma API de mensageria para automação de disparo direto nos grupos de WhatsApp e Telegram (eliminando o copiar/colar do operador), ou manter a postagem assistida com supervisão humana?
- A estratégia de redes sociais continuará baseada em Stories manuais ou deve ser investido em geração automatizada de criativos visuais para Reels/Carrosséis?

### Decisão 4: Rastreamento Financeiro e Integração de Vendas
- O BizuMiner deve desenvolver um importador de relatórios financeiros (via upload de CSV das plataformas de afiliados ou integração de APIs de relatórios) para fechar o ciclo de métricas e permitir que a IA aprenda com o faturamento real?

---

## Conclusão do Diagnóstico

O BizuMiner possui uma **base técnica de engenharia muito superior à média de operações de afiliados convencionais**, com modelagem de banco robusta, infraestrutura moderna (Next.js, Supabase, Google Gemini 2.5 Flash) e pipeline bem estruturado.

Contudo, ele sofre do clássico descompasso entre "sofisticação de software" e "realidade comercial":
- A esteira de triagem é rápida e inteligente, mas aprova produtos sem teto e sem histórico comparável em virtude de bugs silenciosos.
- A vitrine e o painel são modernos e responsivos, mas a entrega final de valor comercial depende de um operador copiando links em uma área de transferência e colando manualmente em aplicativos de mensagens, sem feedback de receita.

A resolução dos bugs pontuais (restauração do menor preço histórico e inclusão de teto de preço) trará ganhos imediatos de credibilidade para a operação própria. Já a transição para uma plataforma B2B exigirá uma decisão deliberada de arquitetura sobre a separação do catálogo de inteligência e o isolamento de inquilinos.
