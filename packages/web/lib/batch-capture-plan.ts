export type BatchMarketplace = "mercadolivre" | "shopee" | "aliexpress";

/** Sem consentimento explícito, preserva o gate do Mercado Livre. */
export function batchCapturePlan(consent: boolean): BatchMarketplace[] {
  return consent
    ? ["mercadolivre", "shopee", "aliexpress"]
    : ["shopee", "aliexpress"];
}
