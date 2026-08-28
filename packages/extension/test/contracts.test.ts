import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { newRequestId, pageKindFor } from "../src/lib/contracts.ts";

describe("contracts", () => {
  it("newRequestId é UUID v4 (formato)", () => {
    const id = newRequestId();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.notEqual(newRequestId(), newRequestId());
  });

  it("pageKindFor classifica as superfícies do ML", () => {
    assert.equal(pageKindFor("https://www.mercadolivre.com.br/ofertas"), "offers");
    assert.equal(pageKindFor("https://lista.mercadolivre.com.br/celular"), "search");
    assert.equal(pageKindFor("https://www.mercadolivre.com.br/c/tecnologia"), "category");
    assert.equal(pageKindFor("https://produto.mercadolivre.com.br/MLB-123-_JM"), "product");
  });
});
