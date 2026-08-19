import assert from "node:assert/strict";
import test from "node:test";
import { categoryForTitle } from "../src/category.ts";

test("classifica somente títulos com pista explícita", () => {
  assert.equal(categoryForTitle("Creatina 1kg monohidratada"), "Suplementos");
  assert.equal(categoryForTitle("Notebook Acer Aspire Go"), "Tecnologia");
  assert.equal(categoryForTitle("Produto sem pista suficiente"), undefined);
});
