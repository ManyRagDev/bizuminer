import test from "node:test";
import assert from "node:assert/strict";
import {
  validateDraft,
  sourceProduct,
  contextualOffers,
} from "../lib/affiliate-workspace-contract.ts";
import { optionIdentity } from "../lib/offer-option.ts";
import { workspaceJson } from "../lib/workspace-request.ts";
import { canCompleteOnboardingStep } from "../lib/saas-onboarding-contract.ts";
test("personal draft whitelist excludes supplied account, author and server state", () => {
  const draft = {
    id: crypto.randomUUID(),
    expectedVersion: 0,
    kind: "offer",
    channel: "stories",
    title: "Organizar a casa",
    productId: null,
    optionKey: null,
    sourceUrl: "",
    content: {
      text: "Minha indicação",
      notes: "",
      observationId: "",
      evidenceFingerprint: "",
      assetIds: [],
      appSecret: "must-not-persist",
    },
    tenantId: "another",
    authorId: "another",
    state: "published",
  };
  const input = validateDraft(draft);
  assert.ok(input);
  assert.equal(input.tenantId, undefined);
  assert.equal(input.authorId, undefined);
  assert.equal(input.state, undefined);
  assert.equal(input.content.appSecret, undefined);
  assert.equal(validateDraft({ ...draft, optionKey: "listing" }), null);
  assert.equal(validateDraft({ ...draft, expectedVersion: -1 }), null);
});
test("capture recognizes canonical store links without accepting lookalikes or credentials", () => {
  assert.equal(
    sourceProduct("https://shopee.com.br/product/123/456").externalId,
    "456",
  );
  assert.equal(
    sourceProduct("https://produto.mercadolivre.com.br/MLB-1234567-produto")
      .externalId,
    "MLB1234567",
  );
  assert.equal(
    sourceProduct("https://pt.aliexpress.com/item/123456.html").marketplace,
    "aliexpress",
  );
  for (const url of [
    "https://shopee.com.br.attacker.test/product/1/2",
    "https://user:secret@shopee.com.br/product/1/2",
    "http://shopee.com.br/product/1/2",
    "https://s.shopee.com.br/short",
  ])
    assert.equal(sourceProduct(url), null);
});
test("known contextual facts support accent insensitive search and common usage terms", () => {
  const offers = [
    {
      candidate: {
        title: "Organizador de cozinha",
        assessment: {
          benefit: "Mantém os utensílios em ordem",
          purchaseContents: "Duas unidades",
        },
      },
      blockers: { whatsapp: [], stories: ["Revisar"] },
    },
  ];
  assert.equal(
    contextualOffers(offers, "organizar a cozinha", "ready").length,
    1,
  );
  assert.equal(contextualOffers(offers, "utensílios em ordem").length, 1);
  assert.equal(
    contextualOffers(offers, "organizar", "ready", "stories").length,
    0,
  );
  assert.equal(
    optionIdentity("Azul — Grande"),
    optionIdentity("azul — grande"),
  );
  assert.notEqual(optionIdentity("Azul"), optionIdentity("Vermelho"));
});
test("request size is bounded by actual stream bytes even without Content-Length", async () => {
  const r = new Request("https://fixture.invalid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "x".repeat(1000) }),
  });
  await assert.rejects(() => workspaceJson(r, 100), /input_too_large/);
});
test("individual material requires an audience but no mandatory campaign", () => {
  assert.equal(
    canCompleteOnboardingStep(
      ["audience_policy_configured"],
      "first_kit_approved",
    ).canComplete,
    true,
  );
  assert.equal(
    canCompleteOnboardingStep([], "first_kit_approved").blockerStep,
    "audience_policy_configured",
  );
});
