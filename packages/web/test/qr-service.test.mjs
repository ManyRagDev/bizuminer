import test from "node:test";
import assert from "node:assert/strict";
import {
  getLocalNetworkIp,
  resolveMobileAccessUrl,
  resolveLocalNetworkUrl,
  resolveProductionUrl,
  generateQrCodeDataUrl,
  getPautaQrBundle,
} from "../lib/qr-service.ts";

test("getLocalNetworkIp returns valid IPv4 or localhost and respects LOCAL_IP env", () => {
  const original = process.env.LOCAL_IP;
  try {
    process.env.LOCAL_IP = "192.168.0.1";
    assert.equal(getLocalNetworkIp(), "192.168.0.1", "Must return custom LOCAL_IP if set");
  } finally {
    if (original) process.env.LOCAL_IP = original;
    else delete process.env.LOCAL_IP;
  }

  const detected = getLocalNetworkIp();
  assert.ok(typeof detected === "string" && detected.length > 0, "Must return an IP string");
  assert.match(detected, /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|localhost)$/, "Must match IPv4 or localhost");
  assert.ok(!detected.startsWith("169.254."), "Must not return link-local APIPA address");
});

test("resolveLocalNetworkUrl converts localhost host header to local network IP", () => {
  const url = resolveLocalNetworkUrl("localhost:3100");
  assert.ok(url.startsWith("http://"), "Must start with http://");
  assert.ok(url.endsWith(":3100/pauta"), "Must retain port 3100 and /pauta path");
  assert.ok(!url.includes("localhost"), "Must replace localhost with actual IP");
});

test("resolveProductionUrl points to canonical or configured domain", () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    process.env.NEXT_PUBLIC_SITE_URL = "https://bizuminer.com.br";
    const url = resolveProductionUrl();
    assert.equal(url, "https://bizuminer.com.br/pauta");
  } finally {
    if (original) process.env.NEXT_PUBLIC_SITE_URL = original;
    else delete process.env.NEXT_PUBLIC_SITE_URL;
  }
});

test("getPautaQrBundle produces bundle with local and production QR codes", async () => {
  const bundle = await getPautaQrBundle("localhost:3100");
  assert.ok(bundle.local, "Must have local item");
  assert.ok(bundle.production, "Must have production item");
  assert.equal(bundle.defaultMode, "local");
  assert.ok(bundle.local.url.includes("/pauta"));
  assert.ok(bundle.local.qrDataUrl.startsWith("data:image/png;base64,"));
  assert.ok(bundle.production.url.includes("/pauta"));
  assert.ok(bundle.production.qrDataUrl.startsWith("data:image/png;base64,"));
});

test("generateQrCodeDataUrl produces valid image/png data url", async () => {
  const dataUrl = await generateQrCodeDataUrl("http://192.168.1.100:3100/pauta");
  assert.ok(dataUrl.startsWith("data:image/png;base64,"), "Must produce base64 PNG data URL");
});
