import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const { buildMode, apiOrigin, manifestForBuild, manifestFailures } = await import(new URL("../scripts/build-config.mjs", import.meta.url).href);
const source = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));

test("release defaults to production; development is an explicit single-origin build", () => {
  assert.equal(buildMode([]), "prod");
  assert.equal(buildMode(["--prod"]), "prod");
  assert.equal(buildMode(["--dev"]), "dev");
  for (const args of [["--prod", "--dev"], ["--staging"], ["--dev", "--dev"]]) assert.throws(() => buildMode(args));
  assert.deepEqual(manifestForBuild(source, "prod").host_permissions, ["https://www.bizuminer.com.br/*"]);
  assert.deepEqual(manifestForBuild(source, "dev").host_permissions, ["http://localhost:3100/*"]);
  assert.equal(apiOrigin("prod"), "https://www.bizuminer.com.br");
  assert.equal(apiOrigin("dev"), "http://localhost:3100");
  assert.throws(() => apiOrigin("staging"));
});

test("release validation rejects host substring spoofing, additional capabilities and invented identity keys", () => {
  assert.deepEqual(manifestFailures(source, "prod", pkg.version), []);
  assert.deepEqual(manifestFailures(manifestForBuild(source, "dev"), "dev", pkg.version), []);
  for (const host of ["https://www.bizuminer.com.br.evil.test/*", "https://evil.test/bizuminer.com.br/*", "https://*.bizuminer.com.br/*", "http://localhost:3100/*", "<all_urls>"]) {
    assert.ok(manifestFailures({ ...source, host_permissions: [host] }, "prod", pkg.version).length > 0);
  }
  for (const mutation of [{ host_permissions: [...source.host_permissions, "http://localhost:3100/*"] },
    { permissions: [...source.permissions, "tabs"] }, { optional_host_permissions: ["<all_urls>"] },
    { key: "invented-extension-identity" }, { content_security_policy: { extension_pages: "script-src 'self' https://remote.invalid; object-src 'self'" } }]) {
    assert.ok(manifestFailures({ ...source, ...mutation }, "prod", pkg.version).length > 0);
  }
});

test("source manifest, package metadata and lockfile carry the same new version", () => {
  assert.equal(pkg.version, "0.3.6");
  assert.equal(source.version, pkg.version);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.equal(pkg.scripts.build, "node scripts/build.mjs");
  assert.equal(pkg.scripts["build:dev"], "node scripts/build.mjs --dev");
});
