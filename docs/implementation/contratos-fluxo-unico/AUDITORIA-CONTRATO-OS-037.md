# Auditoria de contrato — OS-037

19/10/2026. Modo `contrato`. **Veredicto: CONFORME para execução local controlada.** Versão examinada: [OS-037](OS-037.md), [diagnóstico de BUG-021](../diagnosticos/os-036/DIAGNOSTICO.md), [auditoria de entrega da OS-036](AUDITORIA-OS-036.md), [OS-036](OS-036.md), [OS-035](OS-035.md) e [OS-028](OS-028.md), sobre baseline `main` `43700c59f4e24f68f3a2e32c20ee5147fa4816cd` mais working tree local extenso não commitado. Parecer emitido pela skill `auditor-red-team` em modo contrato, sem alteração de código ou critérios de aceite durante esta avaliação.

---

## 1. Avaliação dos Pontos Críticos Requisitados

| Ponto de verificação | Exigência da OS-037 e alinhamento com diagnóstico / contratos | Parecer objetivo |
| :--- | :--- | :--- |
| **1. Ordenação sob concorrência** | AC-037.2 exige bloqueio determinístico dos produtos (`ORDER BY id FOR UPDATE` ou `FOR SHARE`) no servidor durante `saveEditorialAssessment`. Writers cobertos pelos triggers em `product` e `price_observation` adquirem bloqueio conflitante do respectivo produto antes de obter o ID do evento. Garante que eventos pós-corte tenham ID superior ao corte e que eventos pré-corte sejam visíveis. Não depende de relógio (`observed_at`/`capturedAt`). | **CONFORME.** Elimina a incerteza de timestamp identificada no diagnóstico e lineariza a emissão de cortes por produto. |
| **2. RLS e isolamento de contas** | AC-037.1 exige que `garimpa.comparative_evidence_event` possua `tenant_id`, FK composta, índice `(tenant_id, product_id, id)` e RLS ativo concedendo apenas leitura escopada ao runtime `garimpa_app`. Triggers com `search_path` fixo e privilégio mínimo. Contraprova exige testar falha atômica e vedação de leitura entre Tenant A e Tenant B. | **CONFORME.** Adere estritamente ao padrão de isolamento multi-tenant do repositório Garimpa. |
| **3. Comportamento sem migration** | AC-037.2 e AC-037.5 estipulam que o erro PostgreSQL `42P01` (`undefined_table`) seja tratado exclusivamente para a tabela de eventos: alegações comparativas novas e antigas falham fechado (omitidas), enquanto a leitura e salvamento descritivos continuam operando normalmente sem interrupção do catálogo/vitrine. | **CONFORME.** Garante degradação graciosa e fail-closed operacional seguro sem quebrar o comércio. |
| **4. Suficiência das contraprovas** | AC-037.5 exige contraprovas completas para todas as causas de BUG-021: (a) origem alterada com preço constante, (b) observação tardia com `observed_at` anterior, (c) sobrescrita A→B→A na mesma linha, (d) alteração de `product_url` sem observação, (e) mudança de variante/configuração, (f) origem ausente/inválida, (g) bloqueio de reativação via `replaceEditorialSelection`, (h) isolamento entre tenants, (i) recaptura equivalente válida, (j) persistência do bloqueio de curadoria `approved→rejected→approved`, e (k) fallback com migration ausente / v2. | **CONFORME.** Cobre exaustivamente todos os contraexemplos e contraprovas identificados em AUDITORIA-OS-036 e DIAGNOSTICO. |

---

## 2. Fronteira, Ferramental e Limitações

1. **Ferramenta de Migration:** Verificada a disponibilidade local do Supabase CLI (`2.118.0`) no cache (`HOME=/tmp`), viabilizando a geração formal da migration com timestamp canônico sem invenção de nomenclatura ou desvio de convenção.
2. **Escrita Fechada e Caminhos Protegidos:** A lista de escrita é estritamente delimitada a 1 migration aditiva nova, 3 arquivos de biblioteca editorial/comparativa em `packages/web/lib/`, 4 arquivos de testes e o relato `RESULTADO-OS-037.md`. Writers em `packages/persistence/src/` e rollouts lacrados permanecem estritamente protegidos.
3. **Ambiente Local e Isolamento:** Nenhuma migration remota, deploy, backfill ou operação externa está autorizada. A execução é restrita ao ambiente local isolado (PGlite e testes de unidade).
4. **Tratamento de Lacunas Ambientais:** PostgreSQL nativo e testes de interface em navegador continuam sob a condição de não verificados (`NAO_VERIFICADA`) enquanto os harnesses correspondentes estiverem fora de escopo (OS-031 / OS-033).

---

## 3. Veredicto Final

A OS-037 está **CONFORME** para execução no ambiente local sob a skill `executor-blindado`.

