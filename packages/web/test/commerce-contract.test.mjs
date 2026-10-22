import test from "node:test";
import assert from "node:assert/strict";
import {
  generateCampaignLinkCode,
  isCampaignLinkCode,
  calculateContentDigest,
  VALID_CHANNEL_TYPES,
  VALID_DESTINATION_KINDS,
  VALID_CAMPAIGN_STATUSES,
  VALID_KIT_STATUSES,
  VALID_PUBLICATION_STATUSES,
  VALID_MONETIZATION_STATUSES,
} from "../lib/commerce-contract.ts";
import { isValidShortCode } from "../lib/short-code.ts";

test("generateCampaignLinkCode generates 12-character alphanumeric code", () => {
  const codes = new Set();
  for (let i = 0; i < 50; i++) {
    const code = generateCampaignLinkCode();
    assert.equal(code.length, 12, "deve ter exatamente 12 caracteres");
    assert.equal(isCampaignLinkCode(code), true, "deve ser reconhecido como link de campanha");
    assert.equal(isValidShortCode(code), false, "não deve colidir com código curto de 4 caracteres");
    codes.add(code);
  }
  assert.equal(codes.size, 50, "todos os códigos gerados devem ser únicos");
});

test("isCampaignLinkCode correctly distinguishes 12-char campaign codes from 4-char legacy codes", () => {
  const code1 = generateCampaignLinkCode();
  const code2 = generateCampaignLinkCode();
  assert.equal(isCampaignLinkCode(code1), true);
  assert.equal(isCampaignLinkCode(code2), true);
  assert.equal(isCampaignLinkCode("ab3k9zx42qwp"), true);

  // Invalid cases
  assert.equal(isCampaignLinkCode("ab3k"), false, "4-char legacy code is not a campaign code");
  assert.equal(isCampaignLinkCode("ab3k9zx42qw"), false, "11 chars is not 12");
  assert.equal(isCampaignLinkCode("ab3k9zx42qwp9"), false, "13 chars is not 12");
  assert.equal(isCampaignLinkCode("ab3k9zx42qw!"), false, "special chars rejected");
  assert.equal(isCampaignLinkCode("ab3k9zx42qw0"), false, "0 is excluded from alphabet");
  assert.equal(isCampaignLinkCode("ab3k9zx42qw1"), false, "1 is excluded from alphabet");
  assert.equal(isCampaignLinkCode(""), false);
});

test("calculateContentDigest produces deterministic sha256 hash", () => {
  const payload1 = { title: "Fone de Ouvido", price: 99.9, url: "https://mercadolivre.com/..." };
  const payload2 = { price: 99.9, title: "Fone de Ouvido", url: "https://mercadolivre.com/..." };
  const digest1 = calculateContentDigest(payload1);
  const digest2 = calculateContentDigest(payload2);

  assert.equal(digest1, digest2, "deve ser estável com chaves em ordens diferentes");
  assert.equal(typeof digest1, "string");
  assert.equal(digest1.length, 64, "deve ser sha256 em hexadecimal");

  const payloadDifferent = { title: "Fone de Ouvido Pro", price: 99.9 };
  assert.notEqual(calculateContentDigest(payloadDifferent), digest1);
});

test("constants validate allowed enum values per C-04, C-05, C-06", () => {
  assert.deepEqual(VALID_CHANNEL_TYPES, [
    "whatsapp_channel",
    "whatsapp_group",
    "telegram_channel",
    "telegram",
    "webhook",
    "instagram_feed",
    "instagram_stories",
    "internal_web",
  ]);

  assert.deepEqual(VALID_DESTINATION_KINDS, [
    "internal_bizu",
    "direct_affiliate",
    "marketplace_card",
  ]);

  assert.deepEqual(VALID_CAMPAIGN_STATUSES, [
    "draft",
    "active",
    "archived",
  ]);

  assert.deepEqual(VALID_KIT_STATUSES, [
    "draft",
    "validating",
    "needs_revision",
    "approved",
    "invalidated",
    "archived",
  ]);

  assert.deepEqual(VALID_PUBLICATION_STATUSES, [
    "planned",
    "ready",
    "exported",
    "published_confirmed",
    "cancelled",
    "expired",
    "failed",
  ]);

  assert.deepEqual(VALID_MONETIZATION_STATUSES, [
    "reserved",
    "valid",
    "invalid",
    "revoked",
  ]);
});

test("digest retains nested facts, claims and links while ignoring object key order",()=>{
 const original={snapshot:{priceCents:100,currency:'BRL'},materials:[{campaignLinkId:'a',shortCopy:'Texto'}]};
 assert.equal(calculateContentDigest(original),calculateContentDigest({materials:original.materials,snapshot:{currency:'BRL',priceCents:100}}));
 assert.notEqual(calculateContentDigest(original),calculateContentDigest({...original,snapshot:{...original.snapshot,priceCents:200}}));
 assert.notEqual(calculateContentDigest(original),calculateContentDigest({...original,materials:[{...original.materials[0],campaignLinkId:'b'}]}));
});
