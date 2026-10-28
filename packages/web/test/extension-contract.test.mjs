import assert from "node:assert/strict";
import test from "node:test";
import { validateExtensionCapturePayload, isMlHost } from "../lib/extension-contract.ts";

const valid = {
  version: 1,
  requestId: "123e4567-e89b-12d3-a456-426614174000",
  marketplace: "mercadolivre",
  clientCapturedAt: new Date().toISOString(),
  page: { kind: "offers", url: "https://www.mercadolivre.com.br/ofertas" },
  product: {
    externalId: "MLB1234567890",
    title: "Produto de teste válido",
    productUrl: "https://produto.mercadolivre.com.br/MLB-1234567890-x-_JM",
    priceCents: 19990,
    originalPriceCents: 24990,
  },
};

test("payload válido normaliza", () => {
  const p = validateExtensionCapturePayload(valid);
  assert.equal(p.requestId, valid.requestId);
  assert.equal(p.product.externalId, "MLB1234567890");
});

test("rejeita requestId ausente/inválido", () => {
  assert.throws(() => validateExtensionCapturePayload({ ...valid, requestId: "nope" }), /requestId/);
  assert.throws(() => validateExtensionCapturePayload({ ...valid, requestId: undefined }), /requestId/);
});

test("rejeita URL fora do Mercado Livre", () => {
  assert.throws(
    () => validateExtensionCapturePayload({ ...valid, product: { ...valid.product, productUrl: "https://evil.com/x" } }),
    /productUrl/,
  );
});

test("rejeita productUrl com matt_* vindo do client", () => {
  assert.throws(
    () => validateExtensionCapturePayload({
      ...valid,
      product: { ...valid.product, productUrl: "https://produto.mercadolivre.com.br/x?matt_word=abc" },
    }),
    /matt_\*/,
  );
});

test("rejeita preço inválido e título fora do tamanho", () => {
  assert.throws(() => validateExtensionCapturePayload({ ...valid, product: { ...valid.product, priceCents: 0 } }), /priceCents/);
  assert.throws(() => validateExtensionCapturePayload({ ...valid, product: { ...valid.product, title: "ab" } }), /title/);
});

test("rejeita externalId que não é MLB", () => {
  assert.throws(() => validateExtensionCapturePayload({ ...valid, product: { ...valid.product, externalId: "123" } }), /externalId/);
});

test("rejeita timestamp de captura no futuro além do plausível", () => {
  const future = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  assert.throws(() => validateExtensionCapturePayload({ ...valid, clientCapturedAt: future }), /clientCapturedAt/);
});

test("ignora originalPriceCents quando não é maior que o atual", () => {
  const p = validateExtensionCapturePayload({ ...valid, product: { ...valid.product, originalPriceCents: 1000 } });
  assert.equal(p.product.originalPriceCents, undefined);
});

test("isMlHost aceita CDN e domínios ML, rejeita estranhos", () => {
  assert.equal(isMlHost("www.mercadolivre.com.br"), true);
  assert.equal(isMlHost("http2.mlstatic.com"), true);
  assert.equal(isMlHost("evil.com"), false);
});

test('v1 supports old outbox and complete long titles, accepting only declared currency', () => {
 const title='Transmissor '.repeat(35)+'USB-C 5.3 2 unidades';
 const p=validateExtensionCapturePayload({...valid,product:{...valid.product,title:'  '+title+'  ',currency:'BRL',priceType:'from'}});
 assert.equal(p.product.title,title);assert.equal(p.product.currency,'BRL');assert.equal(p.product.priceType,'from');
 const legacy=validateExtensionCapturePayload(valid);assert.equal(legacy.product.currency,undefined);assert.equal(legacy.product.priceType,undefined);
 assert.equal(validateExtensionCapturePayload({...valid,product:{...valid.product,currency:'USD'}}).product.currency,undefined);
 assert.throws(()=>validateExtensionCapturePayload({...valid,product:{...valid.product,title:'x'.repeat(2001)}}),/title/);
});
