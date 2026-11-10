import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { getGA4DashboardData } from "../lib/ga4-reporting.ts";

function configure(t, privateKey) {
  const credentials = {
    GA4_PROPERTY_ID: "123456789",
    GA4_CLIENT_EMAIL: "test@project.iam.gserviceaccount.com",
    GA4_PRIVATE_KEY: privateKey,
  };

  for (const [key, value] of Object.entries(credentials)) {
    const previous = process.env[key];
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
    process.env[key] = value;
  }
}

test("GA4 não consulta o Google quando falta a configuração da propriedade", async (t) => {
  configure(t, "fixture");
  delete process.env.GA4_PROPERTY_ID;
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Consulta inesperada");
  });

  assert.deepEqual(await getGA4DashboardData(), { status: "unconfigured" });
  assert.equal(fetch.mock.callCount(), 0);
});

test("GA4 sinaliza falha parcial e consulta novamente sem guardar um relatório zerado", async (t) => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  configure(t, privateKey);
  let realtimeUnavailable = true;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url === "https://oauth2.googleapis.com/token") {
      return Response.json({ access_token: "fixture", expires_in: 3600 });
    }
    if (realtimeUnavailable && url.endsWith(":runRealtimeReport")) {
      return Response.json({}, { status: 503 });
    }
    return Response.json({ rows: [] });
  });

  assert.deepEqual(await getGA4DashboardData(), { status: "unavailable" });

  realtimeUnavailable = false;
  const result = await getGA4DashboardData();
  assert.equal(result.status, "ready");
  assert.equal(result.data.overview.last30Days.pageViews, 0);
  assert.deepEqual(result.data.events, []);
});
