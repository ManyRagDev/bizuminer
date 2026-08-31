/**
 * Espelho web do kill switch da captura automatizada do ML (E0).
 *
 * Fonte canônica da semântica: `packages/capture/src/automated-capture.ts`.
 * O pacote web não importa código de `packages/capture` (Next.js), então esta
 * função replica o MESMO contrato — flag `ML_AUTOMATED_CAPTURE_ENABLED` + gate
 * de ambiente. Qualquer mudança na fonte canônica deve ser refletida aqui e
 * coberta por teste nos dois lados.
 *
 * Semântica (falha fechada): ligado somente com flag `"true"` E
 * `NODE_ENV === "development"`. Produção nunca automatiza por acidente.
 *
 * Desde 31/08/2026: o admin pode habilitar em produção com consentimento
 * explícito (checkbox "entendo os riscos"). O consentimento é verificado
 * na API, não aqui — esta função continua sendo o gate passivo (env var).
 */

export interface AutomatedCaptureEnv {
  readonly ML_AUTOMATED_CAPTURE_ENABLED?: string;
  readonly ML_AUTOMATED_CAPTURE_PRODUCTION?: string;
  readonly NODE_ENV?: string;
}

export function mlAutomatedCaptureEnabled(env: AutomatedCaptureEnv = process.env): boolean {
  if (env.ML_AUTOMATED_CAPTURE_ENABLED !== "true") return false;
  if (env.NODE_ENV === "development") return true;
  return env.ML_AUTOMATED_CAPTURE_PRODUCTION === "true";
}

/**
 * Gate com consentimento explícito do admin.
 * Em produção, aceita `consent: true` no body (checkbox) OU a flag de
 * ambiente (decisão consciente do dono). Em desenvolvimento, funciona como
 * antes (flag + env).
 */
export function mlCaptureAllowedWithConsent(consent: boolean, env: AutomatedCaptureEnv = process.env): boolean {
  if (env.NODE_ENV === "development") return mlAutomatedCaptureEnabled(env);
  return consent === true || mlAutomatedCaptureEnabled(env);
}
