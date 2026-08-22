import assert from "node:assert/strict";
import test from "node:test";
import { isAdminEmail, sanitizeNext, validUserId } from "../lib/auth-contract.ts";

test("isAdminEmail aceita exatamente o e-mail do dono, normalizado", () => {
  assert.equal(isAdminEmail("emanuel.adm10@gmail.com"), true);
  assert.equal(isAdminEmail("  EMANUEL.ADM10@GMAIL.COM  "), true);
  assert.equal(isAdminEmail("outra.conta@gmail.com"), false);
  assert.equal(isAdminEmail(""), false);
  assert.equal(isAdminEmail(undefined), false);
  assert.equal(isAdminEmail(null), false);
  assert.equal(isAdminEmail(42), false);
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
