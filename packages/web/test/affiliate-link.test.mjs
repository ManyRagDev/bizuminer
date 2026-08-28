import assert from "node:assert/strict";
import test from "node:test";
import { affiliateLink } from "../lib/db.ts";

test("affiliateLink usa credencial explícita (matt_word/matt_tool/forceInApp)", () => {
  const url = affiliateLink(
    "https://produto.mercadolivre.com.br/MLB-1234567890-x-_JM",
    "ml-MLB1234567890-afiliado",
    { trackingId: "AFILIADO_A", toolId: "111" },
  );
  const u = new URL(url);
  assert.equal(u.searchParams.get("matt_word"), "AFILIADO_A_ml-MLB1234567890-afiliado");
  assert.equal(u.searchParams.get("matt_tool"), "111");
  assert.equal(u.searchParams.get("forceInApp"), "true");
});

test("dois afiliados geram matt_word distintos no mesmo produto", () => {
  const a = affiliateLink("https://x/MLB-1-_JM", "s", { trackingId: "AAA", toolId: "1" });
  const b = affiliateLink("https://x/MLB-1-_JM", "s", { trackingId: "BBB", toolId: "1" });
  assert.notEqual(a, b);
  assert.match(a, /matt_word=AAA_s/);
  assert.match(b, /matt_word=BBB_s/);
});

test("não lê ML_TRACKING_ID/ML_TOOL_ID do env (sem fallback global)", () => {
  const savedTracking = process.env.ML_TRACKING_ID;
  const savedTool = process.env.ML_TOOL_ID;
  delete process.env.ML_TRACKING_ID;
  delete process.env.ML_TOOL_ID;
  try {
    const url = affiliateLink("https://x/MLB-1-_JM?wid=123", "s", { trackingId: "C", toolId: "2" });
    assert.match(url, /matt_word=C_s/);
    assert.match(url, /wid=123/);
  } finally {
    if (savedTracking !== undefined) process.env.ML_TRACKING_ID = savedTracking;
    if (savedTool !== undefined) process.env.ML_TOOL_ID = savedTool;
  }
});
