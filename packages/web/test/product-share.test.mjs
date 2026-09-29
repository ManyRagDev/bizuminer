import assert from "node:assert/strict";
import test from "node:test";
import { productShareDescription, productShareUrl } from "../lib/product-share.ts";

test("link do produto usa domínio público e página com metadados", () => {
  assert.equal(productShareUrl("ml-MLB123"), "https://www.bizuminer.com.br/bizu/ml-MLB123");
});

test("prévia distingue preço recente de última captura antiga", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  const product = { price_cents: 12990, marketplace: "mercadolivre", evidence_observed_at: "2026-09-29T09:00:00Z" };
  assert.match(productShareDescription(product, now), /R\$\s?129,90.*Mercado Livre.*preço monitorado/);
  assert.match(productShareDescription({ ...product, evidence_observed_at: "2026-09-25T12:00:00Z" }, now), /Última captura:.*há 4 dias.*Confira o preço atual/);
});
