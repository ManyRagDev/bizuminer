import assert from "node:assert/strict";
import test from "node:test";
import { discardPautaPreparation, skipPautaOffer, skipPautaOffersBatch } from "../lib/pauta-db.ts";

test("discardPautaPreparation rejects non-human actors without touching the database", async () => {
  const result = await discardPautaPreparation({ actor: "system", tenantId: "test-tenant" }, "whatsapp", "00000000-0000-0000-0000-000000000001", "p1");
  assert.equal(result, false);
});

test("skipPautaOffer rejects non-human actors without touching the database", async () => {
  const result = await skipPautaOffer({ actor: "system", tenantId: "test-tenant" }, "whatsapp", "00000000-0000-0000-0000-000000000001", "p1");
  assert.equal(result, false);
});

test("skipPautaOffersBatch rejects empty item list or non-human actor", async () => {
  const resultNonHuman = await skipPautaOffersBatch({ actor: "system", tenantId: "test-tenant" }, "whatsapp", [{ confirmationId: "00000000-0000-0000-0000-000000000001", productId: "p1" }]);
  assert.equal(resultNonHuman, false);

  const resultEmpty = await skipPautaOffersBatch({ actor: "human", actorAppUserId: "u1", tenantId: "test-tenant", affiliateId: "a1" }, "whatsapp", []);
  assert.equal(resultEmpty, false);
});

test("skipPautaOffer inserts skip record into recommendation_exposure and cleans up draft archive", async () => {
  const queries = [];
  const fakeTx = Object.assign(
    async (strings, ...values) => {
      const sql = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? `$${i + 1}` : ""), "");
      queries.push({ sql, values });
      if (sql.includes("resolve_actor_accounts") || sql.includes("from garimpa.affiliate_account")) {
        return [{ affiliate_id: "aff-1" }];
      }
      if (sql.includes("information_schema.columns") && sql.includes("preparation_expired")) {
        return [{ hasPrepExpired: true }];
      }
      if (sql.includes("information_schema.columns") && sql.includes("is_skip")) {
        return [{ hasIsSkip: true }];
      }
      if (sql.includes("from garimpa.recommendation_edition_archive")) {
        return [{
          selection: {
            kind: "pauta-preparation-v1",
            affiliateId: "aff-1",
            products: [{ id: "prod-1", priceCents: 4990, offerOptionKey: null }],
          },
        }];
      }
      return [{ ready: true }];
    },
    {
      json: val => val,
      unsafe: () => [],
    }
  );

  const fakeClient = Object.assign(
    async (strings, ...values) => fakeTx(strings, ...values),
    {
      begin: async fn => fn(fakeTx),
      end: async () => {},
    }
  );
  const fakeFactory = () => fakeClient;

  const context = {
    actor: "human",
    actorAppUserId: "user-123",
    authenticatedAuthUserId: "auth-123",
    membershipRole: "owner",
    tenantId: "tenant-bizu",
    affiliateId: "aff-1",
    requestId: "req-1",
  };

  const ok = await skipPautaOffer(context, "whatsapp", "a0000000-0000-0000-0000-000000000001", "prod-1", fakeFactory);
  assert.equal(ok, true);

  const exposureInsert = queries.find(q => q.sql.includes("insert into garimpa.recommendation_exposure"));
  assert.ok(exposureInsert, "Expected insert into recommendation_exposure");
  assert.ok(exposureInsert.sql.includes("is_skip"), "Expected is_skip column in insert");
  assert.ok(exposureInsert.sql.includes("do nothing"), "Expected append-only on conflict do nothing");
  assert.ok(!exposureInsert.sql.includes("do update"), "Must not require UPDATE privilege on recommendation_exposure");
});

test("discardPautaPreparation records append-only discard in recommendation_edition_archive without recording exposure", async () => {
  const queries = [];
  const fakeTx = Object.assign(
    async (strings, ...values) => {
      const sql = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? `$${i + 1}` : ""), "");
      queries.push({ sql, values });
      if (sql.includes("resolve_actor_accounts") || sql.includes("from garimpa.affiliate_account")) {
        return [{ affiliate_id: "aff-1" }];
      }
      return [{ ready: true }];
    },
    {
      json: val => val,
      unsafe: () => [],
    }
  );

  const fakeClient = Object.assign(
    async (strings, ...values) => fakeTx(strings, ...values),
    {
      begin: async fn => fn(fakeTx),
      end: async () => {},
    }
  );
  const fakeFactory = () => fakeClient;

  const context = {
    actor: "human",
    actorAppUserId: "user-123",
    authenticatedAuthUserId: "auth-123",
    membershipRole: "owner",
    tenantId: "tenant-bizu",
    affiliateId: "aff-1",
    requestId: "req-1",
  };

  const ok = await discardPautaPreparation(context, "whatsapp", "b0000000-0000-0000-0000-000000000002", "prod-2", fakeFactory);
  assert.equal(ok, true);

  const archiveInsert = queries.find(q => q.sql.includes("insert into garimpa.recommendation_edition_archive"));
  assert.ok(archiveInsert, "Expected append-only insert into recommendation_edition_archive");

  const exposureInsert = queries.find(q => q.sql.includes("recommendation_exposure"));
  assert.equal(exposureInsert, undefined, "Discard must NOT insert into recommendation_exposure");
});
