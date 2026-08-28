/**
 * Espelho web do kill switch da captura da Shopee (M1).
 *
 * Fonte canônica: `packages/capture/src/shopee-capture.ts`. O pacote web não
 * importa código de `packages/capture` (Next.js), então esta função replica
 * o MESMO contrato. Qualquer mudança na fonte canônica deve ser refletida
 * aqui e coberta por teste nos dois lados — mesmo padrão de `automated-capture.ts`.
 */

export interface ShopeeCaptureEnv {
  readonly SHOPEE_CAPTURE_ENABLED?: string;
  readonly SHOPEE_APP_ID?: string;
  readonly SHOPEE_APP_SECRET?: string;
}

export function shopeeCaptureEnabled(env: ShopeeCaptureEnv = process.env as ShopeeCaptureEnv): boolean {
  return (
    env.SHOPEE_CAPTURE_ENABLED === "true" &&
    !!env.SHOPEE_APP_ID &&
    !!env.SHOPEE_APP_SECRET
  );
}
