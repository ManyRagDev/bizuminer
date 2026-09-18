import test from "node:test";
import assert from "node:assert/strict";
import { copyToClipboard } from "../lib/clipboard.ts";

test("copyToClipboard returns false in Node environment (no window)", async () => {
  const res = await copyToClipboard("test-text");
  assert.equal(res, false);
});
