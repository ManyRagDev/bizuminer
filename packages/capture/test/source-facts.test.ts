import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSourceTitle } from '../src/title.ts';
import { mapProductNode } from '../src/adapters/shopee/mapper.ts';
import { mapProductNodes } from '../src/adapters/aliexpress/mapper.ts';

test('source title preserves model, capacity and Unicode without truncation or guessing', () => {
 const model='Transmissor '.repeat(30)+'5.3 USB-C 2 unidades 128 GB';
 assert.equal(normalizeSourceTitle(` \n${model}&nbsp;&amp; áudio &#x1F3A7; `),model+' & áudio 🎧');
 assert.equal(normalizeSourceTitle('A &#x110000; B &#xD800;'),'A &#x110000; B &#xD800;');
});
test('Shopee keeps range, derived anchor, unknown currency and unknown variant', () => {
 const base={itemId:'123',shopId:'456',productName:' Kit &amp; teste\n  2 peças ',productLink:'https://shopee.com.br/test',priceMin:'10',priceMax:'25',priceDiscountRate:'20'};
 const offer=mapProductNode(base)!;const e=offer.offerEvidence;
 assert.equal(offer.title,'Kit & teste 2 peças');assert.equal(offer.priceCents,1000);assert.equal(offer.originalPriceCents,1250);
 if(e?.version!==2)throw Error('v2 required');
 assert.equal(e.priceType,'range');assert.equal(e.priceMinCents,1000);assert.equal(e.priceMaxCents,2500);
 assert.equal(e.originalPriceKind,'derived_from_claim');assert.equal(e.currency,undefined);assert.deepEqual(e.variantIdentity,{state:'unknown'});
 const from=mapProductNode({...base,priceMax:undefined})!.offerEvidence;
 if(from?.version===2)assert.equal(from.priceType,'from');
});
test('AliExpress transports validated target currency and source anchor without selected option claim', () => {
 const node={product_id:123,product_title:' Modelo &#38; USB-C  ',product_detail_url:'https://aliexpress.com/item/123.html',target_sale_price:'20.00',target_sale_price_currency:' brl ',target_original_price:'40.00',target_original_price_currency:'BRL'};
 const offer=mapProductNodes([node],new Date('2026-10-28T00:00Z'),'BRL').offers[0]!;const e=offer.offerEvidence;
 assert.equal(offer.title,'Modelo & USB-C');if(e?.version!==2)throw Error('v2 required');
 assert.equal(e.currency,'BRL');assert.equal(e.originalPriceKind,'source_claimed');assert.equal(e.priceType,'unknown');assert.deepEqual(e.variantIdentity,{state:'unknown'});
 const invalid=mapProductNodes([{...node,target_original_price_currency:'USD'}],new Date(),'BRL').offers[0]!;
 assert.equal(invalid.originalPriceCents,undefined);if(invalid.offerEvidence?.version===2)assert.equal(invalid.offerEvidence.originalPriceKind,'unknown');
});
