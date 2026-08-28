import assert from "node:assert/strict";
import test from "node:test";
import { validTenantId, assertSameTenant } from "../lib/tenant-db.ts";

test("validTenantId aceita slugs de conta e 'local'", () => {
  assert.equal(validTenantId("local"), true);
  assert.equal(validTenantId("bizuminer"), true);
  assert.equal(validTenantId("afiliado-1.x_y"), true);
});

test("validTenantId rejeita valores fora do contrato", () => {
  assert.equal(validTenantId(""), false);
  assert.equal(validTenantId("UPPER CASE"), false);
  assert.equal(validTenantId("a".repeat(65)), false);
  assert.equal(validTenantId(null), false);
  assert.equal(validTenantId("has space"), false);
});

test("assertSameTenant só passa quando os dois tenants são iguais e válidos", () => {
  assert.equal(assertSameTenant("local", "local"), true);
  assert.equal(assertSameTenant("a", "b"), false);
  assert.equal(assertSameTenant("local", ""), false);
  assert.equal(assertSameTenant(null, null), false);
});
