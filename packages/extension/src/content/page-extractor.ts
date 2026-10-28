/** Self-contained DOM reader, also serialized into the fallback bookmarklet. No network or session access. */
export function collectBrowserOffers() {
  function money(label: string | null): number | undefined {
    const m = /(\d[\d.]*)\s*reais(?:\s+com\s+(\d{1,2})\s*centavos)?/.exec(
      label || "",
    );
    return m
      ? Number(m[1]!.replace(/\./g, "")) * 100 + Number(m[2] || 0)
      : undefined;
  }
  const page = new URL(location.href);
  if (
    page.protocol !== "https:" ||
    !page.hostname.endsWith("mercadolivre.com.br") ||
    !page.pathname.startsWith("/ofertas")
  )
    throw new Error(
      "Abra a página de ofertas do Mercado Livre e conclua o acesso, se solicitado.",
    );
  const products: Array<{
    externalId: string;
    title: string;
    productUrl: string;
    priceCents: number;
    originalPriceCents?: number;
    currency: "BRL";
    priceType: "exact" | "from";
    imageUrl?: string;
    ratingStar?: number;
    salesLabel?: string;
    salesCount?: number;
  }> = [];
  const seen = new Set<string>();
  const cards = Array.from(
    document.querySelectorAll<HTMLElement>(".poly-card"),
  );
  for (const card of cards.slice(0, 200)) {
    const anchor = card.querySelector<HTMLAnchorElement>(
      "a.poly-component__title",
    );
    if (!anchor) continue;
    const url = new URL(anchor.href);
    if (
      !/(^|\.)mercadolivre\.com\.br$/.test(url.hostname) ||
      url.protocol !== "https:"
    )
      continue;
    const direct = !url.pathname.includes("/p/")
      ? url.pathname.match(/\/MLB-?(\d{6,})/)
      : null;
    const filtered = (url.searchParams.get("pdp_filters") || "").match(
      /item_id:(MLB\d{6,})/,
    );
    const fragment = new URLSearchParams(url.hash.slice(1));
    // A catalog ID alone does not establish the listing/seller observed in the card.
    const externalId =
      url.searchParams.get("wid") ||
      fragment.get("wid") ||
      (filtered ? filtered[1] : "") ||
      (direct ? "MLB" + direct[1] : "");
    const title = (anchor.textContent || "").replace(/\s+/gu, " ").trim();
    const priceLabel = card
      .querySelector('.poly-price__current [aria-label*="reais"]')
      ?.getAttribute("aria-label") || "";
    const priceCents = money(
      card
        .querySelector('.poly-price__current [aria-label*="reais"]')
        ?.getAttribute("aria-label") || null,
    );
    if (
      !/^MLB\d{6,}$/.test(externalId) ||
      !title || title.length > 2000 || /\b(?:faixa|entre)\b/i.test(priceLabel) ||
      !priceCents ||
      seen.has(externalId)
    )
      continue;
    const original = money(
      card
        .querySelector('[aria-label^="Antes:"]')
        ?.getAttribute("aria-label") || null,
    );
    let text = card.textContent || "";
    for (const element of Array.from(card.querySelectorAll("[aria-label]")))
      text += " " + element.getAttribute("aria-label");
    const rating =
      /Classificação\s*([0-5](?:[.,]\d+)?)\s*de\s*5\s*estrelas/i.exec(text);
    const sales =
      /(?:\+\s*|Mais de\s+)(\d+(?:[.,]\d+)?)\s*(milhões|milhão|mil|mi|m)?\s*(?:produtos?\s+)?vendidos/i.exec(
        text,
      );
    const img = card.querySelector<HTMLImageElement>(
      'img[src^="https://http2.mlstatic.com/"], img[src*=".mlstatic.com/"]',
    );
    const product: (typeof products)[number] = {
      externalId,
      title,
      productUrl:
        url.origin +
        url.pathname +
        (url.pathname.includes("/p/") ? "?wid=" + externalId : ""),
      priceCents,
      currency: "BRL",
      priceType: /a\s+partir\s+de/i.test(priceLabel) ? "from" : "exact",
    };
    if (original && original > priceCents)
      product.originalPriceCents = original;
    if (img && img.src.startsWith("https://")) product.imageUrl = img.src;
    if (rating && Number(rating[1]!.replace(",", ".")) > 0)
      product.ratingStar = Number(rating[1]!.replace(",", "."));
    if (sales) {
      product.salesLabel = sales[0];
      product.salesCount = Math.round(
        Number(sales[1]!.replace(",", ".")) *
          (sales[2] ? (sales[2] === "mil" ? 1000 : 1000000) : 1),
      );
    }
    seen.add(externalId);
    products.push(product);
  }
  if (!products.length)
    throw new Error(
      "Nenhuma oferta completa encontrada. Confira se a listagem carregou.",
    );
  const pagePath = page.pathname.replace(/\/+$/, "") || "/ofertas";
  return {
    version: 1 as const,
    requestId: crypto.randomUUID(),
    marketplace: "mercadolivre" as const,
    clientCapturedAt: new Date().toISOString(),
    page: { kind: "offers" as const, url: page.origin + pagePath },
    products,
    ignoredCards: cards.length - products.length,
  };
}
