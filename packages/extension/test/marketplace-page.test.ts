import assert from "node:assert/strict";
import { collectMarketplacePage, displayedPrice } from "../src/content/marketplace-page.ts";

assert.deepEqual(displayedPrice("R$ 1.234,56 até R$ 1.599,99"), { priceCents: 123456, priceType: "range", priceMaxCents: 159999 });
assert.deepEqual(displayedPrice("a partir de R$ 62,84"), { priceCents: 6284, priceType: "from" });
assert.equal(displayedPrice("US$ 62,84"), undefined);

const offerPage = new URL("https://pt.aliexpress.com/w/wholesale-test.html?session=discard");
const productUrl = "https://pt.aliexpress.com/item/1005010089217228.html";
const card = {
  querySelector(selector: string) {
    if (selector.includes("price--current")) return { textContent: "R$ 62,84 – R$ 74,90" };
    if (selector.startsWith("h2")) return { textContent: "HOMEFISH BLACK" };
    return null;
  },
  textContent: "HOMEFISH BLACK R$ 62,84 – R$ 74,90 Novo usuário",
};
const anchor = {
  href: `${productUrl}?aff_fcid=discard`,
  parentElement: card,
  querySelector: () => null,
  getAttribute: () => null,
};
Object.assign(card, { tagName: "DIV", querySelectorAll: () => [anchor] });
const doc = { querySelectorAll: () => [anchor, anchor] } as unknown as Document;
const captured = collectMarketplacePage(doc, offerPage);
assert.equal(captured?.marketplace, "aliexpress");
assert.equal(captured?.products.length, 1);
assert.equal(captured?.products[0]?.condition, "first_purchase");
assert.equal(captured?.products[0]?.priceMaxCents, 7490);
assert.equal(captured?.products[0]?.productUrl, productUrl);
assert.equal(captured?.page.url, offerPage.origin + offerPage.pathname);
assert.equal(collectMarketplacePage(doc, new URL("https://www.aliexpress.com/p/trade/confirm.html")), null);

// Unmarked list: the link wraps only the image, and the price is rendered
// beside the link in spans without a known marketplace CSS class.
const visibleAnchor = {
  href: "https://pt.aliexpress.com/item/1005010089217228/",
  parentElement: null as unknown,
  querySelector: () => null,
  getAttribute: () => null,
};
const incomplete = {
  href: "https://pt.aliexpress.com/item/1005010000000032.html",
  parentElement: null as unknown,
  querySelector: () => null,
  getAttribute: () => null,
};
const grid = { tagName: "DIV", querySelectorAll: () => [visibleAnchor, incomplete] };
visibleAnchor.parentElement = {
  tagName: "DIV",
  innerText: "Foto do produto\nHOMEFISH BLACK\nR $\n62\n,\n84\nDe: R$ 99,90\nFrete R$ 5,00",
  querySelector: () => null,
  querySelectorAll: () => [visibleAnchor],
  parentElement: grid,
};
incomplete.parentElement = {
  tagName: "DIV",
  innerText: "Organizador para gavetas",
  querySelector: () => null,
  querySelectorAll: () => [incomplete],
  parentElement: grid,
};
const noClasses = {
  querySelectorAll: (selector: string) => selector.startsWith("a[") ? [visibleAnchor, incomplete] : [],
} as unknown as Document;
const generic = collectMarketplacePage(noClasses, offerPage);
assert.equal(generic?.products.length, 1, "the second product must not borrow the first card's price");
assert.equal(generic?.ignoredCards, 1);
assert.equal(generic?.products[0]?.title, "HOMEFISH BLACK");
assert.equal(generic?.products[0]?.priceCents, 6284);
assert.equal(generic?.products[0]?.productUrl, productUrl);

assert.deepEqual(displayedPrice("BRL 21.90"), { priceCents: 2190, priceType: "exact" });
assert.deepEqual(displayedPrice("R＄ 1.234"), { priceCents: 123400, priceType: "exact" });
assert.equal(generic?.diagnostics?.noPrice, 1);
assert.equal(generic?.diagnostics?.uncertainPrice, 0);
Object.assign(visibleAnchor.parentElement as object, {
  innerText: "HOMEFISH BLACK\nPor R$ 62.84\nR$ 99,90\nCupom de R$ 5,00",
});
assert.equal(collectMarketplacePage(noClasses, offerPage)?.products[0]?.priceCents, 6284);
Object.assign(visibleAnchor.parentElement as object, {
  innerText: "HOMEFISH BLACK\nR$ 62,84\nR$ 99,90",
});
const ambiguous = collectMarketplacePage(noClasses, offerPage);
assert.equal(ambiguous?.products.length, 0, "two unlabelled amounts must not become a price");
assert.equal(ambiguous?.diagnostics?.uncertainPrice, 1);
assert.equal(ambiguous?.diagnostics?.noPrice, 1);

// AliExpress renders the discount badge in a sibling span immediately after
// the offer price. Its text may arrive concatenated with the amount.
for (const [label, cents] of [
  ["R$750,02-39%", 75002],
  ["R$2.933,26−60%", 293326],
  ["R$34,43 –79%", 3443],
  ["R$29,95 -21%", 2995],
  ["R$8,90-39%", 890],
] as const) {
  assert.deepEqual(displayedPrice(label), { priceCents: cents, priceType: "exact" });
}
Object.assign(visibleAnchor.parentElement as object, {
  innerText: "Marcas+ SuperOfertas HOMEFISH BLACK\nCupons elegíveis\nR$34,43-79%",
});
const discounted = collectMarketplacePage(noClasses, offerPage);
assert.equal(discounted?.products[0]?.title, "HOMEFISH BLACK");
assert.equal(discounted?.products[0]?.priceCents, 3443);
assert.equal(discounted?.products[0]?.condition, undefined, "coupon eligibility alone is not a coupon price");
assert.deepEqual(displayedPrice("R$34,43 – R$39,90 -20%"), {
  priceCents: 3443, priceType: "range", priceMaxCents: 3990,
});

// Amazon deal cards with promo badges ("9% off Oferta Black Friday") must reject
// the badge and extract the actual product title from dealTitle or img.alt.
const amazonDealPage = new URL("https://www.amazon.com.br/deals");
const amazonAsin = "B0HHT9W4L9";
const amazonAnchor = {
  href: `https://www.amazon.com.br/dp/${amazonAsin}?ref_=dlx_gate_dd_dcl_tlt`,
  parentElement: null as unknown,
  querySelector: () => null,
  getAttribute: () => null,
  closest: () => amazonCard,
};
const amazonCard = {
  tagName: "DIV",
  getAttribute: (attr: string) => attr === "data-asin" ? amazonAsin : null,
  querySelector(selector: string) {
    if (selector.includes("a-price")) return { textContent: "R$ 699,00" };
    if (selector.includes("deal-card-title")) return null;
    if (selector.startsWith("h2") || selector.startsWith("h4")) return { textContent: "9% off Oferta Black Friday" };
    if (selector.includes("img")) return { alt: "Monitor Gamer Curvo 24 Polegadas 165Hz", currentSrc: "https://m.media-amazon.com/images/I/test.jpg" };
    return null;
  },
  querySelectorAll: () => [amazonAnchor],
  textContent: "9% off Oferta Black Friday R$ 699,00",
};
amazonAnchor.parentElement = amazonCard;
const amazonDoc = {
  querySelectorAll: (selector: string) => selector.startsWith("a[") ? [amazonAnchor] : [amazonCard],
} as unknown as Document;
const amazonCollected = collectMarketplacePage(amazonDoc, amazonDealPage);
assert.equal(amazonCollected?.marketplace, "amazon");
assert.equal(amazonCollected?.products.length, 1);
assert.equal(amazonCollected?.products[0]?.title, "Monitor Gamer Curvo 24 Polegadas 165Hz", "must reject promo badge and use img.alt");
assert.equal(amazonCollected?.products[0]?.priceCents, 69900);

