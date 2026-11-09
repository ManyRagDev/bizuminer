import test from "node:test";
import assert from "node:assert/strict";
import { isGA4Configured, getGA4DashboardData } from "../lib/ga4-reporting.ts";

test("GA4 Reporting: isGA4Configured detects environment configuration accurately", () => {
  const origProp = process.env.GA4_PROPERTY_ID;
  const origEmail = process.env.GA4_CLIENT_EMAIL;
  const origKey = process.env.GA4_PRIVATE_KEY;

  try {
    process.env.GA4_PROPERTY_ID = "123456789";
    process.env.GA4_CLIENT_EMAIL = "test@project.iam.gserviceaccount.com";
    process.env.GA4_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQD...";

    assert.equal(isGA4Configured(), true);

    delete process.env.GA4_PRIVATE_KEY;
    assert.equal(isGA4Configured(), false);
  } finally {
    if (origProp) process.env.GA4_PROPERTY_ID = origProp; else delete process.env.GA4_PROPERTY_ID;
    if (origEmail) process.env.GA4_CLIENT_EMAIL = origEmail; else delete process.env.GA4_CLIENT_EMAIL;
    if (origKey) process.env.GA4_PRIVATE_KEY = origKey; else delete process.env.GA4_PRIVATE_KEY;
  }
});

test("GA4 Reporting: returns null safely without throwing when unconfigured", async () => {
  const origKey = process.env.GA4_PRIVATE_KEY;
  try {
    delete process.env.GA4_PRIVATE_KEY;
    const result = await getGA4DashboardData();
    assert.equal(result, null);
  } finally {
    if (origKey) process.env.GA4_PRIVATE_KEY = origKey;
  }
});
