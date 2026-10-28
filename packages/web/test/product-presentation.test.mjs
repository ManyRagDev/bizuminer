import assert from "node:assert/strict";
import test from "node:test";
import { validateEditorialPresentation, applyProductPresentation, COVER_HEADLINE_MAX_LENGTH, COVER_DESCRIPTION_MAX_LENGTH, COVER_TITLE_MAX_LENGTH } from "../lib/product-presentation.ts";

const presentation = { status: "published", title: "Produto com título normal", caveat: "" };
test("capa é opcional e exige headline curto com aprovação booleana explícita", () => {
  assert.equal(COVER_HEADLINE_MAX_LENGTH, 72); assert.equal(COVER_DESCRIPTION_MAX_LENGTH, 160); assert.equal(COVER_TITLE_MAX_LENGTH, 90);
  assert.deepEqual(validateEditorialPresentation(presentation), presentation);
  for (const cover of [null, [], {}, { headline: "ok", imageApproved: true }, { headline: "x".repeat(73), imageApproved: true }, { headline: "Bom uso", imageApproved: "true" }, { headline: "Bom uso" }])
    assert.equal(validateEditorialPresentation({ ...presentation, cover }), null);
  for (const imageApproved of [false, true]) {
    const cover = { headline: "  Cabe no seu dia a dia  ", imageApproved };
    assert.deepEqual(validateEditorialPresentation({ ...presentation, cover })?.cover, { headline: cover.headline.trim(), imageApproved });
  }
  assert.equal(validateEditorialPresentation({ ...presentation, cover: { headline: "x".repeat(72), imageApproved: true } })?.cover.headline.length, 72);
  assert.ok(validateEditorialPresentation({ ...presentation, title: "x".repeat(100) }), "Título longo ainda pode ser uma ficha comum; a política da capa decide elegibilidade.");
});

test("fallback apaga aprovação da capa antiga junto da ficha retirada", () => {
  const result = applyProductPresentation({ title: "Fonte", coverHeadline: "Antigo", coverImageApproved: true, editorialRevisionId: "velha" });
  assert.equal(result.coverHeadline, undefined); assert.equal(result.coverImageApproved, undefined); assert.equal(result.titleOrigin, "source");
});
