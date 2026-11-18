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
  querySelectorAll: () => [],
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
  querySelectorAll: () => [],
  getAttribute: () => null,
};
const incomplete = {
  href: "https://pt.aliexpress.com/item/1005010000000032.html",
  parentElement: null as unknown,
  querySelector: () => null,
  querySelectorAll: () => [],
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

const aliPriceField = { innerText: "" };
Object.assign(visibleAnchor.parentElement as object, {
  innerText: "HOMEFISH BLACK\n4,9 estrelas\n100 vendidos\nFrete R$ 5,00",
  querySelector: (selector: string) => selector.includes("price--current") ? aliPriceField : null,
});
for (const [label, priceCents, priceType, priceMaxCents] of [
  ["62,84", 6284, "exact", undefined],
  ["1.299,90", 129990, "exact", undefined],
  ["62 . 84", 6284, "exact", undefined],
  ["63", 6300, "exact", undefined],
  ["62,84 até 74,90", 6284, "range", 7490],
  ["a partir de 62,84", 6284, "from", undefined],
  ["34,43-39%", 3443, "exact", undefined],
] as const) {
  aliPriceField.innerText = label;
  const offer = collectMarketplacePage(noClasses, offerPage)?.products[0];
  assert.equal(offer?.priceCents, priceCents, label);
  assert.equal(offer?.priceType, priceType, label);
  assert.equal(offer?.priceMaxCents, priceMaxCents, label);
  assert.equal(offer?.currency, "BRL", label);
}

for (const label of ["US$ 62,84", "62,84 USD", "50%", "4,9 estrelas", "2 unidades"]) {
  aliPriceField.innerText = label;
  assert.equal(collectMarketplacePage(noClasses, offerPage)?.products.length, 0, label);
}

aliPriceField.innerText = "62,84";
assert.equal(collectMarketplacePage(noClasses, new URL("?currency=USD", offerPage))?.products.length, 0);
assert.equal(collectMarketplacePage(noClasses, new URL("https://www.aliexpress.com/w/wholesale-test.html"))?.products.length, 0);
Object.assign(visibleAnchor.parentElement as object, {
  innerText: "HOMEFISH BLACK\n62,84\n4,9 estrelas",
  querySelector: () => null,
});
assert.equal(collectMarketplacePage(noClasses, offerPage)?.products.length, 0, "bare numbers need a price field");

// The homepage uses an accessible amount and consecutive aria-hidden spans
// for the visible symbol, whole amount, comma and fraction.
function splitAliAmount(label: string, parts: string[], struck = false) {
  const group = { parentElement: null as Element | null, matches: () => struck };
  let next: object | null = null;
  for (const textContent of [...parts].reverse()) {
    next = { textContent, getAttribute: () => "true", nextElementSibling: next, parentElement: group };
  }
  return Object.assign(next!, { previousElementSibling: { textContent: label } });
}
const controllerPrice = splitAliAmount("R$48,07", ["R$", "48", ",", "07"]);
const controllerOriginal = splitAliAmount("R$124", ["R$", "124"], true);
Object.assign(visibleAnchor.parentElement as object, {
  innerText: "Wireless Game Controller\nR$48,07 R$ 48 , 07 R$124 -61%\nR$16 OFF em R$80",
  querySelectorAll: (selector: string) => selector.includes("aria-hidden")
    ? [controllerPrice, controllerOriginal] : [visibleAnchor],
});
assert.equal(collectMarketplacePage(noClasses, offerPage)?.products[0]?.priceCents, 4807);

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
  matches: () => false,
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

// Amazon search can put the ASIN only in a link and inside the cart widget.
// The search faceout owns the price, payment terms and product heading.
const searchPage = new URL("https://www.amazon.com.br/s?k=celimax");
const searchAsin = "B0DK4Y2YP3";
const searchAnchor = {
  href: `https://www.amazon.com.br/celimax-Shot-Tightening-Booster-15ml/dp/${searchAsin}/ref=sr_1_1`,
  closest: (selector: string) => selector.includes("asin-faceout-container") ? searchCard : null,
};
let accessiblePrice: { textContent: string; innerText: string } | null = { textContent: "R$\u00a0104,39", innerText: "" };
let hasPrimaryPrice = true;
const priceRow = {
  innerText: "R$ 104,39 R$ 169,00 à vista no Pix e NuPay ou em até 3x de R$ 38,66 sem juros",
  querySelector: (selector: string) => selector.includes("data-a-strike") ? { textContent: "R$ 169,00" } : null,
};
const primaryPrice = {
  closest: () => priceRow,
  querySelector(selector: string) {
    if (selector === ".a-offscreen") return accessiblePrice;
    if (selector === ".a-price-symbol") return { textContent: "R$" };
    if (selector === ".a-price-whole") return { textContent: "104," };
    if (selector === ".a-price-fraction") return { textContent: "39" };
    return null;
  },
};
const priceRecipe = {
  contains: (element: unknown) => element === priceRow,
  querySelector: (selector: string) => selector.includes("not(.a-text-price)") && hasPrimaryPrice ? primaryPrice : null,
};
const searchCard = {
  matches: (selector: string) => selector.includes("asin-faceout-container"),
  innerText: "celimax Shot Tightening Booster - 15ml R$ 104,39 R$ 20,00 off na primeira compra no app Mais opções de compra R$ 105,94",
  querySelector(selector: string) {
    if (selector.includes("title-recipe") && selector.includes("a[href]")) return searchAnchor;
    if (selector.includes("title-recipe")) return { textContent: "celimax Shot Tightening Booster - 15ml" };
    if (selector.includes("price-recipe")) return priceRecipe;
    if (selector.includes("img.s-image")) return { src: "https://m.media-amazon.com/images/I/51zdLqgadJL._AC_UL320_.jpg" };
    return null;
  },
};
const searchDoc = {
  querySelectorAll: (selector: string) => selector.startsWith("a[") ? [searchAnchor] : [],
} as unknown as Document;
const searchOffer = collectMarketplacePage(searchDoc, searchPage)?.products[0];
assert.equal(searchOffer?.externalId, searchAsin);
assert.equal(searchOffer?.title, "celimax Shot Tightening Booster - 15ml");
assert.equal(searchOffer?.priceCents, 10439);
assert.equal(searchOffer?.condition, "pix", "the separate app promotion must not change the payment condition");
assert.equal(searchOffer?.originalPriceCents, undefined, "conditional prices must not produce a headline discount");
assert.equal(searchOffer?.productUrl, `https://www.amazon.com.br/dp/${searchAsin}`);

accessiblePrice = null;
assert.equal(collectMarketplacePage(searchDoc, searchPage)?.products[0]?.priceCents, 10439);
priceRow.innerText = "R$ 104,39 R$ 169,00";
assert.equal(collectMarketplacePage(searchDoc, searchPage)?.products[0]?.originalPriceCents, 16900);
hasPrimaryPrice = false;
assert.equal(collectMarketplacePage(searchDoc, searchPage)?.products.length, 0, "the card must not fall back to a coupon, installment or secondary offer");

// Sponsored and script-driven search results expose the ASIN on the wrapper.
const searchWrapper = {
  getAttribute: (attr: string) => attr === "data-asin" ? searchAsin : null,
  matches: (selector: string) => selector === "[data-component-type='s-search-result']",
  querySelectorAll: (selector: string) => selector.includes("asin-faceout-container") ? [searchCard] : [],
};
const searchWithoutDirectLinks = {
  querySelectorAll: (selector: string) => selector === "[data-asin]" ? [searchWrapper] : [],
} as unknown as Document;

hasPrimaryPrice = true;
priceRow.innerText = "R$ 104,39 à vista no Pix e NuPay";
for (const href of ["javascript:void(0)", "https://www.amazon.com.br/sspa/click"]) {
  searchAnchor.href = href;
  const offers = collectMarketplacePage(searchWithoutDirectLinks, searchPage)?.products;
  assert.equal(offers?.length, 1);
  assert.equal(offers?.[0]?.productUrl, `https://www.amazon.com.br/dp/${searchAsin}`);
  assert.equal(offers?.[0]?.priceCents, 10439);
  assert.equal(offers?.[0]?.condition, "pix");
}

searchAnchor.href = "https://www.amazon.com.br/dp/B0DK4WKPZW";
assert.equal(collectMarketplacePage(searchWithoutDirectLinks, searchPage)?.products.length, 0, "a conflicting title link must not inherit the wrapper's ASIN");
