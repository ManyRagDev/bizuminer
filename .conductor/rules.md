# Coding Guidelines, Operational Laws & Post-Mortem Memory

> **Regras de Engenharia do BizuMiner sob o Protocolo CONDUCTOR**  
> Todo desenvolvedor ou agente de IA atuando neste repositório é obrigado a seguir estas leis sem exceção.

---

## 1. Padrões de Código & Arquitetura

### 1.1. TypeScript & Runtime Node.js
- Utilize Node.js >= 22.6 com suporte nativo a strip types (`--experimental-strip-types`).
- Evite etapas redundantes de build/compilação nos pacotes de suporte onde o Node executa diretamente o TypeScript.
- Tipos de domínio e contratos entre pacotes devem ser compartilhados de forma explícita e tipada (evite `any` solto).

### 1.2. Banco de Dados e Queries SQL
- **Schema Obrigatório:** Todo comando SQL deve prefixar as tabelas com `garimpa.` (ex: `garimpa.product`, `garimpa.price_observation`).
- **Segurança de Queries:** Use sempre queries parametrizadas com o driver `postgres` para impedir injeção de SQL.
- **Transações:** I/O externo (chamadas HTTP a APIs de marketplaces ou Gemini) NUNCA deve ser executado dentro de blocos de transação aberta no banco para evitar lock de conexões.
- **Migrations:** Nenhuma alteração estrutural no banco de dados é feita "na mão". Crie uma migration SQL versionada em `packages/persistence/supabase/migrations/` e execute o teste correspondente.
- **Multi-Tenant / Isolamento:** Toda query que manipula dados de usuário ou catálogo de parceiro deve filtrar obrigatoriamente por `account_id` ou `tenant_id`.

### 1.3. UI/UX e Estilização
- Mantenha o design system nativo do BizuMiner centrado em `packages/web/app/globals.css`.
- Não importe Tailwind CSS, Radix UI nem instale componentes do Shadcn. Respeite os seletores CSS e as variáveis globais (`--bg`, `--card`, `--accent`, `--border`, etc.).
- A interface deve ser sempre mobile-first, leve e otimizada para carregar rapidamente em conexões 4G/3G de compradores no Brasil.

### 1.4. Resiliência de APIs Externas
- Chamadas para Shopee GraphQL e AliExpress TOP API devem ter retries com backoff exponencial para falhas transitórias (códigos 429, 500, 502, 503).
- Falhas em um anúncio ou departamento específico nunca devem interromper o lote inteiro; registre o erro e continue o processamento dos itens restantes.

---

## 2. 🏁 Definition of Done (DoD Obrigatório)

Uma tarefa ou track **SÓ É CONSIDERADA FINALIZADA** quando todos os critérios abaixo forem atendidos:

1. **Código Implementado e Funcional:** O código foi escrito, integrado e resolve o problema sem regressions.
2. **Verificação Real via Terminal/Testes:** Executar a suíte de testes relevante (`npm test --prefix packages/web`, `npm test --prefix packages/persistence`, ou os scripts `bin/verify-*.ts`).
3. **Plano da Track Atualizado:** O arquivo `.conductor/tracks/<track-id>/plan.md` deve ter todas as tarefas correspondentes marcadas com `[x]`.
4. **Roadmap de Tracks Atualizado:** O arquivo `.conductor/tracks.md` deve ter o status da track atualizado para `[x]` e indicar a data/resumo da entrega.
5. **Documentação e Verdade Sincronizadas:** Se a implementação alterou alguma premissa de negócio ou técnica, proponha a atualização correspondente em `.conductor/product.md` ou `.conductor/tech-stack.md`.

---

## 3. Lições Aprendidas & Post-Mortem (Bugs a NUNCA Repetir)

### ⚠️ Bug 01: Corrupção de Encoding UTF-8 por Scripts Windows/PowerShell
- **O que aconteceu:** Edição de arquivos com caracteres especiais e acentuação no PowerShell (`Set-Content`) converteu strings para ISO-8859-1 / UTF-16, quebrando textos na vitrine.
- **A Lei:** Todo script e agente deve garantir leitura e escrita estritamente em UTF-8 puro.

### ⚠️ Bug 02: Desconto Falso de 1% e Falsos Menores Preços Históricos
- **O que aconteceu:** Produtos com centavos de diferença eram promovidos com selo de grande oportunidade ou menor preço da história em catálogos recém-criados sem histórico prévio.
- **A Lei:** Selos de "Menor Preço Histórico" e chamadas de copy para WhatsApp exigem rigorosa validação multi-dia (mínimo de 3 dias de observação) e relevância percentual mínima comprovada.

### ⚠️ Bug 03: Conflito de Servidores de Desenvolvimento Next.js
- **O que aconteceu:** Rodar dois comandos `next dev` em portas diferentes no mesmo repositório causou concorrência na pasta `.next`, gerando erros misteriosos de compilação.
- **A Lei:** Manter rigorosamente uma única instância de servidor Next.js em execução por vez.

### ⚠️ Bug 04: Migrations Criadas mas Não Aplicadas
- **O que aconteceu:** Tabelas essenciais existiam no código como arquivos de migration, mas a aplicação quebrava em produção porque ninguém havia rodado a migration no banco real.
- **A Lei:** Afirmação de banco sai de script de verificação (`bin/verify-*.ts`) ou comando SQL de checagem, nunca de suposição verbal.

### ⚠️ Bug 05: Manipulação Inadequada de Fuso Horário e Datas (Bug D-1)
- **O que aconteceu:** Usar `new Date().toISOString()` para gravar datas de ofertas causou deslocamento de dia no fuso horário do Brasil (UTC-3).
- **A Lei:** Tratamento de datas locais para vitrine e pauta deve preservar o fuso local (`America/Sao_Paulo`) ou normalizar em UTC com horário explícito do meio-dia (`T12:00:00`) ao indexar dias de calendário.
