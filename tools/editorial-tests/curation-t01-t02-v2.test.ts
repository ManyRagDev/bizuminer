import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";
import { PostgresStore } from "../../packages/persistence/src/pg-store.ts";
import { publishCaptureSource } from "../../packages/persistence/src/capture-publication.ts";

const require = createRequire(import.meta.url);
const {
  ATTRIBUTE_POLICY_VERSION,
  enqueueAttributeDeltasBatch,
  claimAttributeJobs,
  attachAttributePromptContext,
  finishAttributeJob,
  reconcileAttributeJobs,
} = require("../../packages/web/lib/curation-attributes-db.ts");
const { ATTRIBUTE_PROMPT_VERSION } = require("../../packages/web/lib/ai-curation-v2-service.ts");
const { advanceCurationEligibility } = require("../../packages/web/lib/curation-eligibility-db.ts");
const { recomputeCurationScores } = require("../../packages/web/lib/curation-score-db.ts");
const { calculateCurationScore, DEFAULT_SCORE_WEIGHTS } = require("../../packages/web/lib/curation-score-v2.ts");
const { calculateCohortScores } = require("../../packages/web/lib/curation-cohort-v2.ts");
const { refreshCategoryReferences } = require("../../packages/web/lib/curation-category-reference-db.ts");
const { persistExtensionCapture, persistManualExtensionBatch } = require("../../packages/web/lib/extension-db.ts");
const { validateExtensionCapturePayload } = require("../../packages/web/lib/extension-contract.ts");
const { validateBrowserCaptureWithDiagnostics } = require("../../packages/web/lib/browser-capture-contract.ts");
const { editorialEvidenceFingerprint } = require("../../packages/web/lib/editorial-selection.ts");

function identifiers(base: any): any {
  if(process.env.BIZUMINER_TEST_NATIVE==='true') return base;
  const sql: any = (parts: any, ...values: any[]) =>
    typeof parts === "string"
      ? { rawFragment: '"' + parts.replaceAll('"', '""') + '"' }
      : base(parts, ...values);
  sql.json = base.json;
  sql.begin = (work: any) => base.begin((tx: any) => work(identifiers(tx)));
  sql.end = base.end;
  return sql;
}

const fx = await commercialFixture();
const migrationsDir = new URL("../../packages/persistence/supabase/migrations/", import.meta.url);
const migrationFiles = (await readdir(migrationsDir))
  .filter((f) => /^\d{14}_/.test(f) && f > "20261015040727" && f.endsWith(".sql"))
  .sort();

const rows = async <T = any>(q: string, values: unknown[] = []): Promise<T[]> =>
  (await fx.pg.query(q, values)).rows as T[];

try {
  assert.ok(migrationFiles.length >= 30, `expected full migration set, got ${migrationFiles.length}`);
  for (const file of migrationFiles) {
    await fx.pg.exec(await readFile(new URL(file, migrationsDir), "utf8"));
  }

  const triggerAccess = await rows<{ exposed: boolean }>(`select
    has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') as exposed
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='garimpa' and p.proname in
      ('record_comparative_evidence_event_from_product','record_comparative_evidence_event_from_observation')`);
  assert.equal(triggerAccess.length, 2);
  assert.ok(triggerAccess.every(row => !row.exposed), "internal comparison triggers have no direct API execution access");

  // Seed two isolated accounts (tenant a, tenant b) + device + active v2 policy
  await fx.pg.exec(`
    insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name)
    values ('aff_a','a','t01-a','Conta A'),('aff_b','b','t01-b','Conta B');
    insert into garimpa.app_user(id,tenant_id,auth_user_id)
    values ('u_a','a','auth_a'),('u_b','b','auth_b');
    insert into garimpa.app_user_role(app_user_id,role)
    values ('u_a','afiliado'),('u_b','afiliado');
    insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role)
    values ('aff_a','u_a','owner'),('aff_b','u_b','owner');
    insert into garimpa.extension_device(id,affiliate_id,created_by_app_user_id,name,token_hash)
    values ('dev_a','aff_a','u_a','Device A','tok-a'),('dev_b','aff_b','u_b','Device B','tok-b');
    insert into garimpa.editorial_guideline(tenant_id,auto_publish)
    values ('a',true),('b',true)
    on conflict(tenant_id) do update set auto_publish=excluded.auto_publish;
    insert into garimpa.curation_policy_v2(tenant_id,version,enabled,config)
    values ('a',1,true,'{"autoEligibility":true}'::jsonb),('b',1,true,'{"autoEligibility":true}'::jsonb)
    on conflict(tenant_id) do update set enabled=true,config=excluded.config;
  `);

  const store = new PostgresStore({
    connectionString: "fixture-unused",
    sqlFactory: () => identifiers(fx.factory()),
  });
  const sql = identifiers(fx.factory());
  const model = "google:gemini-2.5-flash";

  // =========================================================================
  // T01: Independent per-source publication, atomic staging, replay, A->B->A,
  // late arrival, listing-vs-PDP conflict, option clocks, backfill & isolation
  // =========================================================================
  const batchId = randomUUID();
  const workerId = "worker-t01";
  const t0 = new Date(Date.now() - 5 * 3600_000);

  await fx.pg.query(
    `insert into garimpa.capture_batch(id,tenant_id,requested_marketplaces,pages,status,metadata)
     values ($1,'a',array['shopee','amazon'],'1','running',$2::jsonb)`,
    [
      batchId,
      JSON.stringify({
        execution: {
          workerId,
          deadline: new Date(Date.now() + 600_000).toISOString(),
          stores: { shopee: { status: "ok" }, amazon: { status: "error" } },
        },
      }),
    ]
  );

  // Amazon incomplete in batch, Shopee complete in batch -> Shopee publishes independently
  const shopeeRun1 = await store.startCaptureRun({
    tenantId: "a",
    marketplace: "shopee",
    startedAt: t0,
    collectorRunId: "t01-shp-1",
    parameters: { operationBatchId: batchId, operationWorkerId: workerId },
  });
  await store.upsertProductWithObservation({
    captureRunId: shopeeRun1,
    tenantId: "a",
    marketplace: "shopee",
    externalId: "SHP-100",
    title: "Mouse Wireless USB-C Preto",
    productUrl: "https://shopee.com.br/item-100",
    category: "Tecnologia",
    priceCents: 10000,
    originalPriceCents: 15000,
    observedAt: t0,
    offerEvidence: { version: 2, currency: "BRL", priceType: "exact", observationMethod: "id_lookup" },
  });
  await store.finishCaptureRun(shopeeRun1, {
    tenantId: "a",
    finishedAt: t0,
    status: "ok",
    itemsCaptured: 1,
    itemsNew: 1,
    priceChanges: 0,
  });

  const amazonRun = await store.startCaptureRun({
    tenantId: "a",
    marketplace: "amazon",
    startedAt: t0,
    collectorRunId: "t01-amz-1",
    parameters: { operationBatchId: batchId, operationWorkerId: workerId },
  });
  await store.finishCaptureRun(amazonRun, {
    tenantId: "a",
    finishedAt: t0,
    status: "error",
    itemsCaptured: 0,
    itemsNew: 0,
    priceChanges: 0,
    errorMessage: "source failed",
  });

  // Shopee publishes independently even while Amazon failed!
  const publishedShopee = await publishCaptureSource(sql, "a", batchId, workerId, "shopee");
  assert.equal(publishedShopee.observations, 1);
  assert.equal(publishedShopee.policy, "per-source-v2");

  // Attempting to publish failed amazon source must throw capture_publication_incomplete
  await assert.rejects(
    () => publishCaptureSource(sql, "a", batchId, workerId, "amazon"),
    /capture_publication_incomplete/
  );

  // Verify product_source_page, offer_verification, curation_fact_delta populated for SHP-100
  const [prod] = await rows<{ id: string; last_price_cents: number }>(
    `select id,last_price_cents from garimpa.product where tenant_id='a' and external_id='SHP-100'`
  );
  assert.equal(prod.last_price_cents, 10000);
  const verifications = await rows(
    `select price_type,option_key from garimpa.offer_verification where tenant_id='a' and product_id=$1`,
    [prod.id]
  );
  assert.deepEqual(verifications, [{ price_type: "exact", option_key: "listing" }]);

  // Stable price on independent run 2 records a NEW observation row (non-dedup across runs)
  // and A->B->A across runs preserves all facts; late event keeps latest price_cents
  const t1 = new Date(t0.getTime() + 60 * 60_000);
  const run2 = await store.startCaptureRun({ tenantId: "a", marketplace: "shopee", startedAt: t1, collectorRunId: "t01-shp-2", parameters: {} });
  await store.upsertProductWithObservation({
    captureRunId: run2,
    tenantId: "a",
    marketplace: "shopee",
    externalId: "SHP-100",
    title: "Mouse Wireless USB-C Preto",
    productUrl: "https://shopee.com.br/item-100",
    category: "Tecnologia",
    priceCents: 10000, // stable price!
    observedAt: t1,
    offerEvidence: { version: 2, currency: "BRL", priceType: "exact", observationMethod: "id_lookup" },
  });
  // Same run replay before finish doesn't duplicate or mutate first observation
  await store.upsertProductWithObservation({
    captureRunId: run2,
    tenantId: "a",
    marketplace: "shopee",
    externalId: "SHP-100",
    title: "Mouse Wireless USB-C Preto",
    productUrl: "https://shopee.com.br/item-100",
    category: "Tecnologia",
    priceCents: 9999,
    observedAt: t1,
    offerEvidence: { version: 2, currency: "BRL", priceType: "exact", observationMethod: "id_lookup" },
  });
  await store.finishCaptureRun(run2, { tenantId: "a", finishedAt: t1, status: "ok", itemsCaptured: 1, itemsNew: 0, priceChanges: 0 });
  await assert.rejects(
    () =>
      store.upsertProductWithObservation({
        captureRunId: run2,
        tenantId: "a",
        marketplace: "shopee",
        externalId: "SHP-100",
        title: "Mouse Wireless USB-C Preto",
        productUrl: "https://shopee.com.br/item-100",
        category: "Tecnologia",
        priceCents: 8888,
        observedAt: t1,
        offerEvidence: { version: 2, currency: "BRL", priceType: "exact", observationMethod: "id_lookup" },
      }),
    /capture_run_not_writable/
  );

  // Direct publication mode (runs 3 & 4): A(10000) -> B(12000) -> A(10000), plus late t_old(8500)
  const t2 = new Date(t0.getTime() + 2 * 3600_000);
  const t3 = new Date(t0.getTime() + 3 * 3600_000);
  const tLate = new Date(t0.getTime() - 3600_000);
  for (const [colId, price, when] of [
    ["t01-shp-3", 12000, t2],
    ["t01-shp-4", 10000, t3],
    ["t01-shp-late", 8500, tLate],
  ] as const) {
    const r = await store.startCaptureRun({ tenantId: "a", marketplace: "shopee", startedAt: when, collectorRunId: colId, parameters: {} });
    await store.upsertProductWithObservation({
      captureRunId: r,
      tenantId: "a",
      marketplace: "shopee",
      externalId: "SHP-100",
      title: "Mouse Wireless USB-C Preto",
      productUrl: "https://shopee.com.br/item-100",
      category: "Tecnologia",
      priceCents: price,
      observedAt: when,
      offerEvidence: { version: 2, currency: "BRL", priceType: "exact", observationMethod: "id_lookup" },
    });
    await store.finishCaptureRun(r, { tenantId: "a", finishedAt: when, status: "ok", itemsCaptured: 1, itemsNew: 0, priceChanges: 1 });
  }
  const obsCount = (await rows<{ n: number }>(`select count(*)::int as n from garimpa.price_observation where product_id=$1`, [prod.id]))[0]!.n;
  assert.equal(obsCount, 5, "all 5 distinct runs (including stable price, A->B->A, and late historical point) preserved");
  const [prodAfter] = await rows<{ last_price_cents: number }>(`select last_price_cents from garimpa.product where id=$1`, [prod.id]);
  assert.equal(prodAfter!.last_price_cents, 10000, "late historical observation did not overwrite newer last_price_cents");

  // Extension PDP variant option clocks vs listing, replay idempotency & late events
  // Contract proof: non-batch payload rejects variantKey, whereas batch PDP payload with matching ?variation= accepts numeric variantKey.
  const devA = { deviceId: "dev_a", tenantId: "a", affiliateId: "aff_a", appUserId: "u_a", affiliatePublicSlug: "t01-a" };
  const nowMs = Date.now();
  const tOpt1Iso = new Date(nowMs - 9 * 60_000).toISOString();
  const tOpt2Iso = new Date(nowMs - 8 * 60_000).toISOString();
  const tListIso = new Date(nowMs - 7 * 60_000).toISOString();
  const tOpt1LateIso = new Date(nowMs - 10 * 60_000).toISOString();

  assert.throws(
    () =>
      validateExtensionCapturePayload(
        {
          version: 1,
          marketplace: "mercadolivre",
          requestId: randomUUID(),
          clientCapturedAt: tOpt1Iso,
          page: { kind: "product", url: "https://produto.mercadolivre.com.br/MLB-555000111-mouse?variation=1001" },
          product: {
            externalId: "MLB555000111",
            title: "Teclado Mecanico Compacto",
            productUrl: "https://produto.mercadolivre.com.br/MLB-555000111-mouse?variation=1001",
            priceCents: 20000,
            currency: "BRL",
            priceType: "exact",
            variantKey: "1001",
          },
        },
        false
      ),
    /product\.variantKey inválida/,
    "single non-batch contract rejects variantKey"
  );

  const reqOpt1 = randomUUID();
  const batchOpt1Raw = {
    version: 1,
    marketplace: "mercadolivre",
    requestId: reqOpt1,
    clientCapturedAt: tOpt1Iso,
    page: { kind: "product", url: "https://produto.mercadolivre.com.br/MLB-555000111-mouse?variation=1001" },
    products: [
      {
        externalId: "MLB555000111",
        title: "Teclado Mecanico Compacto",
        productUrl: "https://produto.mercadolivre.com.br/MLB-555000111-mouse?variation=1001",
        priceCents: 20000,
        currency: "BRL",
        priceType: "exact",
        variantKey: "1001",
        variantLabel: "Switch Brown",
      },
    ],
  };
  const valOpt1 = validateBrowserCaptureWithDiagnostics(batchOpt1Raw);
  assert.equal(valOpt1.payload.products[0]?.variantKey, "1001");
  const resOpt1 = await persistManualExtensionBatch(devA, valOpt1.payload, fx.factory);
  assert.equal(resOpt1.importedCount, 1);
  assert.equal(resOpt1.duplicate, false);
  const extPdp = { productId: resOpt1.productIds[0]! };

  const valOpt2 = validateBrowserCaptureWithDiagnostics({
    version: 1,
    marketplace: "mercadolivre",
    requestId: randomUUID(),
    clientCapturedAt: tOpt2Iso,
    page: { kind: "product", url: "https://produto.mercadolivre.com.br/MLB-555000111-mouse?variation=2002" },
    products: [
      {
        externalId: "MLB555000111",
        title: "Teclado Mecanico Compacto",
        productUrl: "https://produto.mercadolivre.com.br/MLB-555000111-mouse?variation=2002",
        priceCents: 21500,
        currency: "BRL",
        priceType: "exact",
        variantKey: "2002",
        variantLabel: "Switch Red",
      },
    ],
  });
  const resOpt2 = await persistManualExtensionBatch(devA, valOpt2.payload, fx.factory);
  assert.equal(resOpt2.importedCount, 1);
  assert.equal(resOpt2.productIds[0], extPdp.productId);

  // Subsequent listing capture at newer timestamp has priceType 'from' -> 'listing' option clock only
  await persistExtensionCapture(
    devA,
    validateExtensionCapturePayload({
      version: 1,
      marketplace: "mercadolivre",
      requestId: randomUUID(),
      clientCapturedAt: tListIso,
      page: { kind: "offers", url: "https://www.mercadolivre.com.br/ofertas" },
      product: {
        externalId: "MLB555000111",
        title: "Teclado Mecanico Compacto",
        productUrl: "https://produto.mercadolivre.com.br/MLB-555000111-mouse",
        priceCents: 18500,
        currency: "BRL",
        priceType: "from",
      },
    }),
    fx.factory
  );

  const mlObs = await rows<{
    id: string;
    option_key: string;
    price_cents: number;
    observed_at: string;
    offer_evidence: any;
  }>(
    `select id,option_key,price_cents,observed_at::text as observed_at,offer_evidence
       from garimpa.price_observation where tenant_id='a' and product_id=$1 order by observed_at,option_key`,
    [extPdp.productId]
  );
  assert.equal(mlObs.length, 3, "two variant PDP captures + one listing capture produce 3 observations");
  const obs1001 = mlObs.find((o) => o.offer_evidence?.variantIdentity?.key === "1001");
  const obs2002 = mlObs.find((o) => o.offer_evidence?.variantIdentity?.key === "2002");
  const obsList = mlObs.find((o) => o.option_key === "listing");
  assert.ok(obs1001 && obs2002 && obsList);
  assert.equal(obs1001.offer_evidence.variantIdentity.state, "source_verified");
  assert.equal(obs2002.offer_evidence.variantIdentity.state, "source_verified");
  assert.match(obs1001.option_key, /^[0-9a-f]{32}$/, "variant 1001 resolves to concrete 32-hex option_key");
  assert.match(obs2002.option_key, /^[0-9a-f]{32}$/, "variant 2002 resolves to concrete 32-hex option_key");
  assert.notEqual(obs1001.option_key, obs2002.option_key, "distinct variantKeys isolate into distinct option_keys");
  assert.notEqual(obs1001.option_key, "listing");
  assert.notEqual(obs2002.option_key, "listing");

  const mlVerifs = await rows<{
    option_key: string;
    price_type: string;
    observation_id: string;
    price_cents: number;
    verified_at_ms: number;
  }>(
    `select v.option_key,v.price_type,v.observation_id,o.price_cents,(extract(epoch from v.verified_at)*1000)::bigint as verified_at_ms
       from garimpa.offer_verification v
       join garimpa.price_observation o on o.id=v.observation_id
       where v.tenant_id='a' and v.product_id=$1`,
    [extPdp.productId]
  );
  assert.equal(mlVerifs.length, 3, "listing 'from' and two distinct concrete variants maintain 3 independent verification clocks");
  const verif1001 = mlVerifs.find((v) => v.option_key === obs1001.option_key)!;
  const verif2002 = mlVerifs.find((v) => v.option_key === obs2002.option_key)!;
  const verifList = mlVerifs.find((v) => v.option_key === "listing")!;
  assert.equal(verifList.price_type, "from");
  assert.equal(verif1001.price_type, "exact");
  assert.equal(verif2002.price_type, "exact");
  assert.equal(verif1001.observation_id, obs1001.id);
  assert.ok(verif2002.verified_at_ms > verif1001.verified_at_ms, "updating variant 2002 leaves variant 1001 verified_at earlier/untouched");
  assert.ok(verifList.verified_at_ms > verif2002.verified_at_ms, "updating listing leaves variant 2002 & 1001 clocks untouched");

  // Replay of variant 1001 batch does not insert duplicate observation or advance its clock
  const replayOpt1 = await persistManualExtensionBatch(devA, valOpt1.payload, fx.factory);
  assert.equal(replayOpt1.duplicate, true);
  assert.equal(replayOpt1.importedCount, 0);

  // Late historical capture for variant 1001 (tOpt1Late < tOpt1): recorded in price_observation, NEVER overwrites newer offer_verification
  const lateOpt1 = validateBrowserCaptureWithDiagnostics({
    ...batchOpt1Raw,
    requestId: randomUUID(),
    clientCapturedAt: tOpt1LateIso,
    products: [{ ...batchOpt1Raw.products[0]!, priceCents: 19500 }],
  });
  const resLateOpt1 = await persistManualExtensionBatch(devA, lateOpt1.payload, fx.factory);
  assert.equal(resLateOpt1.importedCount, 1);

  const mlObsAfterLate = await rows<{ id: string; option_key: string; price_cents: number }>(
    `select id,option_key,price_cents from garimpa.price_observation where tenant_id='a' and product_id=$1 and option_key=$2 order by observed_at`,
    [extPdp.productId, obs1001.option_key]
  );
  assert.equal(mlObsAfterLate.length, 2, "late observation for variant 1001 preserved in price history without duplication from replay");
  assert.deepEqual(mlObsAfterLate.map((r) => r.price_cents), [19500, 20000]);

  const [verif1001AfterLate] = await rows<{ observation_id: string; price_cents: number; verified_at_ms: number }>(
    `select v.observation_id,o.price_cents,(extract(epoch from v.verified_at)*1000)::bigint as verified_at_ms
       from garimpa.offer_verification v
       join garimpa.price_observation o on o.id=v.observation_id
       where v.tenant_id='a' and v.product_id=$1 and v.option_key=$2 and v.price_type='exact'`,
    [extPdp.productId, obs1001.option_key]
  );
  assert.equal(verif1001AfterLate?.observation_id, obs1001.id, "late observation does not overwrite latest offer_verification.observation_id");
  assert.equal(verif1001AfterLate?.price_cents, 20000, "late observation does not overwrite newer verified price");
  assert.equal(verif1001AfterLate?.verified_at_ms, verif1001.verified_at_ms, "late observation does not shift verified_at clock");

  // Source page tracking & cross-tenant isolation
  const pages = await rows<{ encounter_count: number }>(
    `select encounter_count from garimpa.product_source_page where tenant_id='a' and product_id=$1`,
    [extPdp.productId]
  );
  assert.ok(pages.length >= 2);
  const bRows = await rows(`select count(*)::int as n from garimpa.product where tenant_id='b'`);
  assert.equal(bRows[0].n, 0, "tenant b remains completely isolated");

  console.log("PASS T01: per-source publication, atomic staging, stable price history, A->B->A, late event, option clocks, and isolation");

  // =========================================================================
  // T02: Attribute deltas (<10% skip vs material change), human veto supersede,
  // reconciliation lock, owner release, neutral score v2, cohorts & eligibility
  // =========================================================================
  // Create projection lease owner
  const owner = randomUUID();
  await rows(
    `insert into garimpa.curation_projection_job(tenant_id,dirty_revision,next_due_at,lease_owner,lease_until)
     values ('a',1,now(),$1::uuid,now()+interval '10 minutes')
     on conflict(tenant_id) do update set lease_owner=$1::uuid,lease_until=now()+interval '10 minutes'`,
    [owner]
  );

  // Enqueue deltas from pending curation_fact_delta
  const enq = await enqueueAttributeDeltasBatch(sql, "a", model, 100, owner);
  assert.ok(enq.queued >= 2, `expected queued attribute jobs >= 2, got ${enq.queued}`);

  // Test reconciliation freeze: claim 1 job, call reconcileAttributeJobs, verify NOT re-claimed
  const claimed1 = await claimAttributeJobs(sql, "a", 1, 10, model);
  assert.equal(claimed1.length, 1);
  const reconciledId = claimed1[0].id;
  await reconcileAttributeJobs(sql, "a", claimed1);
  const reClaimed = await claimAttributeJobs(sql, "a", 20, 10, model);
  assert.ok(!reClaimed.some((j: any) => j.id === reconciledId), "reconciliation job must NOT auto-retry");
  assert.equal(reClaimed.length, 1, "remaining queued job claimed cleanly without touching reconciliation job");

  // Unprivileged / missing owner context is forbidden from releasing reconciliation job
  await assert.rejects(
    () => rows(`select garimpa.release_uncertain_attribute_job('a',$1::uuid,'sem dono') as ok`, [reconciledId]),
    /reconciliation_forbidden/
  );
  // Owner releases uncertain job back to queue with real RLS / account session variables!
  await fx.pg.transaction(async (tx) => {
    await tx.exec(`set local role garimpa_app`);
    await tx.query(
      `select set_config('garimpa.tenant_id','a',true),set_config('garimpa.actor_type','human',true),set_config('garimpa.actor_app_user_id','u_a',true),set_config('garimpa.membership_role','owner',true)`
    );
    const res = await tx.query(
      `select garimpa.release_uncertain_attribute_job('a',$1::uuid,'conferido pelo dono') as ok`,
      [reconciledId]
    );
    assert.equal(res.rows[0].ok, true, "owner can release reconciliation job to queued");
  });

  // Enqueue reopened delta into a fresh queued job (old reconciliation job is now superseded with audit log)
  const reEnq = await enqueueAttributeDeltasBatch(sql, "a", model, 100, owner);
  assert.equal(reEnq.queued, 1);
  const claimedReleased = await claimAttributeJobs(sql, "a", 20, 20, model);
  assert.equal(claimedReleased.length, 1);
  assert.notEqual(claimedReleased[0].id, reconciledId);
  await attachAttributePromptContext(sql, "a", reClaimed, []);
  await attachAttributePromptContext(sql, "a", claimedReleased, []);
  const claimedAll = [...reClaimed, ...claimedReleased];
  assert.equal(claimedAll.length, 2);

  // Simulate human veto IN FLIGHT before finishing one product (prod.id SHP-100), finish the other cleanly!
  await fx.pg.query(
    `insert into garimpa.product_curation(tenant_id,product_id,status,reason_code)
     values ('a',$1,'rejected','manual_reject')
     on conflict(tenant_id,product_id) do update set status='rejected',reason_code='manual_reject'`,
    [prod.id]
  );
  await fx.pg.query(
    `insert into garimpa.curation_event(tenant_id,product_id,from_status,to_status,actor_type,actor_app_user_id)
     values ('a',$1,'pending','rejected','human','u_a')`,
    [prod.id]
  );

  for (const job of claimedAll) {
    const pid = job.snapshot.input.productId;
    const outcome = await finishAttributeJob(sql, "a", job, {
      productId: pid,
      qualidade: 8.5,
      genuinidade_oferta: 8.0,
      apelo_whatsapp: 7.5,
      categoria: "Tecnologia",
      flags: [],
      confianca: 0.9,
      justificativa: "Produto útil com bom histórico factual.",
      fatos_usados: ["titulo", "preco_brl"],
      duvidas: [],
    });
    if (pid === prod.id) {
      assert.equal(outcome, "superseded", "in-flight human veto must supersede attribute commit without polluting projection");
    } else {
      assert.equal(outcome, "completed");
    }
  }

  // Test <10% price change without material change skips re-calling LLM
  const tSmall = new Date(nowMs - 5 * 60_000);
  await persistExtensionCapture(
    devA,
    validateExtensionCapturePayload({
      version: 1,
      marketplace: "mercadolivre",
      requestId: randomUUID(),
      clientCapturedAt: tSmall.toISOString(),
      page: { kind: "offers", url: "https://www.mercadolivre.com.br/ofertas" },
      product: {
        externalId: "MLB555000111",
        title: "Teclado Mecanico Compacto",
        productUrl: "https://produto.mercadolivre.com.br/MLB-555000111-mouse",
        priceCents: 18900, // ~2.1% change (<10%)!
        currency: "BRL",
        priceType: "from",
      },
    }),
    fx.factory
  );
  const enqSmall = await enqueueAttributeDeltasBatch(sql, "a", model, 100, owner);
  assert.equal(enqSmall.queued, 0, "<10% price delta with unchanged material facts must reuse assessment");

  // Eligibility v2: MLB555000111 promoted pending -> approved, SHP-100 stays rejected!
  const elig = await advanceCurationEligibility(sql, "a", model, owner, 50);
  assert.equal(elig.advanced, 1, "only non-vetoed product with valid assessment advances to approved");
  const curStatuses = await rows<{ id: string; status: string }>(
    `select product_id as id,status from garimpa.product_curation where tenant_id='a' order by product_id`
  );
  assert.equal(curStatuses.find((r) => r.id === prod.id)?.status, "rejected");
  assert.equal(curStatuses.find((r) => r.id === extPdp.productId)?.status, "approved");

  // Score v2 neutrality check: missing popularity/discount/savings keeps neutral defaults (50), doesn't zero score
  const neutralScore = calculateCurationScore(
    {
      quality: { value: 80, confidence: 0.85 },
      popularity: { value: null, confidence: 0 },
      discount: { value: null, confidence: 0 },
      savings: { value: null, confidence: 0 },
      store: { value: 60, confidence: 0.5 },
      whatsapp: { value: 70, confidence: 0.85 },
      observedAt: t3.toISOString(),
    },
    tSmall,
    DEFAULT_SCORE_WEIGHTS
  );
  assert.ok(neutralScore.scoreVitrine > 40 && neutralScore.potentialScore >= neutralScore.scoreVitrine);

  // Cohort + DB score projection persistence check
  const cohortScores = calculateCohortScores([
    {
      id: "c1",
      category: "Tecnologia",
      priceCents: 10000,
      observedAt: tSmall.toISOString(),
      assessment: {
        productId: "c1",
        qualidade: 85,
        genuinidade_oferta: 80,
        apelo_whatsapp: 75,
        categoria: "Tecnologia",
        flags: [],
        confianca: 0.9,
        justificativa: "ok",
        fatos_usados: [],
        duvidas: [],
      },
      salesCount: 300,
      ratingStar: 4.9,
      ratingCount: 50,
      historicalReferenceCents: 13500,
      historicalConfidence: 0.9,
      declaredDiscount: 0.25,
      storeSignal: 80,
      storeConfidence: 0.8,
    },
    {
      id: "c2",
      category: "Tecnologia",
      priceCents: 12000,
      observedAt: tSmall.toISOString(),
      assessment: {
        productId: "c2",
        qualidade: 55,
        genuinidade_oferta: 55,
        apelo_whatsapp: 50,
        categoria: "Tecnologia",
        flags: [],
        confianca: 0.9,
        justificativa: "ok",
        fatos_usados: [],
        duvidas: [],
      },
      salesCount: 10,
      ratingStar: 4.1,
      ratingCount: 25,
      historicalReferenceCents: 12500,
      historicalConfidence: 0.9,
      declaredDiscount: 0.04,
      storeSignal: 60,
      storeConfidence: 0.8,
    },
  ]);
  const c1 = cohortScores.find((s: any) => s.productId === "c1")!;
  const c2 = cohortScores.find((s: any) => s.productId === "c2")!;
  assert.ok(c1.score.scoreVitrine > c2.score.scoreVitrine);

  const scored = await recomputeCurationScores(sql, "a", model, new Date(tSmall.getTime() + 60_000), owner);
  assert.ok(scored.written >= 1, `expected score projections written >= 1, got ${scored.written}`);
  const projCount = (await rows<{ n: number }>(`select count(*)::int as n from garimpa.curation_score_projection where tenant_id='a'`))[0]!.n;
  assert.ok(projCount >= 1);

  console.log("PASS T02: attribute deltas (<10% reuse, veto supersede), reconciliation lock + owner release, eligibility v2, and score projection");
} finally {
  await fx.pg.close();
}
