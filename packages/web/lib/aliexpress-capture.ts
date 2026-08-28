/**
 * Espelho web do kill switch da captura da AliExpress (M5).
 *
 * Fonte canônica: `packages/capture/src/aliexpress-capture.ts`. O pacote web
 * não importa código de `packages/capture` (Next.js), então esta função
 * replica o MESMO contrato — inclusive a exigência do `trackingId`, que não é
 * detalhe: sem ele a API responde e devolve links sem atribuição, e a rodagem
 * produziria um catálogo que não rende nada. Mudança lá precisa vir para cá.
 */

export interface AliExpressCaptureEnv {
  readonly ALIEXPRESS_CAPTURE_ENABLED?: string;
  readonly ALIEXPRESS_APP_KEY?: string;
  readonly ALIEXPRESS_APP_SECRET?: string;
  readonly ALIEXPRESS_TRACKING_ID?: string;
}

export function aliexpressCaptureEnabled(
  env: AliExpressCaptureEnv = process.env as AliExpressCaptureEnv,
): boolean {
  return (
    env.ALIEXPRESS_CAPTURE_ENABLED === "true" &&
    !!env.ALIEXPRESS_APP_KEY &&
    !!env.ALIEXPRESS_APP_SECRET &&
    !!env.ALIEXPRESS_TRACKING_ID
  );
}
