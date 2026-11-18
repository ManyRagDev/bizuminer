import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as archive from "../lib/shared-link-archive.ts";

const sample = { archived: true, available: true, alias: "4bzr", bioCode: "BZR", slug: "shp-11-22", tenantId: "local", title: "Produto histórico", imageUrl: null, marketplace: "shopee" };
const revoked = { archived: true, available: false };
const forbidden = () => { throw new Error("Live catalog/auth/telemetry must not execute for archive"); };
function load(file, modules = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, Request, Response, URL, URLSearchParams, process,
    require(id) {
      if (id in modules) return modules[id];
      if (id.includes("shared-link-archive.ts")) return archive;
      if (id === "react/jsx-runtime") return jsxRuntime;
      if (id === "react") return { cache: fn => fn };
      if (id === "next/navigation") return { notFound() { throw new Error("NOT_FOUND"); }, redirect: forbidden };
      return new Proxy({}, { get: () => forbidden });
    },
  }, { filename: file });
  return exports;
}
function stateDb(get) {
  return { sharedLinkArchive: async (kind, key, tenant) => get(kind, key, tenant), sharedLinkArchiveTarget: async () => "https://s.shopee.com.br/snapshot?affiliate=original" };
}

test("archive projection excludes private fields and rejects malformed reservations", () => {
  const parsed = archive.parseSharedLinkArchive({ ...sample, price: 1999, target: "secret", originalProductId: "private" });
  assert.deepEqual(parsed, sample);
  assert.deepEqual(archive.parseSharedLinkArchive({ ...revoked, alias: "private" }), revoked);
  assert.equal(archive.parseSharedLinkArchive(null), null);
  for (const patch of [{ slug: "//external.example" }, { alias: "../a" }, { marketplace: "amazon" }, { available: "true" }]) assert.throws(() => archive.parseSharedLinkArchive({ ...sample, ...patch }));
  assert.equal(archive.parseSharedLinkArchive({ ...sample, imageUrl: "javascript:alert(1)" }).imageUrl, null);
});

test("target validation accepts only exact Shopee HTTPS domains or bounded subdomains", () => {
  for (const value of ["https://shope.ee/abc", "https://s.shopee.com.br/abc?x=1"]) assert.equal(archive.isArchiveTarget(value), true, value);
  for (const value of ["https://shopee.com.br:443/a", "http://shope.ee/a", "https://shopee.ee/a", "https://shope.ee.evil.test/a", "https://evilshopee.com.br/a", "https://user:pass@shope.ee/a", "https://shope.ee:8443/a", "https://shope.ee\\@evil.test/a", " https://shope.ee/a", "/go/other", "javascript:alert(1)"]) assert.equal(archive.isArchiveTarget(value), false, value);
});

test("all eight aliases and scoped case-insensitive bio codes retain their original route", async () => {
  const aliases = ["4bzr", "4jt3", "ptej", "zpd7", "bjjj", "autk", "bnfx", "k7e3"];
  for (const alias of aliases) {
    const record = { ...sample, alias, bioCode: alias.slice(1).toUpperCase(), slug: `shp-${alias}` };
    assert.equal(archive.archiveLookupKey("alias", alias), alias);
    assert.equal(archive.archiveLookupKey("bio", record.bioCode.toLowerCase(), "local"), record.bioCode);
    const p = load("../app/p/[code]/route.ts", { "../../../lib/shared-link-archive-db.ts": stateDb((kind, key) => kind === "alias" && key === alias ? record : null) });
    const response = await p.GET(new Request(`https://site.test/p/${alias}?utm_source=old`), { params: Promise.resolve({ code: alias }) });
    assert.equal(response.status, 302); assert.equal(response.headers.get("location"), `/bizu/shp-${alias}`); assert.equal(response.headers.get("cache-control"), "no-store");
    const bio = load("../app/bio/[tenant]/[code]/route.ts", { "../../../../lib/shared-link-archive-db.ts": stateDb((kind, key, tenant) => kind === "bio" && tenant === "local" && key.toUpperCase() === record.bioCode ? record : null) });
    for (const code of [record.bioCode, record.bioCode.toLowerCase()]) {
      const response = await bio.GET(new Request(`https://site.test/bio/local/${code}`), { params: Promise.resolve({ tenant: "local", code }) });
      assert.equal(response.headers.get("location"), `/p/${alias}`);
    }
    const wrongTenant = await bio.GET(new Request("https://site.test/bio/other/BZR"), { params: Promise.resolve({ tenant: "other", code: record.bioCode }) });
    assert.equal(wrongTenant.status, 404);
  }
  assert.equal(archive.archiveLookupKey("bio", "BZR"), null);
  assert.equal(archive.archiveLookupKey("bio", "../", "local"), null);
});

test("archive routes fence revoked links before live fallbacks and reject campaign/option queries including empty values", async () => {
  for (const record of [sample, revoked]) {
    const db = stateDb(() => record);
    const p = load("../app/p/[code]/route.ts", { "../../../lib/shared-link-archive-db.ts": db });
    const go = load("../app/go/[slug]/route.ts", { "../../../lib/shared-link-archive-db.ts": db });
    for (const query of ["c=", "opcao=", "c=campaign", "opcao=other", "opcao=&opcao=other"]) {
      assert.equal((await p.GET(new Request(`https://site.test/p/4bzr?${query}`), { params: Promise.resolve({ code: "4bzr" }) })).status, 404);
      assert.equal((await go.GET(new Request(`https://site.test/go/shp-11-22?${query}`), { params: Promise.resolve({ slug: sample.slug }) })).status, 404);
    }
    const response = await go.GET(new Request("https://site.test/go/shp-11-22?utm_source=old&url=https://evil.test"), { params: Promise.resolve({ slug: sample.slug }) });
    assert.equal(response.status, record.available ? 302 : 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("location"), record.available ? "/bizu/shp-11-22" : null);
  }
  assert.equal((await archive.archiveGoResponse(sample, new URLSearchParams(), async () => null)).status, 404, "revoked between presentation and target lookup");
});

test("historical page and metadata render without live data, login, tracked price or current recommendations", async () => {
  const components = load("../app/_components/archived-shared-link.tsx");
  const page = load("../app/bizu/[slug]/page.tsx", { "../../../lib/shared-link-archive-db.ts": stateDb(() => sample), "../../_components/archived-shared-link": components });
  const props = { params: Promise.resolve({ slug: sample.slug }), searchParams: Promise.resolve({ direto: "1" }) };
  const html = renderToStaticMarkup(await page.default(props));
  assert.match(html, /Compartilhado anteriormente/); assert.match(html, /Preço atual não confirmado; consulte a loja/);
  assert.doesNotMatch(html, /href="\/go\//);
  assert.match(html, /oferta não está disponível/i);
  assert.doesNotMatch(html, /R\$|schema.org|application\/ld\+json|price_history|preço monitorado|Mais em|login|s.shopee/i);
  const metadata = await page.generateMetadata(props);
  assert.equal(metadata.description, archive.ARCHIVE_DESCRIPTION);
  assert.equal(metadata.openGraph.images[0].url, `/bizu/${sample.slug}/opengraph-image`);
  assert.doesNotMatch(JSON.stringify(metadata), /priceCents|affiliate=|s.shopee|discount/);
  const preview = renderToStaticMarkup(components.ArchivedSharedLinkPreview({ title: sample.title }));
  assert.match(preview, /Compartilhado anteriormente/); assert.doesNotMatch(preview, /<img|R\$|https:/);
  const unavailablePage = load("../app/bizu/[slug]/page.tsx", { "../../../lib/shared-link-archive-db.ts": stateDb(() => revoked) });
  await assert.rejects(unavailablePage.default(props), /NOT_FOUND/);
  await assert.rejects(page.default({ ...props, searchParams: Promise.resolve({ c: "" }) }), /NOT_FOUND/);
});

test("archive database reads probe missing functions, never cache availability and propagate real failures", async () => {
  let result = sample, ready = true, reads = 0;
  const sql = async strings => {
    const query = strings.join("?");
    if (query.includes("to_regprocedure")) return [{ ready }];
    reads++; return [{ result }];
  };
  sql.end = async () => {};
  const factory = () => sql;
  const db = load("../lib/shared-link-archive-db.ts", { "./db.ts": { db: () => { throw new Error("Wrong connection"); } }, "./public-offer-db.ts": { withPublicDb: async (fn, sqlFactory) => fn(sqlFactory()) } });
  assert.equal((await db.sharedLinkArchive("alias", sample.alias, undefined, factory)).available, true);
  result = revoked;
  assert.equal((await db.sharedLinkArchive("alias", sample.alias, undefined, factory)).available, false);
  assert.equal(reads, 2);
  ready = false;
  assert.equal(await db.sharedLinkArchive("alias", sample.alias, undefined, factory), null);
  assert.equal(reads, 2);
  await assert.rejects(db.sharedLinkArchive("alias", sample.alias, undefined, () => Object.assign(async () => { throw new Error("permission denied"); }, { end: async () => {} })), /permission denied/);
});

test("archive OG handler blocks revocation and campaign queries before rendering its own uncached image", async () => {
  let rendered = 0;
  class FakeImageResponse extends Response {
    constructor(element, options) {
      super("own image", { headers: options.headers });
      rendered++;
      assert.equal(element.props.title, sample.title);
      assert.equal(options.width, 1200);
    }
  }
  const modules = {
    "next/og": { ImageResponse: FakeImageResponse },
    react: { createElement: (type, props) => ({ type, props }) },
    "../../../../lib/og-assets": { ogFonts: async () => [] },
    "../../../_components/archived-shared-link": { ArchivedSharedLinkPreview: () => null },
  };
  for (const record of [sample, revoked]) {
    const route = load("../app/bizu/[slug]/opengraph-image/route.ts", { ...modules, "../../../../lib/shared-link-archive-db.ts": stateDb(() => record) });
    for (const query of ["", "?v=old", "?c=", "?opcao=other"]) {
      const response = await route.GET(new Request(`https://site.test/bizu/${sample.slug}/opengraph-image${query}`), { params: Promise.resolve({ slug: sample.slug }) });
      assert.equal(response.status, record.available && !query.includes("c=") && !query.includes("opcao=") ? 200 : 404);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
    }
  }
  assert.equal(rendered, 2);
});

test("schema without archive RPC never attempts SET ROLE and unknown aliases preserve normal route", async () => {
  let restrictedReads = 0;
  const sql = Object.assign(async () => [{ ready: false }], { end: async () => {} });
  const db = load("../lib/shared-link-archive-db.ts", {
    "./db.ts": { db: forbidden },
    "./public-offer-db.ts": { withPublicDb: async () => { restrictedReads++; throw new Error("role does not exist"); } },
  });
  assert.equal(await db.sharedLinkArchive("alias", sample.alias, undefined, () => sql), null);
  assert.equal(restrictedReads, 0);
  const p = load("../app/p/[code]/route.ts", {
    "../../../lib/shared-link-archive-db.ts": stateDb(() => null),
    "../../../lib/public-offer-db": { publicProjectionReady: async () => true },
    "../../../lib/public-link-page": { publicLinkPage: async () => new Response(null, { status: 302, headers: { Location: "/bizu/live-product" } }) },
  });
  const response = await p.GET(new Request("https://site.test/p/abcd"), { params: Promise.resolve({ code: "abcd" }) });
  assert.equal(response.headers.get("location"), "/bizu/live-product");
});

test("historical preview produces a complete PNG using local fonts and no network", async () => {
  const { ImageResponse } = await import("next/og.js");
  const { createElement } = await import("react");
  const components = load("../app/_components/archived-shared-link.tsx");
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Archived preview must not fetch remote assets"); };
  try {
    const response = new ImageResponse(createElement(components.ArchivedSharedLinkPreview, { title: sample.title }), {
      width: 1200, height: 630,
      fonts: [
        { name: "Manrope", data: readFileSync(new URL("../public/fonts/Manrope-ExtraBold.ttf", import.meta.url)), weight: 800, style: "normal" },
        { name: "Manrope", data: readFileSync(new URL("../public/fonts/Manrope-SemiBold.ttf", import.meta.url)), weight: 600, style: "normal" },
      ],
      headers: archive.ARCHIVE_NO_STORE,
    });
    const png = Buffer.from(await response.arrayBuffer());
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.ok(png.length > 1000);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally { globalThis.fetch = previousFetch; }
});
