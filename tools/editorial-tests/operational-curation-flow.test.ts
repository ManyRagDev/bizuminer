/** Phase 1: real SQL/RLS, read-only offer diagnosis and protected reconciliation. */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";

const require = createRequire(import.meta.url);
const { readOperationalOffer } = require("../../packages/web/lib/pauta-db.ts");
const { readCurationAutomation } = require("../../packages/web/lib/curation-automation.ts");
const { inAccountScope } = require("../../packages/web/lib/account-scope.ts");
const { withAccountDb } = require("../../packages/web/lib/tenant-db.ts");
const { configureRecommendationChannel } = require("../../packages/web/lib/recommendation-db.ts");
const { defaultChannelPolicy } = require("../../packages/web/lib/recommendation-policy.ts");
const { readCurationOperationsMetrics } = require("../../packages/web/lib/curation-operations-metrics.ts");
const { affiliateWorkspaceEnabled } = require("../../packages/web/lib/affiliate-workspace-db.ts");
const fx = await commercialFixture();
const directory = new URL("../../packages/persistence/supabase/migrations/", import.meta.url);
const owner = (tenantId: string) => ({ tenantId, affiliateId: `aff_${tenantId}`, actor: "human",
  actorAppUserId: `u_${tenantId}`, authenticatedAuthUserId: `auth_${tenantId}`,
  membershipRole: "owner", requestId: `operational-${tenantId}` });
const a = owner("a"), b = owner("b");
const operator = { ...a, actorAppUserId: "u_operator", authenticatedAuthUserId: "auth_operator", membershipRole: "operator" };
process.env.DATABASE_URL = "postgresql://isolated-fixture-unused";
process.env.SHOPEE_CAPTURE_ENABLED = "false";
process.env.CURATION_ATTRIBUTE_WORKER_ENABLED = "false";

try {
  for (const file of (await readdir(directory)).filter(f => /^\d{14}_/.test(f) && f > "20261015040727" && f.endsWith(".sql")).sort())
    await fx.pg.exec(await readFile(new URL(file,directory),"utf8"));
  await fx.pg.exec(`
    insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name)
      values('aff_a','a','account-a','Conta A'),('aff_b','b','account-b','Conta B');
    insert into garimpa.app_user(id,tenant_id,auth_user_id)
      values('u_a','a','auth_a'),('u_b','b','auth_b'),('u_operator','a','auth_operator');
    insert into garimpa.app_user_role(app_user_id,role)
      values('u_a','afiliado'),('u_b','afiliado'),('u_operator','afiliado');
    insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role)
      values('aff_a','u_a','owner'),('aff_b','u_b','owner'),('aff_a','u_operator','operator');
    insert into garimpa.curation_policy_v2(tenant_id,enabled,config) values('a',true,'{}'::jsonb);
    insert into garimpa.workspace_rollout(tenant_id,enabled) values('a',false),('b',false);
    insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents,first_seen_at,last_seen_at)
      select 'p'||i,'a','aliexpress',(10050000000+i)::text,'UGREEN '||i,
        'https://www.aliexpress.com/item/'||(10050000000+i)::text||'.html',9900,now(),now()
      from generate_series(1,13) i;
    insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,capture_source,offer_evidence)
      select 'o'||i,'a','p'||i,9900,now(),'extension',jsonb_build_object('schemaVersion',2,'currency','BRL','priceType','exact',
        'source',jsonb_build_object('method','browser','marketplace','aliexpress','capturedAt',now()))
      from generate_series(1,13) i;
    insert into garimpa.product_curation(tenant_id,product_id,status)
      select 'a','p'||i,'approved' from generate_series(1,13) i
      on conflict(tenant_id,product_id) do update set status='approved';
    insert into garimpa.curation_attribute_job(tenant_id,product_id,observation_id,input_fingerprint,input_snapshot,status)
      select 'a','p'||i,'o'||i,repeat('a',64),'{}'::jsonb,'reconciliation' from generate_series(1,13) i;
  `);
  await inAccountScope(a,async () => {
    for(const channel of ['whatsapp','stories']) assert.equal((await configureRecommendationChannel({expectedTenantId:'a',channel,
      expectedVersion:null,enabled:true,policy:defaultChannelPolicy(channel),manualOrder:null,validUntil:null},fx.factory)).ok,true);
  });
  const snapshot = async () => JSON.stringify((await fx.pg.query(`select
    (select count(*) from garimpa.publication) publications,
    (select count(*) from garimpa.short_link) shortlinks,
    (select count(*) from garimpa.recommendation_edition_archive) archive,
    (select count(*) from garimpa.curation_attribute_job) jobs,
    (select count(*) from garimpa.price_observation) observations,
    (select count(*) from garimpa.curation_attribute_reconciliation) reconciliations`)).rows);
  const before = await snapshot();
  const offer = await inAccountScope(a,() => readOperationalOffer(a,'p1',fx.factory));
  assert.ok(offer);
  assert.equal(offer.candidate.id,'p1');
  assert.equal(offer.candidate.tenantId,'a');
  assert.equal(offer.configured,false);
  assert.equal(offer.uncertain,1);
  assert.equal(offer.channels.length,2);
  assert.ok(offer.channels.every((channel:any) => !channel.selected && channel.reasons.some((r:string) => r.includes('link de afiliado'))));
  assert.equal(await inAccountScope(b,() => readOperationalOffer(b,'p1',fx.factory)),null,'foreign account cannot read the item');
  await assert.rejects(inAccountScope(b,() => readOperationalOffer(a,'p1',fx.factory)),/forbidden_account_scope/);
  assert.equal(await readOperationalOffer(a,'invalid/id',fx.factory),null);
  assert.equal(await inAccountScope(a,() => affiliateWorkspaceEnabled(a,fx.factory)),false,'commercial workspace stays disabled');
  const counts = await inAccountScope(a,() => readCurationAutomation(a,fx.factory));
  assert.equal(counts.uncertain,13);
  assert.equal(counts.exceptions,0);
  assert.equal(await inAccountScope(b,() => readCurationAutomation(b,fx.factory)),null,'legacy mode remains legacy');
  const metrics = await inAccountScope(a,() => readCurationOperationsMetrics(a,fx.factory));
  assert.equal(metrics?.uncertainAttributes?.total,13);
  const operatorMetrics = await inAccountScope(operator,() => readCurationOperationsMetrics(operator,fx.factory));
  assert.ok(operatorMetrics);
  assert.equal(operatorMetrics.uncertainAttributes,null,'release details remain owner-only');
  const [job] = (await fx.pg.query(`select id from garimpa.curation_attribute_job where tenant_id='a' and product_id='p1'`)).rows as any[];
  await assert.rejects(withAccountDb(operator,(tx:any) => tx`select garimpa.release_uncertain_attribute_job('a',${job.id}::uuid,'conferido')`,fx.factory),/reconciliation_forbidden/);
  assert.equal(await snapshot(),before,'reading and denied release do not mint links, prepare editions, alter jobs or save prices');
  await fx.pg.exec(`update garimpa.affiliate_membership set revoked_at=now() where affiliate_id='aff_a' and app_user_id='u_a'`);
  await assert.rejects(inAccountScope(a,() => readOperationalOffer(a,'p1',fx.factory)),/forbidden/);
  console.log('PASS phase 1 SQL/RLS: blocked offer accessible without commercial rollout, 13 uncertain != 0 editorial exceptions, owner/operator separation, foreign/revoked access denied, read-only diagnosis preserves facts/jobs/links');
} finally { await fx.pg.close(); }
