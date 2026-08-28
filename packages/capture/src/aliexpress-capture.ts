/**
 * Kill switch da captura da AliExpress (M5).
 *
 * Mesmo padrão de `shopee-capture.ts`: gate **próprio**, isolado, que nunca
 * compartilha flag com o Mercado Livre nem com a Shopee (M-R3,
 * `docs/tecnico/plano-multiplataforma.md`). Falha fechado — credencial
 * ausente é o mesmo que desligado.
 *
 * `ALIEXPRESS_ACCESS_TOKEN` NÃO entra na condição: a espiga de 28/08/2026
 * provou que `aliexpress.affiliate.product.query` responde sem OAuth. Exigir
 * um token desnecessário deixaria a plataforma desligada sem motivo.
 *
 * `ALIEXPRESS_TRACKING_ID` ENTRA na condição, e isso é deliberado. Sem ele a
 * API responde normalmente — só que o `promotion_link` devolvido não tem
 * atribuição, e o clique não gera comissão. Verificado em campo: uma rodagem
 * sem tracking_id capturaria dezenas de produtos e produziria um catálogo
 * inteiro de links que não pagam nada, sem nenhum erro visível. É exatamente
 * o tipo de falha silenciosa e cara que o resto do projeto trata falhando
 * fechado (gate da Shopee, /go sem affiliate_url), então aqui é igual:
 * melhor a plataforma não rodar do que rodar rendendo zero.
 */

export interface AliExpressCaptureEnv {
  readonly ALIEXPRESS_CAPTURE_ENABLED?: string;
  readonly ALIEXPRESS_APP_KEY?: string;
  readonly ALIEXPRESS_APP_SECRET?: string;
  readonly ALIEXPRESS_TRACKING_ID?: string;
}

export function aliexpressCaptureEnabled(
  env: AliExpressCaptureEnv = process.env,
): boolean {
  return (
    env.ALIEXPRESS_CAPTURE_ENABLED === "true" &&
    !!env.ALIEXPRESS_APP_KEY &&
    !!env.ALIEXPRESS_APP_SECRET &&
    !!env.ALIEXPRESS_TRACKING_ID
  );
}
