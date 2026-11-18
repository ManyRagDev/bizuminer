import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { importSharedLinkArchive, prepareSharedLinkArchive, SHARED_LINK_ALIASES,
  isArchivedShopeeDestination } from "../src/shared-link-archive-import.ts";

const scope = { tenantId: "archive-test", affiliateId: "aff_archive-test" };
function snapshot() {
  return {
    "garimpa.short_link": SHARED_LINK_ALIASES.map((code, n) => ({ code, tenant_id: scope.tenantId, slug: `shopee-test-${n}` })),
    "garimpa.publication": SHARED_LINK_ALIASES.map((_, n) => ({ id: `pub-${n}`, tenant_id: scope.tenantId, slug: `shopee-test-${n}`,
      product_id: `product-${n}`, affiliate_id: scope.affiliateId, channel: "web", status: "active", affiliate_url: `https://s.shopee.com.br/test${n}?tag=fixture` })),
    "garimpa.product": SHARED_LINK_ALIASES.map((_, n) => ({ id: `product-${n}`, tenant_id: scope.tenantId, title: `Produto histórico ${n}`,
      marketplace: "shopee", image_url: "https://images.example.test/item.jpg", last_capture_run_id: `old-run-${n}`, last_price_cents: 1099 })),
    "source.latest_price_evidence": SHARED_LINK_ALIASES.map((_, n) => ({ id: `obs-${n}`, tenant_id: scope.tenantId,
      product_id: `product-${n}`, capture_run_id: `old-run-${n}`, extension_device_id: "old-device", price_cents: 1099 })),
  };
}
function fixture(value: unknown = snapshot()) {
  const compressed = gzipSync(JSON.stringify(value));
  const expectedSha256 = createHash("sha256").update(compressed).digest("hex");
  return { compressed, expectedSha256 };
}
function prepare(value: unknown = snapshot()) {
  const { compressed, expectedSha256 } = fixture(value);
  return prepareSharedLinkArchive(compressed, { ...scope, expectedSha256 });
}

test("prepares exactly eight archived shares with private historical provenance and exact destinations", () => {
  const plan = prepare();
  assert.equal(plan.rows.length, 8);
  assert.deepEqual(plan.rows.map(row => row.alias), SHARED_LINK_ALIASES);
  assert.equal(plan.rows[0]!.bio_code, "BZR");
  assert.equal(plan.rows[0]!.affiliate_url, snapshot()["garimpa.publication"][0]!.affiliate_url);
  assert.equal(plan.rows[0]!.provenance.historicalOnly, true);
  assert.equal((plan.rows[0]!.provenance.product as any).last_capture_run_id, "old-run-0");
  assert.equal((plan.rows[0]!.provenance.latestPriceEvidence as any).extension_device_id, "old-device");
  assert.equal("price_cents" in plan.rows[0]!, false);
  assert.equal("capture_run_id" in plan.rows[0]!, false);
});

test("fixed default hash rejects a different snapshot before any import", () => {
  const { compressed } = fixture();
  assert.throws(() => prepareSharedLinkArchive(compressed, scope), /snapshot_hash_mismatch/);
});

test("rejects extra/missing aliases, duplicate identities, unexpected tables, foreign accounts and broken joins", () => {
  const variants: ((s: ReturnType<typeof snapshot>) => void)[] = [
    s => { s["garimpa.short_link"][0]!.code = "abcd" as any; },
    s => { s["garimpa.short_link"].pop(); },
    s => { s["garimpa.publication"][1]!.id = s["garimpa.publication"][0]!.id; },
    s => { s["garimpa.short_link"][1]!.slug = s["garimpa.short_link"][0]!.slug; },
    s => { (s as any)["garimpa.capture_run"] = []; },
    s => { s["garimpa.product"][0]!.tenant_id = "foreign"; },
    s => { s["garimpa.publication"][0]!.affiliate_id = "foreign"; },
    s => { s["garimpa.publication"][0]!.product_id = "missing"; },
    s => { s["source.latest_price_evidence"][0]!.product_id = "missing"; },
    s => { s["garimpa.product"][0]!.marketplace = "amazon"; },
  ];
  for (const mutate of variants) { const s = snapshot(); mutate(s); assert.throws(() => prepare(s)); }
});

test("only literal HTTPS Shopee destinations pass; no credentials, spoofed hosts, backslashes or ports", () => {
  for (const value of ["https://shope.ee/code", "https://s.shopee.com.br/id?a=1&b=2", "https://shopee.com.br/a"]) assert.equal(isArchivedShopeeDestination(value), true);
  for (const value of ["http://shope.ee/a", "https://evilshope.ee/a", "https://shope.ee.evil.test/a", "https://user@shope.ee/a",
    "https://shope.ee:443/a", "https://shope.ee:8443/a", "https://shope.ee\\@evil.test/a", " https://shope.ee/a", "https://shope.ee/a\nLocation:evil", "javascript:alert(1)"]) {
    assert.equal(isArchivedShopeeDestination(value), false);
    const s = snapshot(); s["garimpa.publication"][0]!.affiliate_url = value; assert.throws(() => prepare(s), /invalid_snapshot_destination/);
  }
});

test("gzip decoded output is bounded even when the expected digest matches", () => {
  const { compressed, expectedSha256 } = fixture({ data: "a".repeat(2 * 1024 * 1024) });
  assert.throws(() => prepareSharedLinkArchive(compressed, { ...scope, expectedSha256 }), /invalid_snapshot_archive/);
});

test("mutated prepared plans are rejected before a database connection or transaction", async () => {
  const plan = prepare(); plan.rows[0]!.affiliate_url = "https://shope.ee/changed";
  await assert.rejects(() => importSharedLinkArchive({ begin: () => assert.fail("unexpected transaction") } as any, plan), /invalid_import_plan/);
});

test("CLI never accepts a hash override and reports no private values on invalid package", () => {
  const cwd = mkdtempSync(join(tmpdir(), "garimpa-archive-cli-"));
  try {
    const file = join(cwd, "data.json.gz"); writeFileSync(file, fixture().compressed);
    const script = fileURLToPath(new URL("../bin/import-shared-link-archive.ts", import.meta.url));
    const args = ["--experimental-strip-types", script, "--file", file, "--tenant", scope.tenantId, "--affiliate", scope.affiliateId];
    const result = spawnSync(process.execPath, args, { encoding: "utf8", env: { ...process.env,
      DATABASE_URL: "postgresql://never-connect:private-secret@127.0.0.1:1/invalid",
      SHARED_LINK_IMPORT_DATABASE_URL: "postgresql://never-connect:private-secret@127.0.0.1:1/invalid" } });
    assert.equal(result.status, 1); assert.match(result.stderr, /snapshot_hash_mismatch/);
    assert.doesNotMatch(result.stderr + result.stdout, /private-secret|shopee\.com\.br|ECONNREFUSED/);
    const override = spawnSync(process.execPath, [...args, "--expected-sha256", fixture().expectedSha256], { encoding: "utf8" });
    assert.equal(override.status, 1); assert.match(override.stderr, /invalid_import_arguments/);
    const help = spawnSync(process.execPath, ["--experimental-strip-types", script, "--help"], { encoding: "utf8" });
    assert.equal(help.status, 0); assert.match(help.stdout, /Default: validate/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
