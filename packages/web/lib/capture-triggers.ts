import { shopeeCaptureEnabled } from "./shopee-capture.ts";
import { aliexpressCaptureEnabled } from "./aliexpress-capture.ts";

/**
 * Registro das plataformas disparáveis pela rota genérica
 * `/api/admin/rodagem/[marketplace]`. O Mercado Livre **não** entra aqui —
 * continua servido pela rota dedicada `/api/admin/rodagem` (sem parâmetro),
 * com o kill switch E0 intocado (M-R1, `docs/tecnico/plano-multiplataforma.md`).
 *
 * Adicionar uma plataforma nova (AliExpress, M5) é acrescentar uma entrada
 * aqui — a rota não muda.
 */
export interface CaptureTrigger {
  readonly marketplace: string;
  /** Caminho do CLI relativo a `packages/persistence`. */
  readonly cliRelativePath: string;
  readonly enabled: () => boolean;
  readonly disabledMessage: string;
}

export const CAPTURE_TRIGGERS: readonly CaptureTrigger[] = [
  {
    marketplace: "shopee",
    cliRelativePath: "bin/sweep-shopee.ts",
    enabled: () => shopeeCaptureEnabled(),
    disabledMessage:
      "A captura da Shopee está desligada. Defina SHOPEE_CAPTURE_ENABLED=true e a credencial (SHOPEE_APP_ID/SHOPEE_APP_SECRET) no ambiente do servidor.",
  },
  {
    marketplace: "aliexpress",
    cliRelativePath: "bin/sweep-aliexpress.ts",
    enabled: () => aliexpressCaptureEnabled(),
    disabledMessage:
      "A captura da AliExpress está desligada. Exige ALIEXPRESS_CAPTURE_ENABLED=true, ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET e ALIEXPRESS_TRACKING_ID. O tracking id é obrigatório: sem ele a API responde normalmente, mas os links não geram comissão.",
  },
];

export function captureTriggerFor(marketplace: string): CaptureTrigger | null {
  return CAPTURE_TRIGGERS.find((t) => t.marketplace === marketplace) ?? null;
}
