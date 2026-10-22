import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";
const require = createRequire(import.meta.url);
const { withAccountDb } = require("../../packages/web/lib/tenant-db.ts");
const { curationSummary } = require("../../packages/web/lib/curation-db.ts");
const context = {
  tenantId: "upgrade",
  affiliateId: "aff_upgrade",
  actor: "human",
  actorAppUserId: "u_upgrade",
  authenticatedAuthUserId: "auth_upgrade",
  membershipRole: "owner",
  requestId: "isolated-upgrade",
};
const results: any[] = [];
const legacy = await commercialFixture({ migrationCount: 0 });
await legacy.pg.exec(
  `insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_upgrade','upgrade','upgrade-test','Upgrade test');insert into garimpa.app_user(id,tenant_id,auth_user_id) values('u_upgrade','upgrade','auth_upgrade');insert into garimpa.app_user_role(app_user_id,role) values('u_upgrade','afiliado');insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_upgrade','u_upgrade','owner');`,
);
assert.equal(
  await withAccountDb(context, async () => true, legacy.factory),
  true,
);
assert.equal(
  (await curationSummary("upgrade", legacy.factory, context)).awaiting,
  0,
);
await assert.rejects(
  () =>
    withAccountDb(
      { ...context, authenticatedAuthUserId: "forged" },
      async () => true,
      legacy.factory,
    ),
  /forbidden/,
);
results.push(
  "baseline before V2: owner compatibility and forged identity denied",
);
await legacy.pg.close();
const { pg, applied, factory } = await commercialFixture({
  migrationCount: 11,
});
assert.equal(applied.length, 11);
await pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_upgrade','upgrade','upgrade-test','Upgrade test');insert into garimpa.app_user(id,tenant_id,auth_user_id) values('u_upgrade','upgrade','auth_upgrade');insert into garimpa.app_user_role(app_user_id,role) values('u_upgrade','afiliado');insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_upgrade','u_upgrade','owner');
insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values('p_upgrade','upgrade','mercadolivre','1','Legacy product','https://mercadolivre.com.br/1',1000);
insert into garimpa.editorial_assessment(id,tenant_id,product_id,actor_app_user_id,policy_version,evidence_fingerprint,assessment,snapshot) values('review_upgrade','upgrade','p_upgrade','u_upgrade','legacy-v1','legacy-fingerprint','{"schemaVersion":1,"publicRationale":"Legacy intact"}','{"title":"Legacy product"}');
insert into garimpa.conversion(id,tenant_id,marketplace,external_order_id,occurred_at,source,verification,status) values('00000000-0000-4000-8000-000000000001','upgrade','mercadolivre','Legacy:Order',now(),'manual','documented','confirmed');
insert into garimpa.commission_entry(tenant_id,conversion_id,source_key,amount_cents,state,occurred_at,source_ref) values('upgrade','00000000-0000-4000-8000-000000000001','legacy:v1:colon',100,'received',now(),'legacy-evidence');
insert into garimpa.policy_experiment(id,tenant_id,baseline_version,candidate_version,hypothesis,primary_metric,status) values('00000000-0000-4000-8000-000000000002','upgrade','v1','v2','Legacy unilateral','score','shadow');
insert into garimpa.experiment_evaluation(tenant_id,experiment_id,unit_id,variant,output) values('upgrade','00000000-0000-4000-8000-000000000002','legacy-unassigned','candidate','{"score":1}');`);
const tables = [
  "editorial_assessment",
  "conversion",
  "commission_entry",
  "experiment_evaluation",
];
const snapshots: Record<string, unknown> = {};
for (const t of tables)
  snapshots[t] = (
    await pg.query(`select * from garimpa.${t} order by id`)
  ).rows;
await pg.exec(
  await readFile(
    new URL(
      "../../packages/persistence/supabase/migrations/20261015021300_garimpa_verified_workflows.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
for (const t of tables) {
  const after = (await pg.query(`select * from garimpa.${t} order by id`))
    .rows as any[];
  const before = snapshots[t] as any[];
  assert.equal(after.length, before.length);
  for (let n = 0; n < before.length; n++)
    for (const key of Object.keys(before[n]))
      assert.deepEqual(after[n][key], before[n][key]);
}
results.push(
  "11→12 preserves v1 assessment, legacy financial identities and unassigned experiment rows byte-for-value",
);
await withAccountDb(
  context,
  async (tx: any) => {
    await assert.rejects(
      () =>
        tx`update garimpa.experiment_evaluation set output='{}' where tenant_id='upgrade'`,
      /permission denied/,
    );
  },
  factory,
);
const fk = (
  await pg.query(
    `select convalidated from pg_constraint where conrelid='garimpa.experiment_evaluation'::regclass and confrelid='garimpa.experiment_assignment'::regclass`,
  )
).rows[0] as any;
assert.equal(fk.convalidated, false);
results.push(
  "old unassigned measurements remain historical; new writes enforce assignment and immutable grants",
);
await pg.close();
await writeFile(
  new URL(
    "../../docs/implementation/evidencias/execucao-19-upgrade.json",
    import.meta.url,
  ),
  JSON.stringify(
    { environment: "isolated PGlite, no remote migration", results },
    null,
    2,
  ) + "\n",
);
for (const r of results) console.log("PASS " + r);
