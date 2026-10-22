import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveAccountMarketplaceCredentials,
  assertAccountCanDispatchCapture,
  AccountCredentialsError,
} from "../lib/account-credential-resolver.ts";
import { encryptSecret } from "../lib/affiliate-secret.ts";

// Configura chave mestra para teste
process.env.AFFILIATE_SECRETS_MASTER_KEY = "01234567890123456789012345678901";

test("resolveAccountMarketplaceCredentials returns house credentials for 'local' account", async () => {
  process.env.SHOPEE_APP_ID = "house-shopee-app";
  process.env.SHOPEE_APP_SECRET = "house-shopee-secret";

  const creds = await resolveAccountMarketplaceCredentials("local", "shopee", async () => [{status:"active"}]);
  assert.equal(creds.tenantId, "local");
  assert.equal(creds.marketplace, "shopee");
  assert.equal(creds.appId, "house-shopee-app");
  assert.equal(creds.appSecret, "house-shopee-secret");
});

test("resolveAccountMarketplaceCredentials throws account_credentials_missing when tenant has no stored secrets", async () => {
  const fakeSql = async strings => strings.join(" ").includes("affiliate_account") ? [{status:"active"}] : [];

  await assert.rejects(
    async () => {
      await resolveAccountMarketplaceCredentials("tenant_empty", "shopee", fakeSql);
    },
    (err) => {
      assert.ok(err instanceof AccountCredentialsError);
      assert.equal(err.code, "account_credentials_missing");
      return true;
    }
  );
});

test("resolveAccountMarketplaceCredentials throws account_suspended when account is suspended", async () => {
  const fakeSql = async (strings) => {
    const query = strings.join(" ");
    if (query.includes("garimpa.affiliate_account")) {
      return [{ status: "suspended" }];
    }
    return [];
  };

  await assert.rejects(
    async () => {
      await resolveAccountMarketplaceCredentials("tenant_suspended", "shopee", fakeSql);
    },
    (err) => {
      assert.ok(err instanceof AccountCredentialsError);
      assert.equal(err.code, "account_suspended");
      return true;
    }
  );
});

test("resolveAccountMarketplaceCredentials decrypts valid tenant credentials", async () => {
  const encrypted = encryptSecret(
    JSON.stringify({ appId: "client-app-123", appSecret: "client-sec-456" }),
    "tenant_a",
    "shopee",
    "credentials_json"
  );

  const fakeSql = async (strings) => {
    const query = strings.join(" ");
    if (query.includes("garimpa.affiliate_account")) {
      return [{ status: "active" }];
    }
    if (query.includes("garimpa.affiliate_secret")) {
      return [
        {
          secret_id: "credentials_json",
          key_version: encrypted.keyVersion,
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          tag: encrypted.tag,
          status: "active",
        },
      ];
    }
    return [];
  };

  const creds = await resolveAccountMarketplaceCredentials("tenant_a", "shopee", fakeSql);
  assert.equal(creds.tenantId, "tenant_a");
  assert.equal(creds.marketplace, "shopee");
  assert.equal(creds.appId, "client-app-123");
  assert.equal(creds.appSecret, "client-sec-456");
});

test("resolveAccountMarketplaceCredentials throws credential_tampered on cross-tenant secret hijacking", async () => {
  // Cifrado para tenant_a mas tentado carregar para tenant_b
  const encrypted = encryptSecret("secret-val", "tenant_a", "shopee", "api_key");

  const fakeSql = async (strings) => {
    const query = strings.join(" ");
    if (query.includes("garimpa.affiliate_account")) {
      return [{ status: "active" }];
    }
    if (query.includes("garimpa.affiliate_secret")) {
      return [
        {
          secret_id: "api_key",
          key_version: encrypted.keyVersion,
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          tag: encrypted.tag,
          status: "active",
        },
      ];
    }
    return [];
  };

  await assert.rejects(
    async () => {
      // tenant_b tenta decifrar segredo de tenant_a (AAD mismatch)
      await resolveAccountMarketplaceCredentials("tenant_b", "shopee", fakeSql);
    },
    (err) => {
      assert.ok(err instanceof AccountCredentialsError);
      assert.equal(err.code, "credential_tampered");
      return true;
    }
  );
});

test("assertAccountCanDispatchCapture enforces credentials and active status", async () => {
  // Local sempre passa
  await assertAccountCanDispatchCapture("local", undefined, async () => [{status:"active"}]);

  // Conta sem segredos falha
  const emptySql = async (strings) => {
    const query = strings.join(" ");
    if (query.includes("garimpa.affiliate_account")) return [{ status: "active" }];
    return [];
  };

  await assert.rejects(
    async () => {
      await assertAccountCanDispatchCapture("tenant_no_secrets", undefined, emptySql);
    },
    (err) => {
      assert.ok(err instanceof AccountCredentialsError);
      assert.equal(err.code, "account_credentials_missing");
      return true;
    }
  );
});

test("BUG-005: local suspended never returns house credentials",async()=>{
  await assert.rejects(()=>resolveAccountMarketplaceCredentials("local","shopee",async()=>[{status:"suspended"}]),e=>e.code==="account_suspended");
  await assert.rejects(()=>assertAccountCanDispatchCapture("local",undefined,async()=>[{status:"suspended"}]),e=>e.code==="account_suspended");
});
