import assert from "node:assert/strict";
import test from "node:test";
import { isAppRole, sanitizeNext, validUserId } from "../lib/auth-contract.ts";

test("isAppRole aceita somente roles conhecidas da aplicação", () => {
  assert.equal(isAppRole("afiliado"), true);
  assert.equal(isAppRole("admin"), false);
  assert.equal(isAppRole(" AFILIADO "), false);
  assert.equal(isAppRole(""), false);
  assert.equal(isAppRole(undefined), false);
  assert.equal(isAppRole(null), false);
  assert.equal(isAppRole(42), false);
});

test("sanitizeNext só deixa caminho interno passar", () => {
  assert.equal(sanitizeNext("/minha-area"), "/minha-area");
  assert.equal(sanitizeNext("/admin"), "/admin");
  assert.equal(sanitizeNext("/minha-area?tab=salvos"), "/minha-area?tab=salvos");
  assert.equal(sanitizeNext(null), "/minha-area");
  assert.equal(sanitizeNext(undefined), "/minha-area");
  assert.equal(sanitizeNext(""), "/minha-area");
  // Open redirect: absolutos, protocolos e protocol-relativo são rejeitados.
  assert.equal(sanitizeNext("https://evil.example"), "/minha-area");
  assert.equal(sanitizeNext("//evil.example"), "/minha-area");
  assert.equal(sanitizeNext("javascript:alert(1)"), "/minha-area");
  assert.equal(sanitizeNext("a/minha-area"), "/minha-area");
  // Fallback customizado respeitado.
  assert.equal(sanitizeNext(null, "/admin"), "/admin");
  assert.equal(sanitizeNext("https://evil.example", "/admin"), "/admin");
  // Tamanho: abuso via payload gigante não passa.
  assert.equal(sanitizeNext("/" + "a".repeat(201)), "/minha-area");
});

test("validUserId reexportado do contrato da área (mesma régua)", () => {
  assert.equal(validUserId("0d539916-c495-41ea-b569-a3b3f714d3e1"), true);
  assert.equal(validUserId("not-a-uuid"), false);
});
