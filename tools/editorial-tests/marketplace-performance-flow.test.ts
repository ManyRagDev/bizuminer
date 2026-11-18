import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";
import type { AccountContext } from "../../packages/web/lib/account-context.ts";
import type { MarketplacePerformance } from "../../packages/web/lib/marketplace-performance-db.ts";

const require = createRequire(import.meta.url);
const { readMarketplacePerformance, saveMarketplacePerformance } =
  require("../../packages/web/lib/marketplace-performance-db.ts");
const { withAccountDb } = require("../../packages/web/lib/tenant-db.ts");

const { pg, factory } = await commercialFixture();
try {
  await pg.exec(`
    insert into garimpa.affiliate_account(id, tenant_id, public_slug, display_name) values
      ('aff_report_a', 'report_a', 'report-a', 'Conta A'),
      ('aff_report_b', 'report_b', 'report-b', 'Conta B');
    insert into garimpa.app_user(id, tenant_id, auth_user_id) values
      ('user_report_a', 'report_a', 'auth_user_report_a'),
      ('user_report_b', 'report_b', 'auth_user_report_b'),
      ('user_report_operator', 'report_a', 'auth_user_report_operator');
    insert into garimpa.app_user_role(app_user_id, role) values
      ('user_report_a', 'afiliado'), ('user_report_b', 'afiliado'), ('user_report_operator', 'afiliado');
    insert into garimpa.affiliate_membership(affiliate_id, app_user_id, role) values
      ('aff_report_a', 'user_report_a', 'owner'),
      ('aff_report_b', 'user_report_b', 'owner'),
      ('aff_report_a', 'user_report_operator', 'operator');
  `);

  const context = (tenant: string, user = tenant, role: "owner" | "operator" = "owner"): AccountContext => ({
    tenantId: tenant,
    affiliateId: `aff_${tenant}`,
    actor: "human",
    actorAppUserId: `user_${user}`,
    authenticatedAuthUserId: `auth_user_${user}`,
    membershipRole: role,
    requestId: crypto.randomUUID(),
  });
  const owner = context("report_a");
  const otherOwner = context("report_b");
  const operator = context("report_a", "report_operator", "operator");
  const report: MarketplacePerformance = {
    marketplace: "shopee",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-07",
    clicks: 21,
    orders: 0,
    salesCents: null,
    commissionCents: "0",
    currency: "BRL",
  };

  const list = (account: AccountContext, tenant = account.tenantId) =>
    withAccountDb(account, (tx: unknown) => readMarketplacePerformance(tx, tenant), factory);
  assert.equal(await list(owner), null);
  const migration = new URL(
    "../../packages/persistence/supabase/migrations/20261110192436_marketplace_performance.sql",
    import.meta.url,
  );
  await pg.exec(await readFile(migration, "utf8"));

  await saveMarketplacePerformance(owner, report, factory);
  assert.deepEqual([...(await list(operator))], [report]);
  assert.equal((await list(otherOwner, owner.tenantId)).length, 0);

  const corrected = { ...report, clicks: 25, orders: 2, salesCents: "15050" };
  await saveMarketplacePerformance(owner, corrected, factory);
  await saveMarketplacePerformance(otherOwner, { ...report, clicks: 3 }, factory);
  assert.deepEqual([...(await list(owner))], [corrected]);
  assert.equal((await list(otherOwner))[0].clicks, 3);

  await assert.rejects(saveMarketplacePerformance(operator, report, factory), /owner_required/);
  await assert.rejects(withAccountDb(operator, async (tx: any) => {
    await tx`insert into garimpa.marketplace_performance
      (tenant_id, marketplace, period_start, period_end, clicks, currency, updated_by)
      values ('report_a', 'amazon', '2026-11-01', '2026-11-07', 2, 'BRL', 'user_report_operator')`;
  }, factory), /row-level security/);
  await assert.rejects(saveMarketplacePerformance(owner, { ...report, periodEnd: "2026-10-31" }, factory), /check constraint/);
  await assert.rejects(saveMarketplacePerformance(owner, {
    ...report, clicks: null, orders: null, commissionCents: null,
  }, factory), /check constraint/);
  console.log("PASS marketplace totals, corrections, absent values, owner permissions and account isolation");
} finally {
  await pg.close();
}
