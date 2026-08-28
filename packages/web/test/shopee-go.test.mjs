import assert from "node:assert/strict";
import test from "node:test";
import { shopeeRedirectTarget } from "../lib/db.ts";

/**
 * M3 (plano-multiplataforma.md): o /go da Shopee nunca pode redirecionar
 * para a URL crua do produto — isso perde a comissão em silêncio. Estes
 * testes cobrem a decisão pura (sem banco): dado o que a publication tem
 * persistido, o /go só redireciona quando existe affiliate_url.
 */

test("produto sem publication → not_found (nunca inventa marketplace/URL)", () => {
  const target = shopeeRedirectTarget(null);
  assert.equal(target.kind, "not_found");
});

test("publication sem affiliate_url gerado → not_found, falha fechada", () => {
  const target = shopeeRedirectTarget({
    publicationId: "pub-1",
    tenantId: "local",
    affiliateUrl: null,
  });
  assert.equal(target.kind, "not_found");
  assert.match(target.reason, /ainda não gerado/);
});

test("publication com affiliate_url persistido → redireciona para o link pré-gerado", () => {
  const target = shopeeRedirectTarget({
    publicationId: "pub-1",
    tenantId: "local",
    affiliateUrl: "https://s.shopee.com.br/abc123",
  });
  assert.equal(target.kind, "redirect");
  assert.equal(target.url, "https://s.shopee.com.br/abc123");
  assert.equal(target.publicationId, "pub-1");
  assert.equal(target.tenantId, "local");
});

test("o tipo de entrada não carrega product_url — impossível vazar o link cru por acidente", () => {
  // Documenta a garantia estrutural: ShopeePublicationResolution só tem
  // publicationId/tenantId/affiliateUrl. Se alguém adicionar productUrl a
  // essa interface no futuro para "simplificar", este teste não pega isso
  // em tempo de execução — é o typecheck do TS que barra o uso indevido.
  // Aqui só travamos que affiliateUrl nulo nunca produz um "redirect".
  const target = shopeeRedirectTarget({ publicationId: "p", tenantId: "local", affiliateUrl: "" });
  assert.equal(target.kind, "not_found", "string vazia é falsy — tratada como ausente, não como URL válida");
});
