import assert from "node:assert/strict";
import test from "node:test";
import {
  generateDeviceToken,
  hashToken,
  tokenPrefix,
  generatePairingCode,
  normalizePairingCode,
  hashPairingCode,
  timingSafeEqualHex,
  TOKEN_PREFIX,
  PAIRING_CODE_LENGTH,
} from "../lib/extension-token.ts";

test("token de dispositivo tem prefixo bm_ext_ e alta entropia", () => {
  const t1 = generateDeviceToken();
  const t2 = generateDeviceToken();
  assert.ok(t1.startsWith(TOKEN_PREFIX));
  assert.notEqual(t1, t2);
  assert.ok(t1.length > TOKEN_PREFIX.length + 20);
});

test("hashToken é determinístico e não revela o bruto", () => {
  const token = generateDeviceToken();
  assert.equal(hashToken(token), hashToken(token));
  assert.doesNotMatch(hashToken(token), new RegExp(token.slice(0, 10)));
});

test("tokenPrefix é curto e não contém o token completo", () => {
  const token = generateDeviceToken();
  const prefix = tokenPrefix(token);
  assert.ok(prefix.length <= TOKEN_PREFIX.length + 8);
  assert.notEqual(prefix, token);
  assert.doesNotMatch(prefix, new RegExp(token.slice(10)));
});

test("código de pareamento tem o tamanho certo e usa o alfabeto sem ambíguos", () => {
  const code = generatePairingCode();
  assert.equal(code.length, PAIRING_CODE_LENGTH);
  assert.match(code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/);
});

test("normalizePairingCode limpa maiúsculas e espaços", () => {
  assert.equal(normalizePairingCode(" ab cd "), "ABCD");
  assert.equal(normalizePairingCode("a-b"), "A-B");
});

test("hashPairingCode é estável e timingSafeEqualHex compara em tempo constante", () => {
  const code = generatePairingCode();
  assert.equal(hashPairingCode(code), hashPairingCode(code));
  assert.equal(timingSafeEqualHex(hashPairingCode(code), hashPairingCode(code)), true);
  assert.equal(timingSafeEqualHex(hashPairingCode(code), hashPairingCode(generatePairingCode())), false);
});
