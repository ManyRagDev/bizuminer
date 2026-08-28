import assert from "node:assert/strict";
import test from "node:test";
import {
  base64urlDecode,
  base64urlEncode,
  decodeManualCaptureBlock,
  encodeManualCaptureBlock,
  fnv1a32,
} from "../lib/manual-capture.ts";

function sample(overrides = {}) {
  return {
    v: 1,
    m: "mercadolivre",
    u: "https://produto.mercadolivre.com.br/MLB-1234567890-fone-bluetooth-_JM",
    i: "MLB1234567890",
    t: "Fone Bluetooth TWS",
    p: 9990,
    c: Date.UTC(2026, 7, 24, 12, 0, 0),
    ...overrides,
  };
}

test("encode → decode devolve o payload original (roundtrip)", () => {
  const payload = sample({ op: 19990, img: "https://http2.mlstatic.com/foto.jpg" });
  const block = encodeManualCaptureBlock(payload);
  assert.deepEqual(decodeManualCaptureBlock(block), payload);
});

test("bloco aceita payload mínimo sem preço original e imagem", () => {
  const payload = sample();
  const block = encodeManualCaptureBlock(payload);
  const decoded = decodeManualCaptureBlock(block);
  assert.equal(decoded.op, undefined);
  assert.equal(decoded.img, undefined);
});

test("bloco corrompido (1 caractere) é rejeitado pelo checksum", () => {
  const block = encodeManualCaptureBlock(sample());
  const parts = block.split(".");
  const encoded = parts[1];
  const corrupted = encoded.slice(0, -1) + (encoded.endsWith("A") ? "B" : "A");
  const bad = `${parts[0]}.${corrupted}.${parts[2]}`;
  assert.throws(() => decodeManualCaptureBlock(bad), /checksum não confere/);
});

test("bloco com checksum forjado é rejeitado", () => {
  const block = encodeManualCaptureBlock(sample());
  const parts = block.split(".");
  const bad = `${parts[0]}.${parts[1]}.deadbeef`;
  assert.throws(() => decodeManualCaptureBlock(bad), /checksum não confere/);
  assert.throws(() => decodeManualCaptureBlock("BM2.abc.def"), /formato esperado BM1/);
  assert.throws(() => decodeManualCaptureBlock("abc.def.ghi"), /formato esperado BM1/);
});

test("valida versão e marketplace", () => {
  assert.throws(() => decodeManualCaptureBlock(encodeManualCaptureBlock(sample({ v: 2 }))), /versão não suportada/);
  assert.throws(() => decodeManualCaptureBlock(encodeManualCaptureBlock(sample({ m: "shopee" }))), /marketplace não suportado/);
});

test("valida URL e ID do anúncio", () => {
  assert.throws(() => decodeManualCaptureBlock(encodeManualCaptureBlock(sample({ u: "http://exemplo.com" }))), /URL ausente ou não é https/);
  assert.throws(() => decodeManualCaptureBlock(encodeManualCaptureBlock(sample({ u: "https://www.amazon.com.br/foo" }))), /URL não é do Mercado Livre/);
  assert.throws(() => decodeManualCaptureBlock(encodeManualCaptureBlock(sample({ i: "MLA1234567890" }))), /ID do anúncio/);
  assert.throws(() => decodeManualCaptureBlock(encodeManualCaptureBlock(sample({ i: "MLB12345" }))), /ID do anúncio/);
});

test("valida título e preço", () => {
  assert.throws(() => decodeManualCaptureBlock(encodeManualCaptureBlock(sample({ t: "   " }))), /título ausente/);
  assert.throws(() => decodeManualCaptureBlock(encodeManualCaptureBlock(sample({ p: 0 }))), /preço ausente ou inválido/);
  assert.throws(() => decodeManualCaptureBlock(encodeManualCaptureBlock(sample({ p: 99.5 }))), /preço ausente ou inválido/);
});

test("valida timestamp de captura plausível", () => {
  assert.throws(() => decodeManualCaptureBlock(encodeManualCaptureBlock(sample({ c: Date.UTC(2000, 0, 1) }))), /timestamp/);
});

test("base64url faz ida e volta com acentuação", () => {
  const value = "Fone Bluetooth TWS com micro pré-âudio e Ção";
  const encoded = base64urlEncode(value);
  assert.ok(!encoded.includes("+") && !encoded.includes("/") && !encoded.endsWith("="), "deve ser URL-safe sem padding");
  assert.equal(base64urlDecode(encoded), value);
});

test("fnv1a32 é determinístico e difere para entradas distintas", () => {
  assert.equal(fnv1a32("abc"), fnv1a32("abc"));
  assert.notEqual(fnv1a32("abc"), fnv1a32("abd"));
  assert.equal(fnv1a32(""), 0x811c9dc5);
});
