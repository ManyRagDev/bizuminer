import test from "node:test";
import assert from "node:assert/strict";
import {
  isFlashSaleActive,
  formatFlashSaleTime,
  formatFlashSaleDeadline,
  formatFlashSaleRemaining,
} from "../lib/flash-sale.ts";
import {
  buildRelampagoCopy,
  buildSinceroCopy,
  buildDiretoCopy,
  extractPautaCopyData,
} from "../lib/copy-styles.ts";
import { validateExtensionCapturePayload } from "../lib/extension-contract.ts";

test("isFlashSaleActive valida prazo e tipo de promoção", () => {
  const now = Date.parse("2026-11-18T20:00:00.000Z");
  const future = new Date(now + 3600 * 1000).toISOString();
  const past = new Date(now - 3600 * 1000).toISOString();

  assert.equal(isFlashSaleActive("lightning", future, now), true);
  assert.equal(isFlashSaleActive("lightning", past, now), false);
  assert.equal(isFlashSaleActive("regular", future, now), false);
  assert.equal(isFlashSaleActive("lightning", null, now), false);
});

test("formatFlashSaleTime e formatFlashSaleDeadline usam o fuso de Brasília", () => {
  // 2026-11-18T23:59:00Z em UTC é 20:59 em Brasília (UTC-3)
  const endsAt = "2026-11-18T23:59:00.000Z";
  assert.equal(formatFlashSaleTime(endsAt), "20:59");

  // Mesmo dia em Brasília
  const nowSameDay = Date.parse("2026-11-18T18:00:00.000Z"); // 15:00 em Brasília
  const deadlineSameDay = formatFlashSaleDeadline(endsAt, nowSameDay);
  assert.equal(deadlineSameDay, "válido hoje até às 20:59");

  // Vira o dia (ex: termina na madrugada de 19/11 em Brasília: 2026-11-19T05:00:00Z -> 02:00 BRT)
  const endsNextDay = "2026-11-19T05:00:00.000Z";
  const deadlineNextDay = formatFlashSaleDeadline(endsNextDay, nowSameDay);
  assert.equal(deadlineNextDay, "válido até amanhã às 02:00");

  // Expirado
  const nowAfter = Date.parse("2026-11-19T06:00:00.000Z");
  assert.equal(formatFlashSaleDeadline(endsAt, nowAfter), null);
});

test("formatFlashSaleRemaining expressa tempo amigável", () => {
  const now = Date.parse("2026-11-18T18:00:00.000Z");
  const ends3h40 = new Date(now + (3 * 3600 + 40 * 60) * 1000).toISOString();
  assert.equal(formatFlashSaleRemaining(ends3h40, now), "faltam 3h 40m");

  const ends25m = new Date(now + 25 * 60 * 1000).toISOString();
  assert.equal(formatFlashSaleRemaining(ends25m, now), "faltam 25m");
});

test("Copies de WhatsApp incluem a linha de Oferta Relâmpago quando ativa", () => {
  const endsAt = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
  const deadline = formatFlashSaleDeadline(endsAt);
  const expectedBanner = `⚡ \\*OFERTA RELÂMPAGO · ${deadline.toUpperCase()}!\\*`;

  const offerData = {
    title: "Air Fryer Mondial 4L Inox",
    priceCents: 24900,
    marketplace: "mercadolivre",
    shareUrl: "https://www.bizuminer.com.br/p/fryer1",
    promotionType: "lightning",
    promotionEndsAt: endsAt,
  };

  const copyRelampago = buildRelampagoCopy(offerData);
  assert.match(copyRelampago, new RegExp(`^${expectedBanner}`));
  assert.match(copyRelampago, /👉 \*Pegue antes de encerrar:\* https:\/\/www\.bizuminer\.com\.br\/p\/fryer1/);

  const copySincero = buildSinceroCopy(offerData);
  assert.match(copySincero, new RegExp(`^${expectedBanner}`));

  const copyDireto = buildDiretoCopy(offerData);
  assert.match(copyDireto, new RegExp(`^${expectedBanner}`));
});

test("extractPautaCopyData preserva promotionType e promotionEndsAt", () => {
  const endsAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
  const pautaProduct = {
    title: "Mouse Gamer Sem Fio",
    priceCents: 8900,
    marketplace: "mercadolivre",
    shareUrl: "https://www.bizuminer.com.br/p/mouse1",
    promotionType: "lightning",
    promotionEndsAt: endsAt,
  };

  const copyData = extractPautaCopyData(pautaProduct);
  assert.equal(copyData.promotionType, "lightning");
  assert.equal(copyData.promotionEndsAt, endsAt);
});

test("validateExtensionCapturePayload aceita promotionType e promotionEndsAt válidos", () => {
  const capturedAt = new Date().toISOString();
  const endsAt = new Date(Date.now() + 3600 * 1000).toISOString();

  const validated = validateExtensionCapturePayload({
    version: 1,
    requestId: "123e4567-e89b-12d3-a456-426614174000",
    marketplace: "mercadolivre",
    clientCapturedAt: capturedAt,
    page: { kind: "offers", url: "https://www.mercadolivre.com.br/ofertas" },
    product: {
      externalId: "MLB12345678",
      productUrl: "https://produto.mercadolivre.com.br/MLB-12345678-x-_JM",
      title: "Produto em Oferta Relâmpago",
      priceCents: 9900,
      promotionType: "lightning",
      promotionEndsAt: endsAt,
    },
  });

  assert.equal(validated.product.promotionType, "lightning");
  assert.equal(validated.product.promotionEndsAt, endsAt);
});
