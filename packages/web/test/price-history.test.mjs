import assert from "node:assert/strict";
import { priceHistoryView } from "../lib/price-history.ts";
import { formatOfferMoney, offerPriceLabel, offerPriceNote } from "../lib/offer-price.ts";
const point = (day,price_cents=1000) => ({price_cents,observed_at:`2026-10-${day}T12:00:00Z`});
const context = {totalCount:20,windowCount:20,comparableCount:0,excludedCount:20,windowDays:90,comparison:"configuration_unknown"};
assert.match(priceHistoryView([],context).explanation,/versão/);
assert.equal(priceHistoryView([point('01')]).state,'single');
assert.equal(priceHistoryView([point('01'),point('20')]).state,'stable');
assert.deepEqual(priceHistoryView([point('01'),point('20')]).coordinates.map(p=>p.y),[50,50]);
const varied=priceHistoryView([point('21',900),point('01'),point('02',1200)]);
assert.equal(varied.state,'variable');assert.equal(varied.min,900);assert.equal(varied.max,1200);
assert.ok(varied.coordinates[1].x < 15,'x reflects elapsed time, not observation index');
assert.equal(priceHistoryView([{price_cents:0,observed_at:'invalid'}]).min,null);
assert.match(offerPriceLabel({priceCents:1000,priceType:'from'}),/^a partir de/);
assert.match(offerPriceLabel({priceCents:1000,priceType:'range',priceMinCents:1000,priceMaxCents:3000}),/ a /);
assert.match(offerPriceNote({priceCents:1000,currency:'BRL'}),/Confirme a versão/);
assert.match(formatOfferMoney(1000),/R\$/,'generic legacy formatter retains its explicit default');
assert.equal(offerPriceLabel({priceCents:1099}),'10,99');
assert.equal(offerPriceLabel({priceCents:1000,priceType:'from'}),'a partir de 10');
assert.equal(offerPriceLabel({priceCents:1000,priceType:'range',priceMinCents:1000,priceMaxCents:3050}),'10 a 30,50');
assert.match(offerPriceLabel({priceCents:1000,currency:'BRL'}),/R\$/);
assert.match(offerPriceLabel({priceCents:1000,currency:'USD'}),/US\$/);
for (const currency of [undefined,'','brl','invalid']) {
  assert.equal(offerPriceNote({priceCents:1000,currency,priceType:'exact'}),'Moeda não confirmada; confira o preço na loja');
  assert.doesNotMatch(offerPriceLabel({priceCents:1000,currency}),/R\$|US\$/);
}

assert.match(priceHistoryView([], {...context, windowCount:0, olderCount:20}).explanation,/mais de 90 dias/);
