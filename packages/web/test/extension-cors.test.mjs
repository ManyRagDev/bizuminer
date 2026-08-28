import assert from "node:assert/strict";
import test from "node:test";
import { extensionAllowedOrigins, isAllowedExtensionOrigin, extensionCorsHeaders } from "../lib/extension-cors.ts";

test("allowlist vazia → nenhuma origem permitida", () => {
  assert.deepEqual(extensionAllowedOrigins({}), []);
  assert.equal(isAllowedExtensionOrigin("chrome-extension://abc", {}), false);
});

test("allowlist parseia lista separada por vírgula", () => {
  const env = { EXTENSION_ALLOWED_ORIGINS: "chrome-extension://a, https://www.bizuminer.com.br" };
  assert.deepEqual(extensionAllowedOrigins(env), ["chrome-extension://a", "https://www.bizuminer.com.br"]);
  assert.equal(isAllowedExtensionOrigin("chrome-extension://a", env), true);
  assert.equal(isAllowedExtensionOrigin("chrome-extension://b", env), false);
});

test("cors headers só incluem ACAO quando a origem é permitida", () => {
  const env = { EXTENSION_ALLOWED_ORIGINS: "chrome-extension://a" };
  const allowed = extensionCorsHeaders("chrome-extension://a", env);
  assert.equal(allowed["Access-Control-Allow-Origin"], "chrome-extension://a");
  const denied = extensionCorsHeaders("chrome-extension://b", env);
  assert.equal(denied["Access-Control-Allow-Origin"], undefined);
});
