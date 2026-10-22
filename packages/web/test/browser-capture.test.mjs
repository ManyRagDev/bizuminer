import assert from "node:assert/strict";
import test from "node:test";
import {
  validateBrowserCapture,
  decodeBrowserCaptureBlock,
} from "../lib/browser-capture-contract.ts";
import { base64urlEncode, fnv1a32 } from "../lib/manual-capture.ts";
import { browserCaptureBookmarklet } from "../lib/browser-capture-bookmarklet.ts";
const valid = () => ({
  version: 1,
  requestId: "123e4567-e89b-42d3-a456-426614174000",
  marketplace: "mercadolivre",
  clientCapturedAt: new Date().toISOString(),
  page: {
    kind: "offers",
    url: "https://www.mercadolivre.com.br/ofertas?tracking=secret",
  },
  products: [
    {
      externalId: "MLB1234567890",
      title: "Produto de teste",
      productUrl:
        "https://www.mercadolivre.com.br/fone/p/MLB1234567?wid=MLB1234567890&tracking=secret",
      priceCents: 10000,
    },
  ],
});
test("importação normaliza dados, preserva anúncio e remove rastreadores", () => {
  const p = valid();
  p.products.push(p.products[0]);
  const normalized = validateBrowserCapture(p);
  assert.equal(normalized.products.length, 1);
  assert.equal(
    normalized.products[0].productUrl,
    "https://www.mercadolivre.com.br/fone/p/MLB1234567?wid=MLB1234567890",
  );
  assert.equal(normalized.page.url, "https://www.mercadolivre.com.br/ofertas");
  const raw = base64urlEncode(JSON.stringify(p));
  assert.deepEqual(
    decodeBrowserCaptureBlock(`BM2.${raw}.${fnv1a32(raw).toString(16)}`),
    normalized,
  );
  assert.throws(() => decodeBrowserCaptureBlock(`BM2.${raw}.wrong`));
});
test("importação rejeita ID de catálogo sem anúncio, preço inválido, página de login e bloco vencido", () => {
  const p = valid();
  assert.throws(
    () =>
      validateBrowserCapture({
        ...p,
        products: [
          {
            ...p.products[0],
            productUrl: "https://www.mercadolivre.com.br/p/MLB1234567890",
          },
        ],
      }),
    /identity/,
  );
  assert.throws(() =>
    validateBrowserCapture({
      ...p,
      products: [{ ...p.products[0], priceCents: 0 }],
    }),
  );
  assert.throws(
    () =>
      validateBrowserCapture({
        ...p,
        page: {
          kind: "offers",
          url: "https://www.mercadolivre.com.br/gz/account-verification",
        },
      }),
    /offers_page/,
  );
  assert.throws(
    () =>
      validateBrowserCapture({
        ...p,
        clientCapturedAt: new Date(Date.now() - 31 * 60_000).toISOString(),
      }),
    /capture_time/,
  );
  assert.throws(() => validateBrowserCapture({ ...p, products: [] }), /count/);
});
test("bookmarklet de listagem compila e não transporta sessão ou faz requests", () => {
  const code = browserCaptureBookmarklet();
  assert.equal(/[\r\n\t]/.test(code), false);
  const source = decodeURIComponent(
    new URL(code).href.slice("javascript:".length),
  );
  assert.doesNotThrow(() => new Function(source));
  assert.equal(
    /fetch\(|XMLHttpRequest|document\.cookie|localStorage|sessionStorage/.test(
      source,
    ),
    false,
  );
});

test("favorito completo copia BM2 compatível com a importação, sem pedir sessão", async () => {
  const { default: vm } = await import("node:vm");
  let copied;
  const attr = (value) => ({ getAttribute: () => value });
  const card = {
    textContent: "Classificação 4.8 de 5 estrelas. +50mil vendidos",
    querySelector(selector) {
      if (selector === "a.poly-component__title")
        return {
          href: "https://www.mercadolivre.com.br/produto/p/MLB1234567#wid=MLB1234567890&tracking_id=omitido",
          textContent: "Oferta real de teste",
        };
      if (selector.startsWith(".poly-price")) return attr("11 reais");
      if (selector.startsWith("[aria-label^")) return attr("Antes: 100 reais");
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  vm.runInNewContext(
    decodeURIComponent(
      new URL(browserCaptureBookmarklet()).href.slice("javascript:".length),
    ),
    {
      URL,
      URLSearchParams,
      TextEncoder,
      btoa,
      location: { href: "https://www.mercadolivre.com.br/ofertas" },
      document: { querySelectorAll: () => [card] },
      crypto: { randomUUID: () => valid().requestId },
      navigator: {
        clipboard: {
          writeText: async (value) => {
            copied = value;
          },
        },
      },
      alert: () => {},
      prompt: () => {
        throw new Error("fallback inesperado");
      },
    },
  );
  await Promise.resolve();
  const result = decodeBrowserCaptureBlock(copied);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].priceCents, 1100);
  assert.equal(result.products[0].externalId, "MLB1234567890");
  assert.equal(result.products[0].productUrl.includes("tracking_id"), false);
});
