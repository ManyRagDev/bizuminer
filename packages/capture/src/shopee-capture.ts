/**
 * Kill switch da captura da Shopee (M1, 26/08/2026).
 *
 * Mesmo padrão de `automated-capture.ts` (E0), com uma diferença de origem:
 * o Mercado Livre usa `/ofertas` (HTML público), então o gate do ML existe
 * para conter scraping. A Shopee usa API oficial (`ShopeeAdapter`, Open API
 * autenticada) — não há restrição de ToS aqui. O gate existe por um motivo
 * diferente: falhar fechado quando a credencial de produção não estiver
 * configurada, para nunca disparar uma rodagem que vai quebrar a meio caminho
 * (e registrar um `capture_run` de erro) por falta de `SHOPEE_APP_ID`/`SHOPEE_APP_SECRET`.
 *
 * Semântica (falha fechada):
 * - qualquer credencial ausente → DESLIGADO;
 * - `SHOPEE_CAPTURE_ENABLED` ausente, vazio ou diferente de `"true"` → DESLIGADO;
 * - as três condições juntas → LIGADO.
 *
 * Este gate é independente do kill switch do ML (`ML_AUTOMATED_CAPTURE_ENABLED`)
 * — nunca vira chave geral (M-R3, `docs/tecnico/plano-multiplataforma.md`).
 */

export interface ShopeeCaptureEnv {
  readonly SHOPEE_CAPTURE_ENABLED?: string;
  readonly SHOPEE_APP_ID?: string;
  readonly SHOPEE_APP_SECRET?: string;
}

export function shopeeCaptureEnabled(env: ShopeeCaptureEnv = process.env): boolean {
  return (
    env.SHOPEE_CAPTURE_ENABLED === "true" &&
    !!env.SHOPEE_APP_ID &&
    !!env.SHOPEE_APP_SECRET
  );
}
