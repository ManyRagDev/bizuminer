import { optionDetailPath } from "./offer-option.ts";
import type { readLivePauta } from "./pauta-db.ts";
import { productPreview } from "./product-preview.ts";
import { shareBaseUrl } from "./site-url.ts";

export type RawLivePauta = Awaited<ReturnType<typeof readLivePauta>>;

export function enrichPautaResponse(
  selection: RawLivePauta,
  tenantId: string,
  customHost?: string
) {
  const host = (customHost ?? shareBaseUrl()).replace(/\/$/, "");
  const products = selection.products.map(({ shareTarget, shortCode, ...product }) => {
    const copyKey = JSON.stringify([
      product.id,
      product.offerOptionKey,
      product.priceCents,
      product.priceType,
      product.currency,
      product.priceMinCents,
      product.priceMaxCents,
      product.offerConditions,
      product.purchaseContents,
    ]);
    if (shareTarget.kind === "pauta") {
      const detailUrl = `/p/pauta/${shareTarget.token}`;
      return {
        ...product,
        copyKey,
        detailUrl,
        shopUrl: `/go/pauta/${shareTarget.token}`,
        shareUrl: `${host}${detailUrl}`,
        previewUrl: null,
        storyUrl: `/api/story/${encodeURIComponent(product.id)}?pauta=1&conta=${encodeURIComponent(tenantId)}`,
      };
    }
    const { slug } = shareTarget;
    const query = product.offerOptionKey ? `?opcao=${encodeURIComponent(product.offerOptionKey)}` : "";
    const detailUrl = optionDetailPath(slug, product.offerOptionKey);
    return {
      ...product,
      slug,
      copyKey,
      detailUrl,
      previewUrl: `${host}${productPreview({ ...product, slug }).path}`,
      shopUrl: `/go/${encodeURIComponent(slug)}${query}`,
      shareUrl: shortCode && product.marketplace !== "amazon" ? `${host}/p/${shortCode}${query}` : `${host}${detailUrl}`,
      storyUrl: `/api/story/${encodeURIComponent(slug)}${query}`,
      bioCode: shortCode ? `#${shortCode.slice(-3).toUpperCase()}` : undefined,
    };
  });
  return { ...selection, products };
}
