/**
 * Kill switch da captura automatizada do Mercado Livre (E0).
 *
 * Fonte canônica da semântica de permissão do acesso automatizado à listagem
 * `/ofertas`. Antes de E0, o `MercadoLivreDealsAdapter` fazia requisições de
 * rede sem nenhum gate operacional — este módulo é o gate único.
 *
 * Semântica (falha fechada):
 * - a flag ausente, vazia ou diferente de `"true"` → DESLIGADO;
 * - `"true"` em produção (`NODE_ENV=production`) SEM a flag de produção
 *   explícita → DESLIGADO (produção nunca automatiza por acidente);
 * - `"true"` + `NODE_ENV=development` → LIGADO (desenvolvimento explicitamente
 *   autorizado);
 * - `"true"` + `ML_AUTOMATED_CAPTURE_PRODUCTION=true` → LIGADO em produção
 *   (decisão consciente do dono, 31/08/2026: consentimento via checkbox no
 *   painel + flags de ambiente).
 *
 * O parser puro (`parseDealsHtml`) e as fixtures NÃO passam por este gate —
 * eles continuam testáveis e disponíveis para investigação offline. Só a
 * execução de rede operacional (CLI `bin/sweep.ts` e a rota administrativa
 * `/api/admin/rodagem`) consulta esta função antes de qualquer fetch/spawn.
 *
 * Este arquivo é a fonte de verdade. `packages/web/lib/automated-capture.ts`
 * é um espelho do MESMO contrato para o pacote web (que não importa código de
 * `packages/capture`); qualquer mudança aqui deve ser replicada lá e coberta
 * por teste nos dois lados.
 */

/** Subconjunto de `process.env` necessário à decisão — injetável em teste. */
export interface AutomatedCaptureEnv {
  readonly ML_AUTOMATED_CAPTURE_ENABLED?: string;
  readonly ML_AUTOMATED_CAPTURE_PRODUCTION?: string;
  readonly NODE_ENV?: string;
}

/**
 * Decide se o acesso automatizado ao Mercado Livre está liberado.
 * Default seguro: desligado. Não há caminho de produção que ligue sozinho.
 */
export function mlAutomatedCaptureEnabled(env: AutomatedCaptureEnv = process.env): boolean {
  if (env.ML_AUTOMATED_CAPTURE_ENABLED !== "true") return false;
  if (env.NODE_ENV === "development") return true;
  // Produção só automatiza com flag explícita adicional — o dono consente
  // no painel (checkbox) e seta a flag no ambiente do servidor.
  return env.ML_AUTOMATED_CAPTURE_PRODUCTION === "true";
}
