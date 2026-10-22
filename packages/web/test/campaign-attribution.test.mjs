import test from "node:test";
import assert from "node:assert/strict";
import { validateCampaignTokenForSlug } from "../lib/campaign-attribution.ts";

test("validateCampaignTokenForSlug rejects missing or malformed tokens", async () => {
  const missing = await validateCampaignTokenForSlug(null, "ml-MLB12345");
  assert.equal(missing.valid, false);
  assert.equal(missing.reason, "token_missing");

  const empty = await validateCampaignTokenForSlug("", "ml-MLB12345");
  assert.equal(empty.valid, false);
  assert.equal(empty.reason, "token_missing");

  // Token curto (4 caracteres não é token de campanha)
  const shortCode = await validateCampaignTokenForSlug("x7k2", "ml-MLB12345");
  assert.equal(shortCode.valid, false);
  assert.equal(shortCode.reason, "malformed_token");

  // Token com caracteres inválidos
  const invalidChars = await validateCampaignTokenForSlug("abc!@#123456", "ml-MLB12345");
  assert.equal(invalidChars.valid, false);
  assert.equal(invalidChars.reason, "malformed_token");
});

test("validateCampaignTokenForSlug fails closed when token does not match slug", async () => {
  // Código com formato válido (12 chars do alfabeto) mas inexistente no banco
  const result = await validateCampaignTokenForSlug("ab3k9zx42qwp", "ml-MLB999999");
  assert.equal(result.valid, false);
  assert.ok(
    result.reason === "mismatched_or_inactive_token" || result.reason === "db_lookup_unavailable",
    "deve falhar fechado com segurança",
  );
});

test('campaign exit keeps token independently for namespaced multi-marketplace slugs',async()=>{
 const {campaignExitPath}=await import('../lib/campaign-exit.ts');
 assert.equal(campaignExitPath('cliente--shp-123','AbC123def456'),'/go/cliente--shp-123?c=AbC123def456');
 assert.equal(campaignExitPath('ml-123',null),'/go/ml-123');
 assert.equal(campaignExitPath('ml-123','bad code'),'/go/ml-123?c=bad%20code');
});
