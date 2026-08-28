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
 */

export interface AutomatedCaptureEnv {
  readonly ML_AUTOMATED_CAPTURE_ENABLED?: string;
  readonly NODE_ENV?: string;
}

export function mlAutomatedCaptureEnabled(env: AutomatedCaptureEnv = process.env): boolean {
  return env.ML_AUTOMATED_CAPTURE_ENABLED === "true" && env.NODE_ENV === "development";
}
