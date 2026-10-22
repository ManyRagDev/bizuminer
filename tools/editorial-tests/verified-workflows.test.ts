import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { commercialFixture } from "./commercial-fixture.ts";
const require = createRequire(import.meta.url);
const { pg, factory } = await commercialFixture();
const { withAccountDb } = require("../../packages/web/lib/tenant-db.ts");
const { inAccountScope } = require("../../packages/web/lib/account-scope.ts");
const fin = require("../../packages/web/lib/commercial-financial-db.ts");
const onboarding = require("../../packages/web/lib/saas-onboarding-db.ts");
const rubric = require("../../packages/web/lib/rubric-db.ts");
const artifacts = require("../../packages/web/lib/private-artifact-db.ts");
const workflow = require("../../packages/web/lib/commercial-workflow.ts");
const dispatch = require("../../packages/web/lib/dispatch-db.ts");
const worker = require("../../packages/web/lib/dispatch-worker.ts");
const ctx = (t: string) => ({
  tenantId: t,
  affiliateId: "aff_" + t,
  actor: "human",
  actorAppUserId: "u_" + t,
  authenticatedAuthUserId: "auth_" + t,
  membershipRole: "owner",
  requestId: "verified-" + t,
});
const scenarioResults: any[] = [];
async function test(name: string, work: () => Promise<void>) {
  await work();
  scenarioResults.push({ name, status: "passed" });
  console.log("PASS " + name);
}
const objects = new Map<string, Uint8Array>();
const store = {
  put: async (path: string, bytes: Uint8Array) => {
    objects.set(path, bytes.slice());
  },
  get: async (path: string) => {
    const b = objects.get(path);
    if (!b) throw Error("object_missing");
    return b;
  },
};
await pg.exec(`
 insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values
 ('aff_a','a','audit-a','Audit A'),('aff_b','b','audit-b','Audit B'),('aff_local','local','audit-house','Audit House');
 insert into garimpa.app_user(id,tenant_id,auth_user_id) values ('u_a','a','auth_a'),('u_b','b','auth_b'),('u_new','a','auth_new');
 insert into garimpa.app_user_role(app_user_id,role) values ('u_a','afiliado'),('u_b','afiliado'),('u_new','afiliado');
 insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values ('aff_a','u_a','owner'),('aff_b','u_b','owner');
 insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values
 ('p_a','a','mercadolivre','101','Audit product A','https://mercadolivre.com.br/a',10000),
 ('p_b','b','mercadolivre','102','Audit product B','https://mercadolivre.com.br/b',10000),
 ('p_house','local','mercadolivre','103','Audit house product','https://mercadolivre.com.br/house',10000);
 insert into garimpa.product_curation(tenant_id,product_id,status) values ('a','p_a','approved'),('b','p_b','pending'),('local','p_house','pending');
 insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,offer_evidence) values ('o_a','a','p_a',10000,'{}'),('o_b','b','p_b',10000,'{}'),('o_house','local','p_house',10000,'{}');
 insert into garimpa.account_entitlement(tenant_id,affiliate_id,plan_version,status,starts_at,ends_at,limits,terms_ref) values
 ('a','aff_a','test','active','2026-01-01','2027-01-01','{"maxActiveCampaigns":10,"maxDailyKits":10}','test-only'),
 ('b','aff_b','test','active','2026-01-01','2027-01-01','{"maxActiveCampaigns":10,"maxDailyKits":10}','test-only');
 insert into garimpa.account_invitation(tenant_id,affiliate_id,token_hash,invited_email,role,expires_at,created_by) values
 ('a','aff_a','hash-a','synthetic-a@example.invalid','operator','2027-01-01','u_a'),
 ('b','aff_b','hash-b','synthetic-b@example.invalid','operator','2027-01-01','u_b');
`);
// Corpo de diagnóstico; montado com a fixture/seed sintética da revisão 16.

await pg.exec(
  `update garimpa.product set marketplace='shopee',product_url='https://shopee.com.br/a' where id='p_a';insert into garimpa.publication(id,tenant_id,affiliate_id,product_id,channel,slug,status,affiliate_url) values('web-a','a','aff_a','p_a','web','audit-a-product','active','https://s.shopee.com.br/synthetic-a');`,
);
const evidence = {
  version: 2,
  currency: "BRL",
  priceType: "exact",
  variantIdentity: { state: "source_verified", key: "unit" },
  packageQuantity: 1,
  fieldStates: {
    sellerId: "not_applicable",
    packageContents: "not_applicable",
    dimensions: "not_applicable",
    payment: "not_applicable",
    coupon: "not_applicable",
    region: "not_applicable",
  },
};
await pg.query(
  `update garimpa.price_observation set offer_evidence=$1 where id='o_a'`,
  [JSON.stringify(evidence)],
);
await test("request scope refuses cross-account tenant and forged membership; own and global identity stay usable", async () => {
  const curation = require("../../packages/web/lib/curation-db.ts");
  await assert.rejects(
    () =>
      inAccountScope(ctx("b"), () =>
        curation.curationQueue(20, "local", "awaiting", factory),
      ),
    /forbidden_account_scope/,
  );
  await assert.rejects(
    () =>
      withAccountDb(
        { ...ctx("a"), tenantId: "b", affiliateId: "aff_b" },
        async () => true,
        factory,
      ),
    /forbidden/,
  );
  const own = await inAccountScope(ctx("a"), () =>
    curation.curationSummary("a", factory, ctx("a")),
  );
  assert.equal(own.approved, 1);
});
await test("verified invitation identity crosses accounts, rejects typed recipient, and token is single-use", async () => {
  const invite = await onboarding.createAccountInvitation(
    ctx("a"),
    { invitedEmail: "recipient@example.invalid", role: "operator" },
    factory,
  );
  await assert.rejects(
    () =>
      onboarding.acceptAccountInvitation(
        {
          ...ctx("b"),
          verifiedEmail: "other@example.invalid",
          emailConfirmed: true,
        },
        {
          rawToken: invite.rawToken,
          invitedEmail: "recipient@example.invalid",
        },
        factory,
      ),
    /email_mismatch/,
  );
  await assert.rejects(
    () =>
      onboarding.acceptAccountInvitation(
        {
          ...ctx("b"),
          verifiedEmail: "recipient@example.invalid",
          emailConfirmed: false,
        },
        { rawToken: invite.rawToken },
        factory,
      ),
    /verified_session/,
  );
  const accepted = await onboarding.acceptAccountInvitation(
    {
      ...ctx("b"),
      verifiedEmail: "recipient@example.invalid",
      emailConfirmed: true,
    },
    { rawToken: invite.rawToken },
    factory,
  );
  assert.equal(accepted.tenantId, "a");
  await assert.rejects(
    () =>
      onboarding.acceptAccountInvitation(
        {
          ...ctx("b"),
          verifiedEmail: "recipient@example.invalid",
          emailConfirmed: true,
        },
        { rawToken: invite.rawToken },
        factory,
      ),
    /USED|used|invalid/,
  );
});
await test("human v2 round trip, stable replay, multi-account author and no automatic ratification", async () => {
  const facts = await withAccountDb(
      ctx("a"),
      (tx: any) => rubric.loadRubricInput(tx, "a", "p_a"),
      factory,
    ),
    digest = rubric.calculateRubricInputDigest(facts);
  const assessment = {
    schemaVersion: 2,
    quality: { level: "strong", reason: "Synthetic human observation" },
    value: { level: "adequate", reason: "Synthetic value assessment" },
    audience: { level: "adequate", reason: "Synthetic audience" },
    evidenceConfidence: { level: "adequate", reason: "Persisted facts" },
    factsUsed: [],
    inferences: [],
    unknowns: [],
    safetyFlags: [],
    policyVersion: "rubric-v2",
    evidenceDigest: digest,
    createdAt: new Date().toISOString(),
  };
  const input = {
    tenantId: "a",
    productId: "p_a",
    humanAssessment: assessment,
    reviewedByAppUserId: "u_b",
    requestId: "review-original",
  };
  const solo = await withAccountDb(
    ctx("a"),
    (tx: any) => rubric.recordHumanRubricReview(tx, input),
    factory,
  );
  assert.equal(solo.hasShadow, false);
  const reopened = await withAccountDb(
    ctx("a"),
    (tx: any) => rubric.getLatestHumanRubricAssessment(tx, "a", "p_a"),
    factory,
  );
  assert.deepEqual(reopened, assessment);
  await withAccountDb(
    ctx("a"),
    (tx: any) =>
      rubric.saveAnalysisAssessment(tx, {
        tenantId: "a",
        productId: "p_a",
        rubricVersion: "rubric-v2",
        inputDigest: digest,
        result: assessment,
        modelVersion: "synthetic",
        promptVersion: "synthetic",
        mode: "shadow",
      }),
    factory,
  );
  for (let n = 0; n < 30; n++)
    await withAccountDb(
      ctx("a"),
      (tx: any) =>
        rubric.recordHumanRubricReview(tx, {
          ...input,
          requestId: "review-compared",
        }),
      factory,
    );
  const metrics = await withAccountDb(
    ctx("a"),
    (tx: any) => rubric.getRubricPromotionMetrics(tx, "a"),
    factory,
  );
  assert.equal(metrics.totalReviewed, 1);
  assert.equal(metrics.status, "shadow");
  assert.equal(metrics.minAgreementRateTarget, null);
  const count = (
    await pg.query(
      `select count(*)::int as n from garimpa.editorial_assessment where product_id='p_a'`,
    )
  ).rows[0] as any;
  assert.equal(count.n, 2);
  await assert.rejects(
    () =>
      withAccountDb(
        ctx("a"),
        (tx: any) =>
          rubric.recordHumanRubricReview(tx, {
            ...input,
            humanAssessment: {
              ...assessment,
              quality: { level: "weak", reason: "Different" },
            },
          }),
        factory,
      ),
    /idempotency_conflict/,
  );
});
const header =
  "externalOrderId,externalItemId,occurredAt,orderValueCents,commissionCents,currency,marketplace,subId,status,commissionState,sourceRevision";
async function preview(order: string, amount: number, revision: string) {
  const csv =
    header +
    "\n" +
    `${order},item,2026-10-14T10:00:00Z,10000,${amount},BRL,shopee,,confirmed,confirmed,${revision}`;
  const original = await artifacts.savePrivateArtifact(
    ctx("a"),
    {
      kind: "commission_original",
      name: "synthetic.csv",
      bytes: new TextEncoder().encode(csv),
      mime: "text/csv",
    },
    factory,
    store,
  );
  return fin.createOrGetImportBatchPreview(
    ctx("a"),
    { marketplace: "shopee", csvContent: csv, artifactId: original.id },
    factory,
  );
}
await test("private original, explicit empty selection, four revisions, replay and event conflict", async () => {
  for (const [n, amount] of [100, 150, 175, 200].entries()) {
    const p = await preview("financial-revisions", amount, "revision-" + n);
    const empty = await fin.commitImportBatch(
      ctx("a"),
      {
        batchId: p.batchId,
        expectedDigest: p.preview.fileDigest,
        selectedRowIds: [],
      },
      factory,
    );
    assert.equal(empty.committedRowsCount, 0);
    const input = {
      batchId: p.batchId,
      expectedDigest: p.preview.fileDigest,
      selectedRowIds: p.preview.rowDecisions.map((r: any) => r.rowId),
    };
    assert.equal(
      (await fin.commitImportBatch(ctx("a"), input, factory))
        .committedRowsCount,
      1,
    );
    assert.equal(
      (await fin.commitImportBatch(ctx("a"), input, factory)).alreadyCommitted,
      true,
    );
    await assert.rejects(
      () =>
        fin.commitImportBatch(
          ctx("a"),
          { ...input, selectedRowIds: [] },
          factory,
        ),
      /selection_conflict/,
    );
  }
  const ledger = (
    await pg.query(
      `select amount_cents::int,predecessor_id from garimpa.commission_entry e join garimpa.conversion c on c.id=e.conversion_id where c.external_order_id='financial-revisions' order by e.created_at,e.id`,
    )
  ).rows as any[];
  assert.deepEqual(
    ledger.map((r) => r.amount_cents),
    [100, 150, 175, 200],
  );
  assert.equal(ledger.filter((r) => r.predecessor_id).length, 3);
  const conflict = await preview("financial-revisions", 999, "revision-1");
  await assert.rejects(
    () =>
      fin.commitImportBatch(
        ctx("a"),
        {
          batchId: conflict.batchId,
          expectedDigest: conflict.preview.fileDigest,
          selectedRowIds: conflict.preview.rowDecisions.map(
            (r: any) => r.rowId,
          ),
        },
        factory,
      ),
    /source_event_conflict/,
  );
  const files = await withAccountDb(
    ctx("a"),
    (tx: any) =>
      tx`select id from garimpa.private_artifact where kind='commission_original'`,
    factory,
  );
  await assert.rejects(
    () =>
      artifacts.downloadPrivateArtifact(ctx("b"), files[0].id, factory, store),
    /not_found/,
  );
  const raw = await artifacts.downloadPrivateArtifact(
    ctx("a"),
    files[0].id,
    factory,
    store,
  );
  assert.ok(new TextDecoder().decode(raw.bytes).startsWith(header));
});
await test("unresolved references cannot finish onboarding; administrator can suspend/reactivate B preserving A", async () => {
  await onboarding.recordOnboardingProgress(
    ctx("a"),
    { step: "account_created", status: "completed" },
    factory,
  );
  await assert.rejects(
    () =>
      onboarding.recordOnboardingProgress(
        ctx("a"),
        {
          step: "marketplace_credentials_configured",
          status: "completed",
          evidenceRef: "invented",
        },
        factory,
      ),
    /missing_evidence/,
  );
  await pg.exec(
    `insert into garimpa.app_user_role(app_user_id,role) values('u_a','platform_admin')`,
  );
  await onboarding.suspendAccountByPlatformAdmin(
    ctx("a"),
    { targetTenantId: "b", reason: "Synthetic" },
    factory,
  );
  await assert.rejects(
    () => withAccountDb(ctx("b"), async () => true, factory),
    /forbidden/,
  );
  await onboarding.reactivateAccountByPlatformAdmin(
    ctx("a"),
    { targetTenantId: "b", reason: "Synthetic recovery" },
    factory,
  );
  assert.equal(await withAccountDb(ctx("a"), async () => true, factory), true);
  assert.equal(await withAccountDb(ctx("b"), async () => true, factory), true);
});
await test("ratification requires distinct evidence, exact version, owner and immutable explicit decision", async () => {
  const gov = require("../../packages/web/lib/governance-db.ts");
  const ids: string[] = [];
  const assessment = {
    schemaVersion: 2,
    quality: { level: "adequate", reason: "Synthetic" },
    value: { level: "adequate", reason: "Synthetic" },
    audience: { level: "adequate", reason: "Synthetic" },
    evidenceConfidence: { level: "adequate", reason: "Synthetic" },
    factsUsed: [],
    inferences: [],
    unknowns: [],
    safetyFlags: [],
    policyVersion: "approved-sample-test",
    evidenceDigest: "synthetic",
    createdAt: new Date().toISOString(),
  };
  for (let n = 0; n < 30; n++) {
    const id = "sample-" + n;
    await pg.query(
      `insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values($1,'a','shopee',$1,'Synthetic sample','https://shopee.com.br/sample',10000)`,
      [id],
    );
    const r = await withAccountDb(
      ctx("a"),
      async (tx: any) => {
        const shadow = await rubric.saveAnalysisAssessment(tx, {
          tenantId: "a",
          productId: id,
          rubricVersion: "approved-sample-test",
          inputDigest: "synthetic",
          result: assessment,
          modelVersion: "synthetic",
          promptVersion: "synthetic",
          mode: "shadow",
        });
        return rubric.recordHumanRubricReview(tx, {
          tenantId: "a",
          productId: id,
          humanAssessment: assessment,
          reviewedByAppUserId: "u_a",
          shadowResult: assessment,
          requestId: "sample-review-" + n,
        });
      },
      factory,
    );
    ids.push(r.comparisonReviewId);
  }
  const method = {
    cohort: "30 distinct synthetic products; fixture only",
    minUnits: 30,
    minAgreementRate: 1,
    rationale: "Explicit isolated approval; no real rubrica homologated",
  };
  await assert.rejects(
    () =>
      gov.ratifyRubric(
        ctx("a"),
        {
          version: "approved-sample-test",
          reviewIds: [...ids.slice(0, 29), ids[0]],
          method,
        },
        factory,
      ),
    /eligible_distinct/,
  );
  await assert.rejects(
    () =>
      gov.ratifyRubric(
        { ...ctx("a"), membershipRole: "operator" },
        { version: "approved-sample-test", reviewIds: ids, method },
        factory,
      ),
    /owner_required/,
  );
  assert.equal(
    (
      await withAccountDb(
        ctx("a"),
        (tx: any) =>
          rubric.getRubricPromotionMetrics(tx, "a", "approved-sample-test"),
        factory,
      )
    ).status,
    "shadow",
  );
  const approved = await gov.ratifyRubric(
    ctx("a"),
    { version: "approved-sample-test", reviewIds: ids, method },
    factory,
  );
  assert.ok(approved.id);
  assert.equal(
    (
      await withAccountDb(
        ctx("a"),
        (tx: any) =>
          rubric.getRubricPromotionMetrics(tx, "a", "approved-sample-test"),
        factory,
      )
    ).status,
    "ratified",
  );
  assert.equal(
    (
      await withAccountDb(
        ctx("a"),
        (tx: any) => rubric.getRubricPromotionMetrics(tx, "a", "rubric-v2"),
        factory,
      )
    ).status,
    "shadow",
  );
  await assert.rejects(
    () =>
      withAccountDb(
        ctx("a"),
        (tx: any) =>
          tx`update garimpa.governance_decision set rationale='tamper' where id=${approved.id}`,
        factory,
      ),
    /permission denied/,
  );
});
await test("calibration requires private report and persisted observations; incomplete or synthetic run cannot enable E3", async () => {
  const price = require("../../packages/web/lib/price-evidence.ts"),
    gov = require("../../packages/web/lib/governance-db.ts");
  await withAccountDb(
    ctx("a"),
    (tx: any) =>
      price.savePriceEvidencePolicyDraft(tx, "a", {
        version: "calibration-test",
        config: { ...price.DEFAULT_PRICE_EVIDENCE_POLICY, e3Enabled: true },
      }),
    factory,
  );
  await assert.rejects(
    () =>
      withAccountDb(
        ctx("a"),
        (tx: any) =>
          price.approvePriceEvidencePolicy(tx, "a", {
            version: "calibration-test",
            approvedBy: "u_a",
            calibrationReportRef: "invented",
          }),
        factory,
      ),
    /approved_calibration_required/,
  );
  const report = await artifacts.savePrivateArtifact(
    ctx("a"),
    {
      kind: "account_evidence",
      name: "synthetic-exp02.txt",
      bytes: new TextEncoder().encode("Synthetic calibration report"),
      mime: "text/plain",
    },
    factory,
    store,
  );
  const observationIds: string[] = [];
  for (let n = 0; n < 10; n++) {
    const id = "calibration-" + n;
    await pg.query(
      `insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,offer_evidence) values($1,'a',$2,10000,now(),$3)`,
      [id, "sample-" + n, JSON.stringify(evidence)],
    );
    observationIds.push(id);
  }
  const run = await gov.recordPriceCalibration(
    ctx("a"),
    {
      version: "calibration-test",
      observationIds,
      sourceRef: report.id,
      synthetic: true,
      results: {
        experiment: "EXP-02",
        reviewed: true,
        cases: observationIds.map((observationId) => ({
          observationId,
          expectedState: "E0",
        })),
      },
    },
    factory,
  );
  assert.ok(run.id);
  await assert.rejects(
    () =>
      withAccountDb(
        ctx("a"),
        (tx: any) =>
          price.approvePriceEvidencePolicy(tx, "a", {
            version: "calibration-test",
            approvedBy: "u_a",
            calibrationReportRef: run.id,
          }),
        factory,
      ),
    /approved_calibration_required/,
  );
});
const camp = await workflow.createCampaignForAccount(
  ctx("a"),
  {
    name: "Integrated fixture",
    objective: "Synthetic verification",
    audience: "Audit audience",
    requestId: "verified-campaign",
  },
  factory,
);
async function kit(key: string) {
  const k = await workflow.createKitForAccount(
    ctx("a"),
    {
      campaignId: camp.campaignId,
      productId: "p_a",
      channel: "telegram_channel",
      reason: "Indicação sintética para verificar a jornada",
      requestId: key,
    },
    factory,
  );
  const v = await workflow.validateKitForAccount(
    ctx("a"),
    {
      kitId: k.kitId,
      expectedVersion: k.kitVersion,
      requestId: key + "-validate",
    },
    factory,
  );
  assert.equal(v.valid, true);
  const approved = await workflow.approveKitForAccount(
    ctx("a"),
    {
      kitId: k.kitId,
      expectedVersion: v.kitVersion,
      requestId: key + "-approve",
    },
    factory,
  );
  return { ...k, kitVersion: approved.kitVersion };
}
await test("immutable Story 1080x1920, private bytes, asset provenance and stale revision conflict", async () => {
  let k = await kit("story");
  const {
    generateKitArtifact,
  } = require("../../packages/web/lib/kit-artifact-db.ts");
  const sharpImage = require("../../packages/web/node_modules/sharp");
  const image = await sharpImage({
    create: { width: 900, height: 520, channels: 3, background: "#d9fff2" },
  })
    .png()
    .toBuffer();
  const asset = await artifacts.savePrivateArtifact(
    ctx("a"),
    {
      kind: "kit_asset",
      name: "owned-synthetic.png",
      bytes: new Uint8Array(image),
      mime: "image/png",
      rights: {
        status: "owned",
        channels: ["telegram_channel"],
        sourceRef: "Own synthetic asset generated only in isolated test",
      },
    },
    factory,
    store,
  );
  const revisedAsset = await workflow.reviseKitForAccount(
    ctx("a"),
    {
      kitId: k.kitId,
      expectedVersion: k.kitVersion,
      copy: "Material próprio sintético para conferir acentos, preço e divulgação.",
      assetId: asset.id,
      requestId: "story-owned-asset",
    },
    factory,
  );
  const validated = await workflow.validateKitForAccount(
    ctx("a"),
    {
      kitId: k.kitId,
      expectedVersion: revisedAsset.kitVersion,
      requestId: "story-asset-validate",
    },
    factory,
  );
  assert.equal(validated.valid, true);
  const approved = await workflow.approveKitForAccount(
    ctx("a"),
    {
      kitId: k.kitId,
      expectedVersion: validated.kitVersion,
      requestId: "story-asset-approve",
    },
    factory,
  );
  k = { ...k, kitVersion: approved.kitVersion };
  const artifact = await generateKitArtifact(
    ctx("a"),
    {
      kitId: k.kitId,
      expectedVersion: k.kitVersion,
      origin: "https://audit.invalid",
    },
    factory,
    store,
  );
  const raw = await artifacts.downloadPrivateArtifact(
    ctx("a"),
    artifact.id,
    factory,
    store,
  );
  const sharp = require("../../packages/web/node_modules/sharp");
  const meta = await sharp(raw.bytes).metadata();
  assert.equal(meta.width, 1080);
  assert.equal(meta.height, 1920);
  await writeFile(
    new URL(
      "../../docs/implementation/evidencias/execucao-19-story.png",
      import.meta.url,
    ),
    raw.bytes,
  );
  await assert.rejects(
    () =>
      generateKitArtifact(
        ctx("b"),
        {
          kitId: k.kitId,
          expectedVersion: k.kitVersion,
          origin: "https://audit.invalid",
        },
        factory,
        store,
      ),
    /not_found/,
  );
  const revised = await workflow.reviseKitForAccount(
    ctx("a"),
    {
      kitId: k.kitId,
      expectedVersion: k.kitVersion,
      copy: "Nova revisão de texto sintético.",
      requestId: "story-revise",
    },
    factory,
  );
  assert.ok(revised);
  await assert.rejects(
    () =>
      generateKitArtifact(
        ctx("a"),
        {
          kitId: k.kitId,
          expectedVersion: k.kitVersion,
          origin: "https://audit.invalid",
        },
        factory,
        store,
      ),
    /conflict/,
  );
});
const runtime = {
  factory,
  origin: "https://audit.invalid",
  validateCredential: async () => true,
};
async function enqueue(key: string, mode = "scheduled") {
  const k = await kit(key),
    [p] = (
      await pg.query(
        `select * from garimpa.campaign_publication where id='${k.publicationId}'`,
      )
    ).rows as any[];
  await pg.query(
    `update garimpa.destination set automation_mode=$1,external_target_ref='synthetic-destination',secret_ref='synthetic-secret' where id=$2`,
    [mode, p.destination_id],
  );
  const job = await withAccountDb(
    ctx("a"),
    (tx: any) =>
      dispatch.scheduleDispatchJob(tx, {
        tenantId: "a",
        campaignPublicationId: p.id,
        kitRevisionId: p.kit_revision_id,
        destinationId: p.destination_id,
        scheduledAt: new Date(Date.now() - 1000).toISOString(),
        idempotencyKey: key,
      }),
    factory,
  );
  return job;
}
await pg.exec(
  `insert into garimpa.dispatch_control(tenant_id,kill_switch,configuration,updated_by) values('a',false,'{"maxPerWindow":10,"windowSeconds":86400,"cooldownSeconds":0,"windowAnchor":"2026-01-01T00:00:00Z"}','u_a')`,
);
await pg.exec(
  `insert into garimpa.affiliate_secret(tenant_id,marketplace,secret_id,key_version,ciphertext,nonce,tag) values('a','telegram_channel','synthetic-secret','test','not-a-real-secret','test','test')`,
);
let calls = 0;
const adapter = {
  channel: "telegram_channel",
  capabilities: { canReconcile: false, supportsCancellation: false },
  validateDestination: async () => ({ valid: true }),
  sendApprovedRevision: async (payload: any) => {
    calls++;
    const observed = await withAccountDb(
      ctx("a"),
      (tx: any) =>
        tx`select io_started_at from garimpa.dispatch_job where idempotency_key=${payload.idempotencyKey}`,
      factory,
    );
    assert.ok(
      observed[0].io_started_at,
      "Marker must be visible in a new transaction before synthetic transport",
    );
    assert.ok(payload.link.startsWith("https://audit.invalid/p/"));
    assert.ok(payload.text.includes("Indicação"));
    return {
      kind: "sent",
      providerMessageId: "synthetic-proof",
      confirmedAt: new Date().toISOString(),
    };
  },
};
await test("durable worker commits marker before synthetic I/O and keeps attribution link", async () => {
  await enqueue("dispatch-positive");
  const r = await worker.executeDispatchCycle(runtime, ctx("a"), adapter, {
    workerToken: "verified-positive",
  });
  assert.equal(r.status, "succeeded");
  assert.equal(calls, 1);
});
await test("assisted mode, revoked credential, persistent switch and cancellation block I/O", async () => {
  await enqueue("dispatch-assisted", "assisted");
  assert.equal(
    (
      await worker.executeDispatchCycle(runtime, ctx("a"), adapter, {
        workerToken: "blocked-mode",
      })
    ).preDispatchBlocked,
    true,
  );
  await enqueue("dispatch-credential");
  assert.equal(
    (
      await worker.executeDispatchCycle(
        { ...runtime, validateCredential: async () => false },
        ctx("a"),
        adapter,
        { workerToken: "blocked-secret" },
      )
    ).preDispatchBlocked,
    true,
  );
  await enqueue("dispatch-switch");
  await pg.exec(
    `update garimpa.dispatch_control set kill_switch=true where tenant_id='a'`,
  );
  assert.equal(
    (
      await worker.executeDispatchCycle(runtime, ctx("a"), adapter, {
        workerToken: "blocked-switch",
      })
    ).preDispatchBlocked,
    true,
  );
  await pg.exec(
    `update garimpa.dispatch_control set kill_switch=false where tenant_id='a'`,
  );
  const cancel = await enqueue("dispatch-cancel");
  let cancelled = false;
  const raceAdapter = {
    ...adapter,
    validateDestination: async () => {
      cancelled = (
        await withAccountDb(
          ctx("a"),
          (tx: any) => dispatch.cancelDispatchJob(tx, "a", cancel.id),
          factory,
        )
      ).cancelled;
      return { valid: true };
    },
  };
  const result = await worker.executeDispatchCycle(
    runtime,
    ctx("a"),
    raceAdapter,
    { workerToken: "cancel-marker" },
  );
  assert.equal(cancelled, true);
  assert.equal(result.preDispatchBlocked, true);
  assert.equal(calls, 1);
});
await test("credential revoked after destination validation blocks the committed marker", async () => {
  await enqueue("dispatch-raced-secret");
  const before = calls;
  const r = await worker.executeDispatchCycle(
    runtime,
    ctx("a"),
    {
      ...adapter,
      validateDestination: async () => {
        await pg.exec(
          `update garimpa.affiliate_secret set status='revoked' where tenant_id='a' and secret_id='synthetic-secret'`,
        );
        return { valid: true };
      },
    },
    { workerToken: "raced-secret" },
  );
  assert.equal(r.preDispatchBlocked, true);
  assert.equal(calls, before);
  const row = (
    await pg.query(
      `select io_started_at from garimpa.dispatch_job where idempotency_key='dispatch-raced-secret'`,
    )
  ).rows[0] as any;
  assert.equal(row.io_started_at, null);
  await pg.exec(
    `update garimpa.affiliate_secret set status='active' where tenant_id='a' and secret_id='synthetic-secret'`,
  );
});
await test("uncertain transport stays unknown, has marker and cannot be blindly retried", async () => {
  const j = await enqueue("dispatch-unknown");
  const result = await worker.executeDispatchCycle(
    runtime,
    ctx("a"),
    {
      ...adapter,
      sendApprovedRevision: async () => {
        throw new Error("synthetic lost response");
      },
    },
    { workerToken: "unknown-worker" },
  );
  assert.equal(result.status, "unknown");
  const row = (
    await pg.query(
      `select status,io_started_at from garimpa.dispatch_job where id='${j.id}'`,
    )
  ).rows[0] as any;
  assert.equal(row.status, "unknown");
  assert.ok(row.io_started_at);
  assert.equal(
    (
      await worker.executeDispatchCycle(runtime, ctx("a"), adapter, {
        workerToken: "no-retry",
      })
    ).jobProcessed,
    false,
  );
});

await test("orphan reconciliation verifies the private object and export retains business evidence without credentials", async () => {
  const saved = await artifacts.savePrivateArtifact(
    ctx("a"),
    {
      kind: "account_evidence",
      name: "orphan.txt",
      bytes: new TextEncoder().encode("verified-private-evidence"),
      mime: "text/plain",
    },
    factory,
    store,
  );
  await pg.query(
    `update garimpa.private_artifact set status='orphaned' where id=$1`,
    [saved.id],
  );
  await assert.rejects(
    () => artifacts.downloadPrivateArtifact(ctx("a"), saved.id, factory, store),
    /artifact_not_found/,
  );
  await assert.rejects(
    () =>
      artifacts.reconcilePrivateArtifact(ctx("b"), saved.id, factory, store),
    /artifact_not_found/,
  );
  await artifacts.reconcilePrivateArtifact(ctx("a"), saved.id, factory, store);
  assert.equal(
    (
      await artifacts.downloadPrivateArtifact(
        ctx("a"),
        saved.id,
        factory,
        store,
      )
    ).bytes.length,
    25,
  );
  const exported = await onboarding.exportAccountData(ctx("a"), factory);
  assert.ok(exported.records.artifacts.some((a: any) => a.id === saved.id));
  assert.ok(exported.records.import_batch.length > 0);
  assert.ok(!("affiliate_secret" in exported.records));
  assert.ok(!("account_invitation" in exported.records));
  assert.ok(
    exported.records.artifacts.every((a: any) => !("object_path" in a)),
  );
});
await pg.close();
await writeFile(
  new URL(
    "../../docs/implementation/evidencias/execucao-19-verified-workflows.json",
    import.meta.url,
  ),
  JSON.stringify(
    {
      environment:
        "isolated PGlite; synthetic object store/transport; not staging",
      results: scenarioResults,
    },
    null,
    2,
  ) + "\n",
);
console.log("Verified workflow scenarios: " + scenarioResults.length);
