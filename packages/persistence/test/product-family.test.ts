import { test } from "node:test";
import assert from "node:assert/strict";

import { familyInfoForTitle, productFamilyForTitle } from "../src/product-family.ts";

test("reconhece famílias com evidência explícita no título", () => {
  assert.equal(productFamilyForTitle("Par de Manopla Esportiva Para Moto Universal"), "manoplas_moto");
  assert.equal(productFamilyForTitle("Kit 24 Unhas Postiças em Gel"), "unhas_manicure");
  assert.equal(productFamilyForTitle("Carregador USB C 65W GaN"), "carregamento");
  assert.equal(productFamilyForTitle("Cafeteira Elétrica Mondial Smart 15 Xícaras"), "cafeteiras");
  assert.equal(productFamilyForTitle("Cafeteira Expresso Oster Prima Latte II"), "cafeteiras");
});

test("não agrupa produto sem pista forte numa família genérica", () => {
  assert.equal(productFamilyForTitle("Produto inovador premium edição 2026"), undefined);
});

test("familyInfoForTitle devolve chave, rótulo, método e versão do classificador", () => {
  const info = familyInfoForTitle("Kit 24 Unhas Postiças em Gel");
  assert.deepEqual(info, {
    key: "unhas_manicure",
    label: "Unhas e manicure",
    method: "title-keywords",
    version: "v1",
  });
  const infoCafeteira = familyInfoForTitle("Cafeteira Elétrica Mondial Smart 15 Xícaras");
  assert.deepEqual(infoCafeteira, {
    key: "cafeteiras",
    label: "Cafeteiras",
    method: "title-keywords",
    version: "v2",
  });
  assert.equal(familyInfoForTitle("Produto genérico sem pista"), undefined);
});

