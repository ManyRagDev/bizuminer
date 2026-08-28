import assert from "node:assert/strict";
import test from "node:test";
import { affiliateLinksV2Enabled, extensionCaptureEnabled } from "../lib/flags.ts";

test("flags server-only: default desligado", () => {
  assert.equal(affiliateLinksV2Enabled({}), false);
  assert.equal(extensionCaptureEnabled({}), false);
});

test("flags ligam somente com 'true' literal", () => {
  assert.equal(affiliateLinksV2Enabled({ AFFILIATE_LINKS_V2_ENABLED: "true" }), true);
  assert.equal(affiliateLinksV2Enabled({ AFFILIATE_LINKS_V2_ENABLED: "1" }), false);
  assert.equal(extensionCaptureEnabled({ EXTENSION_CAPTURE_ENABLED: "true" }), true);
  assert.equal(extensionCaptureEnabled({ EXTENSION_CAPTURE_ENABLED: "TRUE" }), false);
});
