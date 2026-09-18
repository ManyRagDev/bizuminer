import test from "node:test";
import assert from "node:assert/strict";
import { createPautaAuthToken, verifyPautaAuthToken } from "../lib/pauta-auth.ts";

test("createPautaAuthToken generates a valid HMAC token that verifies successfully", () => {
  const token = createPautaAuthToken();
  assert.ok(typeof token === "string" && token.includes("."));
  assert.equal(verifyPautaAuthToken(token), true);
});

test("verifyPautaAuthToken rejects tampered signature", () => {
  const token = createPautaAuthToken();
  const [b64] = token.split(".");
  assert.equal(verifyPautaAuthToken(`${b64}.fakeSignature123`), false);
});

test("verifyPautaAuthToken rejects empty or non-string inputs", () => {
  assert.equal(verifyPautaAuthToken(null), false);
  assert.equal(verifyPautaAuthToken(""), false);
  assert.equal(verifyPautaAuthToken("invalid"), false);
});
