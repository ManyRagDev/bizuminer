import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { commercialFixture } from "./commercial-fixture.ts";

const require = createRequire(import.meta.url);
const ts = require(
  require.resolve("typescript", {
    paths: [
      fileURLToPath(new URL("../../packages/web", import.meta.url)),
      fileURLToPath(new URL("../..", import.meta.url)),
    ],
  })
);
const {
  ATTRIBUTE_POLICY_VERSION,
  claimAttributeJobs,
  attachAttributePromptContext,
  finishAttributeJob,
} = require("../../packages/web/lib/curation-attributes-db.ts");
const { ATTRIBUTE_PROMPT_VERSION } = require("../../packages/web/lib/ai-curation-v2-service.ts");
const { runCurationProjectionJob } = require("../../packages/web/lib/curation-scheduler.ts");
const {
  DEFAULT_SELECTION_POLICY_V2,
  composeCurationSelection,
} = require("../../packages/web/lib/curation-selection-v2.ts");
const {
  configureRecommendationChannel,
  readRecommendationEdition,
  refreshRecommendationEditions,
} = require("../../packages/web/lib/recommendation-db.ts");
const { defaultChannelPolicy } = require("../../packages/web/lib/recommendation-policy.ts");
const { inAccountScope } = require("../../packages/web/lib/account-scope.ts");
const {
  authenticateDevice,
  persistExtensionCapture,
} = require("../../packages/web/lib/extension-db.ts");
const { validateExtensionCapturePayload } = require("../../packages/web/lib/extension-contract.ts");
const {
  readRecapturePlan,
  claimRecaptureTask,
  reportRecaptureObservation,
  setRecaptureSessionStatus,
} = require("../../packages/web/lib/recapture-db.ts");
const { refreshRecapturePlan } = require("../../packages/web/lib/recapture-planner.ts");
const { validateRecaptureObservation } = require("../../packages/web/lib/recapture-contract.ts");
const extensionCors = require("../../packages/web/lib/extension-cors.ts");
const extensionRequest = require("../../packages/web/lib/extension-request.ts");
const extensionToken = require("../../packages/web/lib/extension-token.ts");
const webFlags = require("../../packages/web/lib/flags.ts");
const {
  configurePautaSlots,
  readPautaSlots,
  refreshPautaSlots,
} = require("../../packages/web/lib/pauta-slots-db.ts");
const {
  readLivePauta,
  preparePautaCopy,
  confirmPautaExposure,
} = require("../../packages/web/lib/pauta-db.ts");
const {
  publicDealDetail,
  publicOfferHistory,
} = require("../../packages/web/lib/public-offer-db.ts");
const { publicGo } = require("../../packages/web/lib/public-go.ts");
const { readCurationExceptions } = require("../../packages/web/lib/curation-exceptions-db.ts");
const { readEquivalenceDesk } = require("../../packages/web/lib/curation-equivalence-db.ts");
const { readCurationOperationsMetrics } = require("../../packages/web/lib/curation-operations-metrics.ts");
const { hashToken } = require("../../packages/web/lib/extension-token.ts");
const { readCurationCompetition, composeCurationCompetition } = require("../../packages/web/lib/curation-promotion-planner.ts");
const { withTenantDb } = require("../../packages/web/lib/tenant-db.ts");
const { setFavorite, savedDeals, watchedDeals, recommendedDeals } = require("../../packages/web/lib/member-db.ts");
const { catalogPage, dealDetail } = require("../../packages/web/lib/db.ts");

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

process.env.EXTENSION_CAPTURE_ENABLED = "true";
process.env.EXTENSION_CAPTURE_MODE = "durable";
process.env.RECAPTURE_PROTOCOL_ENABLED = "true";
process.env.EXTENSION_ALLOWED_ORIGINS = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
process.env.RECAPTURE_PLANNER_ENABLED = "true";
process.env.RECAPTURE_SCOPE = "a/mercadolivre,a/amazon,a/aliexpress";
process.env.AMAZON_BROWSER_CAPTURE_ENABLED = "true";
process.env.ALIEXPRESS_BROWSER_CAPTURE_ENABLED = "true";
process.env.RECAPTURE_LISTING_DAILY_LIMIT = "4";
process.env.RECAPTURE_PDP_DAILY_LIMIT = "4";

const fx = await commercialFixture();
const migrationsDir = new URL("../../packages/persistence/supabase/migrations/", import.meta.url);
const migrationFiles = (await readdir(migrationsDir))
  .filter((f) => /^\d{14}_/.test(f) && f > "20261015040727" && f.endsWith(".sql"))
  .sort();

const rows = async <T = any>(q: string, values: unknown[] = []): Promise<T[]> =>
  (await fx.pg.query(q, values)).rows as T[];

const accountCtx = (tenantId: string) => ({
  tenantId,
  affiliateId: `aff_${tenantId}`,
  actor: "human" as const,
  actorAppUserId: `u_${tenantId}`,
  authenticatedAuthUserId: `auth_${tenantId}`,
  membershipRole: "owner" as const,
  requestId: `journey-${tenantId}`,
});

try {
  for (const file of migrationFiles) {
    await fx.pg.exec(await readFile(new URL(file, migrationsDir), "utf8"));
  }

  const rawTokenA = "bm_ext_tok-a-secret";
  const hashA = hashToken(rawTokenA);
  const rawTokenRevoked = "bm_ext_tok-revoked-secret";
  const hashRevoked = hashToken(rawTokenRevoked);

  await fx.pg.exec(`
    insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name)
    values ('aff_a','a','vitrine-a','Conta A'),('aff_b','b','vitrine-b','Conta B');
    insert into garimpa.app_user(id,tenant_id,auth_user_id)
    values ('u_a','a','auth_a'),('u_b','b','auth_b');
    insert into garimpa.app_user_role(app_user_id,role)
    values ('u_a','afiliado'),('u_b','afiliado');
    insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role)
    values ('aff_a','u_a','owner'),('aff_b','u_b','owner');
    insert into garimpa.affiliate_marketplace_config(affiliate_id,marketplace,tracking_id,tool_id,status)
    values ('aff_a','mercadolivre','ml-track-a','ml-tool-a','active'),
           ('aff_a','amazon','amztag-20','amztag-20','active'),
           ('aff_b','mercadolivre','ml-track-b','ml-tool-b','active');
    insert into garimpa.extension_device(id,affiliate_id,created_by_app_user_id,name,token_hash)
    values ('dev_a','aff_a','u_a','Device A','${hashA}'),
           ('dev_revoked','aff_a','u_a','Device Rev','${hashRevoked}');
    update garimpa.extension_device set revoked_at=now() where id='dev_revoked';
    insert into garimpa.editorial_guideline(tenant_id,auto_publish)
    values ('a',true),('b',true)
    on conflict(tenant_id) do update set auto_publish=excluded.auto_publish;
    insert into garimpa.curation_policy_v2(tenant_id,version,enabled,config)
    values ('a',1,true,'{"autoEligibility":true,"capacity":12,"domEntryHours":12,"domStayHours":24,"shopeeHours":1,"categoryShare":0.5,"marketplaceShare":0.7,"challengerMargin":0.1,"dropFraction":0.2,"pendingLimit":24}'::jsonb)
    on conflict(tenant_id) do update set enabled=true,config=excluded.config;
  `);

  const ctxA = accountCtx("a");
  const ctxB = accountCtx("b");
  const sql = identifiers(fx.factory());
  const model = "google:gemini-2.5-flash";
  const devA = {
    deviceId: "dev_a",
    tenantId: "a",
    affiliateId: "aff_a",
    appUserId: "u_a",
    affiliatePublicSlug: "vitrine-a",
  };

  // Configure channels for Account A (home + whatsapp)
  await inAccountScope(ctxA, async () => {
    assert.deepEqual(
      await configureRecommendationChannel(
        {
          expectedTenantId: "a",
          channel: "home",
          expectedVersion: null,
          enabled: true,
          policy: defaultChannelPolicy("home"),
          manualOrder: null,
          validUntil: null,
        },
        fx.factory
      ),
      { ok: true }
    );
    assert.deepEqual(
      await configureRecommendationChannel(
        {
          expectedTenantId: "a",
          channel: "whatsapp",
          expectedVersion: null,
          enabled: true,
          policy: defaultChannelPolicy("whatsapp"),
          manualOrder: null,
          validUntil: null,
        },
        fx.factory
      ),
      { ok: true }
    );
    const slotCfg = await configurePautaSlots(
      ctxA,
      "whatsapp",
      {
        version: null,
        enabled: true,
        timezone: "America/Sao_Paulo",
        hours: [
          new Date(Date.now() + 10 * 60_000)
            .toLocaleTimeString("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }),
        ],
        itemsPerSlot: 2,
        repeatHours: 240,
        impulseLimitCents: 30000,
        allowPriceImprovement: false,
        improvementPercent: 5,
        domWindowHours: 12,
      },
      fx.factory
    );
    assert.equal(slotCfg, "ok");
  });

  // Check T05 device revocation fail-closed
  const revAuth = await authenticateDevice(hashRevoked, fx.factory);
  assert.equal(revAuth.kind, "revoked", "revoked extension device must return revoked");

  // =========================================================================
  // 1) Pure T03 Selection Hysteresis & Diversity Unit Verification
  // =========================================================================
  const tNow = new Date();
  const baseCand = (id: string, score: number, cat = "Casa", mp = "mercadolivre" as const) => ({
    id,
    marketplace: mp,
    category: cat,
    familyKey: `fam:${id}`,
    equivalenceKey: null,
    optionKey: "listing",
    priceType: "exact" as const,
    currency: "BRL",
    priceCents: 10000,
    observationId: `obs-${id}`,
    revision: "rev-1",
    verifiedAt: new Date(tNow.getTime() - 3600_000).toISOString(),
    verificationMethod: "product_page" as const,
    available: "available" as const,
    affiliateReady: true,
    blocked: false,
    assessmentCurrent: true,
    score,
    potentialScore: score,
    scoreVersion: "v2",
    normalizationRevision: "norm-1",
  });
  const sel1 = composeCurationSelection(
    [baseCand("p1", 70, "Casa", "mercadolivre"), baseCand("p2", 75, "Tecnologia", "amazon")], // +7.1% < 10%
    [{ id: "p1", entryScore: 70, scoreVersion: "v2", normalizationRevision: "norm-1" }],
    tNow,
    { ...DEFAULT_SELECTION_POLICY_V2, capacity: 1, categoryShare: 1, marketplaceShare: 1 }
  );
  assert.deepEqual(sel1.selected.map((c: any) => c.id), ["p1"], "<10% challenger does not evict incumbent");

  const sel2 = composeCurationSelection(
    [baseCand("p1", 70, "Casa", "mercadolivre"), baseCand("p2", 80, "Tecnologia", "amazon")], // +14.3% > 10%
    [{ id: "p1", entryScore: 70, scoreVersion: "v2", normalizationRevision: "norm-1" }],
    tNow,
    { ...DEFAULT_SELECTION_POLICY_V2, capacity: 1, categoryShare: 1, marketplaceShare: 1 }
  );
  assert.deepEqual(sel2.selected.map((c: any) => c.id), ["p2"], ">10% challenger replaces incumbent");
  assert.equal(sel2.exits[0].reason, "better_challenger");

  const selDrop = composeCurationSelection(
    [baseCand("p1", 50, "Casa", "mercadolivre")], // 50 < 70*(1-0.2)=56 -> merit_drop!
    [{ id: "p1", entryScore: 70, scoreVersion: "v2", normalizationRevision: "norm-1" }],
    tNow,
    { ...DEFAULT_SELECTION_POLICY_V2, capacity: 1, categoryShare: 1, marketplaceShare: 1 }
  );
  assert.equal(selDrop.selected.length, 0, "dropped incumbent does not immediately refill its own vacancy");
  assert.equal(selDrop.exits[0].reason, "merit_drop");
  console.log("PASS T03 unit: hysteresis (+10% challenger / -20% drop) & merit-drop non-refill");

  // =========================================================================
  // 2) Full Integrated Journey: Stale Capture -> Promotion Check -> Recapture ->
  //    Public Exposure + Pauta Slot Forecast -> Prepare -> Manual Confirm
  // =========================================================================
  // Capture 3 candidates at stale time (14h ago: > 12h domEntryHours, < 48h freshness window):
  // - pMain ("Cafeteira Expresso Inox"): promoted via stale entry check -> recaptured via PDP/listing!
  // - pEquiv ("Cafeteira Inox Kit"): later linked to pMain in equivalence group
  // - pVeto ("Produto Vetoado Teste"): vetoed via equivalence/human reject
  const staleAt = new Date(Date.now() - 14 * 3600_000).toISOString();
  const mainCap = await persistExtensionCapture(
    devA,
    validateExtensionCapturePayload({
      version: 1,
      marketplace: "mercadolivre",
      requestId: randomUUID(),
      clientCapturedAt: staleAt,
      page: { kind: "offers", url: "https://www.mercadolivre.com.br/ofertas" },
      product: {
        externalId: "MLB700000001",
        title: "Cafeteira Expresso InoxCompacta",
        productUrl: "https://produto.mercadolivre.com.br/MLB-700000001-cafeteira",
        category: "Casa",
        priceCents: 19900,
        originalPriceCents: 29900,
        currency: "BRL",
        priceType: "exact",
        ratingStar: 4.8,
        reviewCount: 40,
      },
    }),
    fx.factory
  );
  const equivCap = await persistExtensionCapture(
    devA,
    validateExtensionCapturePayload({
      version: 1,
      marketplace: "amazon",
      requestId: randomUUID(),
      clientCapturedAt: new Date(Date.now() - 2 * 3600_000).toISOString(), // fresh AMZ offer
      page: { kind: "product", url: "https://www.amazon.com.br/dp/B0TESTEQU1" },
      product: {
        externalId: "B0TESTEQU1",
        title: "Cafeteira Expresso Inox Versao Amazon",
        productUrl: "https://www.amazon.com.br/dp/B0TESTEQU1",
        category: "Casa",
        priceCents: 18900,
        originalPriceCents: 28900,
        currency: "BRL",
        priceType: "exact",
        ratingStar: 4.7,
        reviewCount: 30,
      },
    }),
    fx.factory
  );

  // Also seed an approved watch product on ML with verification >24h ago so watch needs recapture check
  const watchStaleAt = new Date(Date.now() - 26 * 3600_000).toISOString();
  const watchCap = await persistExtensionCapture(
    devA,
    validateExtensionCapturePayload({
      version: 1,
      marketplace: "mercadolivre",
      requestId: randomUUID(),
      clientCapturedAt: watchStaleAt,
      page: { kind: "offers", url: "https://www.mercadolivre.com.br/ofertas" },
      product: {
        externalId: "MLB700000002",
        title: "Chaleira Eletrica Aco Escovado",
        productUrl: "https://produto.mercadolivre.com.br/MLB-700000002-chaleira",
        category: "Casa",
        priceCents: 8900,
        currency: "BRL",
        priceType: "exact",
      },
    }),
    fx.factory
  );
  await fx.pg.exec(`insert into garimpa.buyer_profile(tenant_id,user_id) values ('a','u_a') on conflict do nothing`);
  await fx.pg.query(
    `insert into garimpa.price_watch(id,tenant_id,product_id,user_id,option_key,baseline_price_cents,target_price_cents,active)
     values ($1,'a',$2,'u_a','listing',10000,9500,true)`,
    [randomUUID(), watchCap.productId]
  );

  // Run scheduler cycle 1: enqueues AI attribute jobs
  await runCurationProjectionJob(sql, "a", model, fx.factory);

  // Complete AI attribute assessments (simulated LLM responses) for all 3 products
  const aiJobs = await claimAttributeJobs(sql, "a", 20, 50, model);
  assert.equal(aiJobs.length, 3);
  await attachAttributePromptContext(sql, "a", aiJobs, []);
  for (const job of aiJobs) {
    assert.equal(
      await finishAttributeJob(sql, "a", job, {
        productId: job.snapshot.input.productId,
        qualidade: 85,
        genuinidade_oferta: 82,
        apelo_whatsapp: 80,
        categoria: "Casa",
        flags: [],
        confianca: 0.9,
        justificativa: "Produto doméstico com bom histórico.",
        fatos_usados: ["titulo", "preco_brl"],
        duvidas: [],
      }),
      "completed"
    );
  }

  // Run scheduler cycle 2: advances eligibility -> approved, computes score v2,
  // queues curation_promotion check for stale pMain, creates recapture tasks, refreshes editions
  await runCurationProjectionJob(sql, "a", model, fx.factory);
  await refreshPautaSlots(sql, "a");

  // pMain should NOT enter home edition while stale (>12h entry window), wait pEquiv IS fresh (<2h) -> in home!
  const edBeforeRecapture = await readRecommendationEdition("home", "a", fx.factory);
  assert.ok(edBeforeRecapture.products.some((p: any) => p.id === equivCap.productId), "fresh Amazon offer enters home vitrine");
  assert.ok(!edBeforeRecapture.products.some((p: any) => p.id === mainCap.productId), "stale ML offer awaits recapture before entering home vitrine");

  // Check promotion request queued for pMain AND recapture plan generated!
  const promos = await rows<{ product_id: string; reason: string; status: string }>(
    `select product_id,reason,status from garimpa.curation_promotion where tenant_id='a' and product_id=$1`,
    [mainCap.productId]
  );
  assert.ok(promos.some((p) => p.status === "pending"), "promotion check requested for stale finalist");

  const plan = await readRecapturePlan(devA, randomUUID(), fx.factory);
  assert.ok(plan.tasks.length >= 1, "recapture plan exposes listing task for watched & promoted ML items");
  const mlTask = plan.tasks.find((t: any) => t.marketplace === "mercadolivre" && t.kind === "listing")!;
  assert.ok(mlTask, "found ML listing recapture task");
  const hasWatchTarget = mlTask.targets.some((t: any) => t.productId === watchCap.productId);
  const hasMainTarget = mlTask.targets.some((t: any) => t.productId === mainCap.productId);
  assert.ok(hasWatchTarget && hasMainTarget, "listing task bundles watch + promotion candidates on shared offers page");

  // Exercise pause -> resume -> claim -> duplicate claim -> concurrent busy conflict -> residual configuration_mismatch -> valid report!
  const sessionId = randomUUID();
  await setRecaptureSessionStatus(devA, sessionId, "pause", fx.factory, 1);
  await setRecaptureSessionStatus(devA, sessionId, "resume", fx.factory, 2);

  const claimReqId = randomUUID();
  const claimToken = "a".repeat(64);
  const claim1 = await claimRecaptureTask(
    devA,
    { requestId: claimReqId, sessionId, taskId: mlTask.id, revision: mlTask.revision, claimToken, supportsClaimTargets: true },
    fx.factory
  );
  assert.equal(claim1.duplicate, false);

  // Replay claim with same requestId -> idempotent duplicate:true, consumes quota only ONCE
  const claimDup = await claimRecaptureTask(
    devA,
    { requestId: claimReqId, sessionId, taskId: mlTask.id, revision: mlTask.revision, claimToken, supportsClaimTargets: true },
    fx.factory
  );
  assert.equal(claimDup.duplicate, true);
  const [budgetAfterClaim] = await rows<{ consumed: number }>(
    `select consumed from garimpa.curation_external_budget where tenant_id='a' and kind='listing' and marketplace='all'`
  );
  assert.equal(budgetAfterClaim!.consumed, 1, "idempotent claim replay must not double-consume recapture quota");

  // Concurrency guard: another request claiming already-claimed task fails!
  await assert.rejects(
    () =>
      claimRecaptureTask(
        devA,
        { requestId: randomUUID(), sessionId, taskId: mlTask.id, revision: mlTask.revision, claimToken: "b".repeat(64), supportsClaimTargets: true },
        fx.factory
      ),
    /recapture_plan_changed|recapture_target_busy/
  );

  // Load the REAL Next.js route (/api/extension/observations) + HTTP auth/error helper
  // against isolated PGlite factory so this journey verifies HTTP status, origin/token auth,
  // idempotency header, contract validation (validateRecaptureObservation), and persistence together.
  const transpileModule = async (relPath: string, mocks: Record<string, unknown>) => {
    const source = await readFile(new URL(relPath, import.meta.url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    });
    const mod = { exports: {} as Record<string, any> };
    const localReq = (spec: string) => (spec in mocks ? mocks[spec] : require(spec));
    new Function("exports", "require", "module", outputText)(mod.exports, localReq, mod);
    return mod.exports;
  };
  const recaptureHttpRoute = await transpileModule("../../packages/web/lib/recapture-http.ts", {
    "./extension-db.ts": {
      authenticateDevice: (hash: string) => authenticateDevice(hash, fx.factory),
    },
    "./extension-cors.ts": extensionCors,
    "./extension-token.ts": extensionToken,
    "./flags.ts": webFlags,
  });
  const observationsRoute = await transpileModule("../../packages/web/app/api/extension/observations/route.ts", {
    "../../../../lib/extension-cors.ts": extensionCors,
    "../../../../lib/extension-request.ts": extensionRequest,
    "../../../../lib/recapture-http.ts": recaptureHttpRoute,
    "../../../../lib/recapture-db.ts": {
      reportRecaptureObservation: (dev: any, payload: any) => reportRecaptureObservation(dev, payload, fx.factory),
    },
    "../../../../lib/recapture-contract.ts": { validateRecaptureObservation },
  });
  const allowedOrigin = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const postObservationHttp = async (
    rawBody: unknown,
    opts?: { token?: string | null; origin?: string | null; idempotencyKey?: string | null }
  ) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (opts?.origin !== null) headers.origin = opts?.origin ?? allowedOrigin;
    if (opts?.token !== null) headers.authorization = `Bearer ${opts?.token ?? rawTokenA}`;
    if (opts?.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
    const req = new Request("https://garimpa.test/api/extension/observations", {
      method: "POST",
      headers,
      body: JSON.stringify(rawBody),
    });
    const res = await observationsRoute.POST(req);
    return { status: res.status, body: (await res.json()) as any };
  };

  // HTTP auth/origin rejections + contract envelope rejections via REAL route & validateRecaptureObservation
  const rejOrigin = await postObservationHttp({}, { origin: "https://evil.example" });
  assert.equal(rejOrigin.status, 403);
  assert.equal(rejOrigin.body.error, "extension_origin_forbidden" in rejOrigin.body ? "extension_origin_forbidden" : "origin_not_allowed");
  const rejUnauth = await postObservationHttp({}, { token: null });
  assert.equal(rejUnauth.status, 401);
  assert.equal(rejUnauth.body.error, "unauthorized");
  const rejRevoked = await postObservationHttp({}, { token: rawTokenRevoked });
  assert.equal(rejRevoked.status, 403);
  assert.equal(rejRevoked.body.error, "device_revoked");

  const validListingPayload = {
    version: 2,
    requestId: randomUUID(),
    sessionId,
    taskId: mlTask.id,
    claimToken,
    marketplace: "mercadolivre",
    observedAt: new Date().toISOString(),
    page: { kind: "listing", url: mlTask.url },
    products: [
      {
        externalId: "MLB700000001",
        title: "Cafeteira Expresso InoxCompacta",
        productUrl: "https://produto.mercadolivre.com.br/MLB-700000001-cafeteira",
        category: "Casa",
        priceCents: 19500,
        originalPriceCents: 29900,
        currency: "BRL",
        priceType: "exact",
      },
    ],
    results: [
      { productId: mainCap.productId, optionKey: "listing", externalId: "MLB700000001", status: "observed" },
      { productId: watchCap.productId, optionKey: "listing", externalId: "MLB700000002", status: "not_found_on_listing" },
    ],
  };

  const invalidEnvelopes: Array<[string, unknown]> = [
    ["missing version:2", { ...validListingPayload, version: 1 }],
    [
      "listing with no_price",
      {
        ...validListingPayload,
        results: [
          { productId: mainCap.productId, optionKey: "listing", externalId: "MLB700000001", status: "observed" },
          { productId: watchCap.productId, optionKey: "listing", externalId: "MLB700000002", status: "no_price" },
        ],
      },
    ],
    [
      "listing with unavailable_confirmed",
      {
        ...validListingPayload,
        results: [
          { productId: watchCap.productId, optionKey: "listing", externalId: "MLB700000002", status: "unavailable_confirmed", evidence: "explicit_product_unavailable" },
        ],
      },
    ],
    [
      "listing not_found_on_listing while externalId still present in products",
      {
        ...validListingPayload,
        results: [
          { productId: mainCap.productId, optionKey: "listing", externalId: "MLB700000001", status: "not_found_on_listing" },
        ],
      },
    ],
    [
      "pdp no_price with non-empty products",
      {
        ...validListingPayload,
        page: { kind: "product", url: "https://produto.mercadolivre.com.br/MLB-700000002-chaleira" },
        results: [
          { productId: watchCap.productId, optionKey: "listing", externalId: "MLB700000002", status: "no_price" },
        ],
      },
    ],
    [
      "pdp unavailable_confirmed without explicit_product_unavailable",
      {
        ...validListingPayload,
        page: { kind: "product", url: "https://produto.mercadolivre.com.br/MLB-700000002-chaleira" },
        products: [],
        results: [
          { productId: watchCap.productId, optionKey: "listing", externalId: "MLB700000002", status: "unavailable_confirmed" },
        ],
      },
    ],
  ];
  for (const [label, invalid] of invalidEnvelopes) {
    assert.throws(() => validateRecaptureObservation(invalid), /recapture_observation_invalid/, `contract rejects ${label}`);
    const res = await postObservationHttp(invalid);
    assert.equal(res.status, 400, `HTTP route returns 400 for ${label}`);
    assert.equal(res.body.error, "recapture_observation_invalid");
  }

  const headerMismatch = await postObservationHttp(validListingPayload, { idempotencyKey: randomUUID() });
  assert.equal(headerMismatch.status, 400);
  assert.equal(headerMismatch.body.error, "idempotency_key_mismatch");

  // Valid Listing Recapture via HTTP POST: pMain observed (R$195), watchCap not_found_on_listing (preserves R$89)
  const normalizedListing = validateRecaptureObservation(validListingPayload);
  assert.equal(normalizedListing.version, 2);
  const readWatchState = async () => {
    const [row] = await rows<{ price_cents: number; verified_at: string; availability: string }>(
      `select o.price_cents,v.verified_at::text as verified_at,v.availability
         from garimpa.offer_verification v
         join garimpa.price_observation o on o.id=v.observation_id
         where v.tenant_id='a' and v.product_id=$1`,
      [watchCap.productId]
    );
    return row;
  };
  const watchVerifBefore = await readWatchState();

  const repHttp = await postObservationHttp(validListingPayload, { idempotencyKey: validListingPayload.requestId });
  assert.equal(repHttp.status, 200);
  const rep = repHttp.body;
  assert.equal(rep.ok, true);
  assert.equal(rep.observed, 1);
  assert.equal(rep.residual, 1);
  assert.ok(rep.confirmed >= 1, "recapture confirms pMain promotion (and slot check)");
  assert.equal(rep.results.find((r: any) => r.productId === watchCap.productId)?.reason, "not_found_on_listing");

  const watchAfterListing = await readWatchState();
  assert.equal(watchAfterListing?.price_cents, 8900, "not_found_on_listing preserves existing watch price R$89");
  assert.equal(watchAfterListing?.verified_at, watchVerifBefore?.verified_at, "not_found_on_listing does not renew verification clock");
  assert.equal(watchAfterListing?.availability, watchVerifBefore?.availability, "not_found_on_listing preserves existing availability");
  assert.notEqual(watchAfterListing?.availability, "unavailable", "not_found_on_listing does not mark item unavailable");

  // HTTP replay idempotency + idempotency conflict (different payload on same requestId)
  const [obsCountBeforeReplay] = await rows<{ cnt: string }>(
    `select count(*)::text as cnt from garimpa.price_observation where tenant_id='a' and product_id=$1`,
    [mainCap.productId]
  );
  const repDupHttp = await postObservationHttp(validListingPayload, { idempotencyKey: validListingPayload.requestId });
  assert.equal(repDupHttp.status, 200);
  assert.equal(repDupHttp.body.duplicate, true);
  const [obsCountAfterReplay] = await rows<{ cnt: string }>(
    `select count(*)::text as cnt from garimpa.price_observation where tenant_id='a' and product_id=$1`,
    [mainCap.productId]
  );
  assert.equal(obsCountAfterReplay?.cnt, obsCountBeforeReplay?.cnt, "HTTP replay does not duplicate price_observation");

  const conflictHttp = await postObservationHttp(
    {
      ...validListingPayload,
      products: [{ ...validListingPayload.products[0]!, priceCents: 19600 }],
    },
    { idempotencyKey: validListingPayload.requestId }
  );
  assert.equal(conflictHttp.status, 409);
  assert.equal(conflictHttp.body.error, "recapture_report_conflict");

  // Distinguish residual PDP states & subsequent valid PDP observation on watchCap:
  // 1) no_price on PDP, 2) configuration_mismatch on PDP, 3) observed on PDP (R$85)
  const claimAndPostPdp = async (
    stepLabel: string,
    payloadBuilder: (task: any, pdpClaimToken: string) => Record<string, unknown>
  ) => {
    await refreshRecapturePlan(sql, "a");
    const planNext = await readRecapturePlan(devA, randomUUID(), fx.factory);
    const pdpTask = planNext.tasks.find(
      (t: any) => t.kind === "pdp" && t.targets.some((tg: any) => tg.productId === watchCap.productId)
    );
    assert.ok(pdpTask, `planner emits follow-up PDP task for watchCap (${stepLabel})`);
    const pdpClaimToken = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
    await claimRecaptureTask(
      devA,
      { requestId: randomUUID(), sessionId, taskId: pdpTask.id, revision: pdpTask.revision, claimToken: pdpClaimToken, supportsClaimTargets: true },
      fx.factory
    );
    const pdpBody = payloadBuilder(pdpTask, pdpClaimToken);
    validateRecaptureObservation(pdpBody);
    const res = await postObservationHttp(pdpBody, { idempotencyKey: String(pdpBody.requestId) });
    assert.equal(res.status, 200, `${stepLabel} succeeds via POST /api/extension/observations`);
    return { taskId: pdpTask.id, body: res.body };
  };

  // PDP step 1: advance listing cooldown (1h in DB planner) so planner emits PDP task; no_price preserves R$89 & verified_at
  await fx.pg.query(`update garimpa.recapture_task set updated_at=updated_at-interval '65 minutes' where id=$1`, [mlTask.id]);
  const noPriceStep = await claimAndPostPdp("no_price", (task, pdpClaimToken) => ({
    version: 2,
    requestId: randomUUID(),
    sessionId,
    taskId: task.id,
    claimToken: pdpClaimToken,
    marketplace: "mercadolivre",
    observedAt: new Date().toISOString(),
    page: { kind: "product", url: task.url },
    products: [],
    results: [{ productId: watchCap.productId, optionKey: "listing", externalId: "MLB700000002", status: "no_price" }],
  }));
  assert.equal(noPriceStep.body.residual, 1);
  assert.equal(noPriceStep.body.results[0]?.reason, "no_price");
  const watchAfterNoPrice = await readWatchState();
  assert.equal(watchAfterNoPrice?.price_cents, 8900);
  assert.equal(watchAfterNoPrice?.verified_at, watchVerifBefore?.verified_at);
  assert.equal(watchAfterNoPrice?.availability, watchVerifBefore?.availability);
  assert.notEqual(watchAfterNoPrice?.availability, "unavailable");

  // Advance retry cooldown (1h in DB planner) in PGlite and test PDP step 2: configuration_mismatch
  await fx.pg.query(`update garimpa.recapture_task set updated_at=updated_at-interval '65 minutes' where id=$1`, [noPriceStep.taskId]);
  const mismatchStep = await claimAndPostPdp("configuration_mismatch", (task, pdpClaimToken) => ({
    version: 2,
    requestId: randomUUID(),
    sessionId,
    taskId: task.id,
    claimToken: pdpClaimToken,
    marketplace: "mercadolivre",
    observedAt: new Date().toISOString(),
    page: { kind: "product", url: task.url },
    products: [],
    results: [{ productId: watchCap.productId, optionKey: "listing", externalId: "MLB700000002", status: "configuration_mismatch" }],
  }));
  assert.equal(mismatchStep.body.residual, 1);
  assert.equal(mismatchStep.body.results[0]?.reason, "configuration_mismatch");
  const watchAfterMismatch = await readWatchState();
  assert.equal(watchAfterMismatch?.price_cents, 8900);
  assert.equal(watchAfterMismatch?.verified_at, watchVerifBefore?.verified_at);
  assert.equal(watchAfterMismatch?.availability, watchVerifBefore?.availability);
  assert.notEqual(watchAfterMismatch?.availability, "unavailable");

  // Advance retry cooldown and test PDP step 3: valid observation updates watch price to R$85 and renews verified_at
  await fx.pg.query(`update garimpa.recapture_task set updated_at=updated_at-interval '65 minutes' where id=$1`, [mismatchStep.taskId]);
  const observedStep = await claimAndPostPdp("observed", (task, pdpClaimToken) => ({
    version: 2,
    requestId: randomUUID(),
    sessionId,
    taskId: task.id,
    claimToken: pdpClaimToken,
    marketplace: "mercadolivre",
    observedAt: new Date().toISOString(),
    page: { kind: "product", url: task.url },
    products: [
      {
        externalId: "MLB700000002",
        title: "Chaleira Eletrica Aco Escovado",
        productUrl: task.url,
        category: "Casa",
        priceCents: 8500,
        currency: "BRL",
        priceType: "exact",
      },
    ],
    results: [{ productId: watchCap.productId, optionKey: "listing", externalId: "MLB700000002", status: "observed" }],
  }));
  assert.equal(observedStep.body.observed, 1);
  const watchAfterObserved = await readWatchState();
  assert.equal(watchAfterObserved?.price_cents, 8500, "valid PDP observation updates offer price");
  assert.notEqual(watchAfterObserved?.verified_at, watchVerifBefore?.verified_at, "valid PDP observation advances verified_at");
  assert.notEqual(watchAfterObserved?.availability, "unavailable");

  // Re-run scheduler cycle 3: now pMain is freshly verified and enters homepage & pauta slot!
  await runCurationProjectionJob(sql, "a", model, fx.factory);
  await refreshPautaSlots(sql, "a");

  const edAfterRecapture = await readRecommendationEdition("home", "a", fx.factory);
  assert.ok(edAfterRecapture.products.some((p: any) => p.id === mainCap.productId), "recaptured pMain now appears on homepage");

  // Verify T06 Slots forecast + preparePautaCopy + confirmPautaExposure
  const slotsState = await inAccountScope(ctxA, () => readPautaSlots(ctxA, "whatsapp", fx.factory));
  assert.ok(slotsState.slots.length >= 1, "active slot occurrence generated");
  const slot = slotsState.slots[0]!;
  assert.ok(Array.isArray(slot.predicted) && slot.predicted.length >= 1, "slot occurrence has identity forecast");

  const livePauta = await readLivePauta(ctxA, "whatsapp", undefined, fx.factory);
  const pautaMain = livePauta.products.find((p: any) => p.id === mainCap.productId);
  assert.ok(pautaMain, "recaptured pMain eligible in live pauta");
  const copiedId = await preparePautaCopy(
    ctxA,
    "whatsapp",
    pautaMain.confirmationId,
    pautaMain.id,
    "Texto WhatsApp Cafeteira",
    fx.factory,
    slot.id,
    randomUUID()
  );
  assert.ok(copiedId, "preparePautaCopy linked to slot occurrence");
  assert.equal(await confirmPautaExposure(ctxA, "whatsapp", copiedId!, pautaMain.id, fx.factory), true);
  const [expRow] = await rows<{ preparation_expired: boolean }>(
    `select preparation_expired from garimpa.recommendation_exposure where tenant_id='a' and product_id=$1`,
    [pautaMain.id]
  );
  assert.equal(expRow?.preparation_expired, false, "timely manual confirmation sets preparation_expired=false");

  // Test T06 overdue confirmation (preparation_expired = true) STILL works historically!
  const expiredArchId = randomUUID();
  await fx.pg.query(
    `insert into garimpa.recommendation_edition_archive(id,tenant_id,channel,version,config_version,prepared_at,selection,inputs)
     values ($1,'a','whatsapp',1,1,now()-interval '2 days',$2::jsonb,'[]'::jsonb)`,
    [
      expiredArchId,
      JSON.stringify({
        kind: "pauta-copied-v1",
        affiliateId: "aff_a",
        products: [{ id: equivCap.productId, priceCents: 18900, offerValidUntil: new Date(Date.now() - 3600_000).toISOString() }],
      }),
    ]
  );
  assert.equal(await confirmPautaExposure(ctxA, "whatsapp", expiredArchId, equivCap.productId, fx.factory), true);
  const [expLate] = await rows<{ preparation_expired: boolean }>(
    `select preparation_expired from garimpa.recommendation_exposure where tenant_id='a' and edition_id=$1`,
    [expiredArchId]
  );
  assert.equal(expLate?.preparation_expired, true, "delayed human disclosure sets preparation_expired=true without blocking history");

  console.log("PASS T03/T04/T06 journey: promotion -> recapture -> vitrine -> pauta slot -> manual confirm (current + overdue)");

  // =========================================================================
  // 3) Workerless Expiry: expired verified_at immediately removes public deal
  //    WITHOUT worker execution, while publicOfferHistory keeps price history!
  // =========================================================================
  const [mainPub] = await rows<{ slug: string }>(`select slug from garimpa.publication where tenant_id='a' and product_id=$1`, [mainCap.productId]);
  const dealLive = await publicDealDetail(mainPub!.slug, fx.factory);
  assert.ok(dealLive, "valid offer visible on publicDealDetail");
  const v2Catalog = await catalogPage({}, "a", fx.factory);
  const v2DealRow = v2Catalog.page.deals.find((d: any) => d.id === mainCap.productId);
  assert.ok(v2DealRow?.offerValidUntil, "active v2 policy preserves offerValidUntil in catalogPage");
  const v2Detail = await dealDetail(mainPub!.slug, "a", fx.factory);
  assert.ok(v2Detail?.deal.offerValidUntil, "active v2 policy preserves offerValidUntil in dealDetail");
  const goLive = await publicGo(new Request(`https://garimpa.test/go/${mainPub!.slug}`), mainPub!.slug, null, fx.factory);
  assert.equal(goLive.status, 302, "valid offer redirects via /go/[slug]");
  assert.match(goLive.headers.get("location") ?? "", /^https:\/\//, "valid offer redirects to external destination");

  // Backdate pMain verification + observation past 48h WITHOUT running any worker!
  await fx.pg.query(
    `update garimpa.offer_verification set verified_at=now()-interval '72 hours' where tenant_id='a' and product_id=$1`,
    [mainCap.productId]
  );
  await fx.pg.query(
    `update garimpa.price_observation set observed_at=observed_at-interval '72 hours' where tenant_id='a' and product_id=$1`,
    [mainCap.productId]
  );
  assert.equal(await publicDealDetail(mainPub!.slug, fx.factory), null, "expired offer vanishes from publicDealDetail immediately without worker");
  const edNoWorker = await readRecommendationEdition("home", "a", fx.factory);
  assert.ok(!edNoWorker.products.some((p: any) => p.id === mainCap.productId), "expired offer blocked from read_homepage_edition without worker");
  const goExpired = await publicGo(new Request(`https://garimpa.test/go/${mainPub!.slug}`), mainPub!.slug, null, fx.factory);
  assert.ok(
    goExpired.status === 404 || (goExpired.headers.get("location") ?? "").startsWith("/bizu/"),
    "expired offer /go/[slug] never redirects to external affiliate link"
  );
  const histStub = await publicOfferHistory(mainPub!.slug, fx.factory);
  assert.ok(histStub && histStub.slug === mainPub!.slug && (histStub.priceCents === 19500 || histStub.priceCents === null) && histStub.observedAt !== null, "expired offer keeps historical stub in public_offer_history_stub");
  const mainObsHist = await rows<{ id: string }>(`select id from garimpa.price_observation where tenant_id='a' and product_id=$1`, [mainCap.productId]);
  assert.ok(mainObsHist.length >= 2, "expired offer preserves full price observation history");
  console.log("PASS T03 workerless expiry: immediate public & /go block without worker, historical curve preserved");

  // Directly confirmed unavailability via PDP POST /api/extension/observations
  const [equivPub] = await rows<{ slug: string }>(
    `select slug from garimpa.publication where tenant_id='a' and product_id=$1`,
    [equivCap.productId]
  );
  const [equivScore] = await rows<{ observation_id: string; source_revision: string }>(
    `select observation_id,source_revision from garimpa.curation_score_projection where tenant_id='a' and product_id=$1 and option_key='listing' limit 1`,
    [equivCap.productId]
  );
  assert.ok(equivPub && equivScore, "equivCap is published & scored prior to unavailable_confirmed check");
  assert.ok(await publicDealDetail(equivPub.slug, fx.factory), "equivCap visible on publicDealDetail prior to unavailable_confirmed");

  await fx.pg.query(
    `insert into garimpa.curation_promotion(tenant_id,product_id,option_key,price_type,requested_observation_id,requested_revision,policy_version,reason,priority,deadline,next_attempt_at)
     values ('a',$1,'listing','exact',$2,$3,1,'slot',90,now()+interval '4 hours',now())
     on conflict do nothing`,
    [equivCap.productId, equivScore.observation_id, equivScore.source_revision]
  );
  await refreshRecapturePlan(sql, "a");
  const equivPlan = await readRecapturePlan(devA, randomUUID(), fx.factory);
  const equivPdpTask = equivPlan.tasks.find(
    (t: any) => t.kind === "pdp" && t.targets.some((tg: any) => tg.productId === equivCap.productId)
  );
  assert.ok(equivPdpTask, "planner emits Amazon PDP task for equivCap unavailable confirmation");
  const equivClaimToken = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  await claimRecaptureTask(
    devA,
    { requestId: randomUUID(), sessionId, taskId: equivPdpTask.id, revision: equivPdpTask.revision, claimToken: equivClaimToken, supportsClaimTargets: true },
    fx.factory
  );
  const unavailPayload = {
    version: 2,
    requestId: randomUUID(),
    sessionId,
    taskId: equivPdpTask.id,
    claimToken: equivClaimToken,
    marketplace: "amazon",
    observedAt: new Date().toISOString(),
    page: { kind: "product", url: equivPdpTask.url },
    products: [],
    results: [
      {
        productId: equivCap.productId,
        optionKey: "listing",
        externalId: "B0TESTEQU1",
        status: "unavailable_confirmed",
        evidence: "explicit_product_unavailable",
      },
    ],
  };
  validateRecaptureObservation(unavailPayload);
  const unavailHttp = await postObservationHttp(unavailPayload, { idempotencyKey: unavailPayload.requestId });
  assert.equal(unavailHttp.status, 200);
  assert.equal(unavailHttp.body.unavailable, 1);

  const [equivVerifAfter] = await rows<{ availability: string }>(
    `select availability from garimpa.offer_verification where tenant_id='a' and product_id=$1 and option_key='listing'`,
    [equivCap.productId]
  );
  assert.equal(equivVerifAfter?.availability, "unavailable", "unavailable_confirmed sets offer_verification.availability='unavailable'");
  assert.equal(await publicDealDetail(equivPub.slug, fx.factory), null, "unavailable_confirmed immediately removes public deal without worker");
  const edAfterUnavail = await readRecommendationEdition("home", "a", fx.factory);
  assert.ok(!edAfterUnavail.products.some((p: any) => p.id === equivCap.productId), "unavailable_confirmed removes offer from readRecommendationEdition immediately");
  const equivHist = await publicOfferHistory(equivPub.slug, fx.factory);
  assert.ok(equivHist && equivHist.slug === equivPub.slug, "unavailable_confirmed preserves historical public_offer_history_stub");
  console.log("PASS T04/T03 unavailable_confirmed via HTTP POST: immediate public removal & historical preservation");

  // =========================================================================
  // 4) T07 Operational Desk: Equivalence Veto Propagation, Exceptions & Metrics,
  //    and Strict Cross-Tenant Isolation (Account B vs Account A)
  // =========================================================================
  // Insert two products with full canonical option configurations (option_key <> 'listing')
  // using the T01 atomic staging/publication path, so equivalence linking can bind real configurations.
  const insertConfiguredOffer = async (externalId: string, title: string, variantKey: string, priceCents: number) => {
    const prodId = randomUUID();
    const obsId = randomUUID();
    const evidence = {
      version: 2,
      marketplace: "mercadolivre",
      currency: "BRL",
      priceType: "exact",
      priceMinCents: priceCents,
      priceMaxCents: priceCents,
      originalPriceKind: "none",
      originalPriceCents: null,
      observationMethod: "product_page",
      observedAt: new Date().toISOString(),
      sourceUrl: `https://produto.mercadolivre.com.br/${externalId}?variation=${variantKey}`,
      variantIdentity: { state: "source_verified", key: variantKey, methodVersion: "browser-option-v1" },
      variantKey,
      variantLabel: "110V Inox",
      packageQuantity: 1,
      conditions: {},
      fieldStates: {
        sellerId: "not_applicable",
        packageContents: "not_applicable",
        dimensions: "not_applicable",
        payment: "not_applicable",
        coupon: "not_applicable",
        region: "not_applicable",
      },
      source: { method: "browser", deviceId: "dev_a" },
    };
    const [optRow] = await rows<{ opt: string }>(`select garimpa.observation_option_key($1::jsonb) as opt`, [JSON.stringify(evidence)]);
    assert.notEqual(optRow!.opt, "listing", "canonical variant evidence yields concrete 32-hex option_key");
    const nowIso = new Date().toISOString();
    await fx.pg.query(
      `insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,category,last_price_cents,first_seen_at,last_seen_at)
       values ($1,'a','mercadolivre',$2,$3,$4,'Casa',$5,$6::timestamptz,$6::timestamptz)`,
      [prodId, externalId, title, evidence.sourceUrl, priceCents, nowIso]
    );
    await fx.pg.query(
      `insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at,capture_source,extension_device_id,source_page_url,title_snapshot,product_url_snapshot,offer_evidence)
       values ($1,'a',$2,$3,$4::timestamptz,'extension','dev_a',$5,$6,$5,$7::jsonb)`,
      [obsId, prodId, priceCents, nowIso, evidence.sourceUrl, title, JSON.stringify(evidence)]
    );
    await fx.pg.query(
      `insert into garimpa.product_curation(tenant_id,product_id,status) values ('a',$1,'pending') on conflict do nothing`,
      [prodId]
    );
    await fx.pg.query(
      `insert into garimpa.publication(id,tenant_id,product_id,affiliate_id,channel,slug)
       values ($1,'a',$2,'aff_a','web',$3) on conflict do nothing`,
      [randomUUID(), prodId, `mercadolivre-${externalId.toLowerCase()}-vitrine-a`]
    );
    await fx.pg.query(
      `insert into garimpa.editorial_offer_choice(tenant_id,product_id,option_key,selected_by)
       values ('a',$1,$2,'u_a') on conflict do nothing`,
      [prodId, optRow!.opt]
    );
    return { productId: prodId, observationId: obsId, optionKey: optRow!.opt };
  };
  const equivVarA = await insertConfiguredOffer("MLB700000091", "Mixer Portatil 400W Inox Modelo A", "11223344", 12900);
  const vetoedVarB = await insertConfiguredOffer("MLB700000099", "Mixer Portatil 400W Inox Modelo B", "55667788", 13500);
  await runCurationProjectionJob(sql, "a", model, fx.factory);
  const varJobs = await claimAttributeJobs(sql, "a", 20, 50, model);
  await attachAttributePromptContext(sql, "a", varJobs, []);
  for (const job of varJobs) {
    assert.equal(
      await finishAttributeJob(sql, "a", job, {
        productId: job.snapshot.input.productId,
        qualidade: 88,
        genuinidade_oferta: 84,
        apelo_whatsapp: 82,
        categoria: "Casa",
        flags: [],
        confianca: 0.9,
        justificativa: "Mixer portátil bem avaliado.",
        fatos_usados: ["titulo", "preco_brl"],
        duvidas: [],
      }),
      "completed"
    );
  }
  await runCurationProjectionJob(sql, "a", model, fx.factory);
  const edBeforeEquiv = await readRecommendationEdition("home", "a", fx.factory);
  assert.ok(edBeforeEquiv.products.some((p: any) => p.id === equivVarA.productId), "concrete variant enters home edition prior to equivalence veto");

  await fx.pg.query(
    `insert into garimpa.product_curation(tenant_id,product_id,status,reviewed_by_app_user_id)
     values ('a',$1,'rejected','u_a') on conflict(tenant_id,product_id) do update set status='rejected',reviewed_by_app_user_id='u_a'`,
    [vetoedVarB.productId]
  );
  await fx.pg.query(
    `insert into garimpa.curation_event(tenant_id,product_id,from_status,to_status,actor_type,actor_app_user_id)
     values ('a',$1,'pending','rejected','human','u_a')`,
    [vetoedVarB.productId]
  );
  const obsRows = [
    { product_id: equivVarA.productId, id: equivVarA.observationId, option_key: equivVarA.optionKey },
    { product_id: vetoedVarB.productId, id: vetoedVarB.observationId, option_key: vetoedVarB.optionKey },
  ];
  assert.ok(obsRows.every((o) => o.option_key !== "listing"), "variant captures produce concrete non-listing option keys");
  const grpRows = await rows<{ id: string }>(
    `insert into garimpa.curation_equivalence_group(tenant_id,reason,created_by) values ('a','manual_equivalence_test','u_a') returning id`
  );
  for (const o of obsRows) {
    await fx.pg.query(
      `insert into garimpa.curation_equivalence_member(tenant_id,group_id,product_id,option_key,observation_id,recognized_by,recognition_reason)
       values ('a',$1,$2,$3,$4,'u_a','mesmo_mixer')`,
      [grpRows[0]!.id, o.product_id, o.option_key, o.id]
    );
  }

  const [vetoCheck] = await rows<{ veto: boolean }>(
    `select garimpa.equivalent_human_veto('a',$1,$2) as veto`,
    [equivVarA.productId, equivVarA.observationId]
  );
  assert.equal(vetoCheck?.veto, true, "human rejection on equivalent product propagates equivalent_human_veto");

  await runCurationProjectionJob(sql, "a", model, fx.factory);
  const edAfterEquivVeto = await readRecommendationEdition("home", "a", fx.factory);
  assert.ok(!edAfterEquivVeto.products.some((p: any) => p.id === equivVarA.productId), "equivalent human veto removes item from public home edition");

  const deskA = await inAccountScope(ctxA, () => readEquivalenceDesk(ctxA, fx.factory));
  assert.equal(deskA.available, true);
  assert.equal(deskA.groups.length, 1);
  const excA = await inAccountScope(ctxA, () => readCurationExceptions(ctxA, fx.factory));
  assert.ok(Array.isArray(excA));
  const metricsA = await inAccountScope(ctxA, () => readCurationOperationsMetrics(ctxA, fx.factory));
  assert.ok(metricsA && metricsA.tenantId === "a" && Array.isArray(metricsA.exposures) && metricsA.exposures.length >= 1, "metrics report exposures and budget for account A");

  // Tenant B isolation: Account B sees 0 of Account A's groups, metrics, slots, or pauta!
  const deskB = await inAccountScope(ctxB, () => readEquivalenceDesk(ctxB, fx.factory));
  assert.equal(deskB.groups.length, 0, "Account B sees zero equivalence groups of Account A");
  const slotsB = await inAccountScope(ctxB, () => readPautaSlots(ctxB, "whatsapp", fx.factory));
  assert.equal(slotsB.slots.length, 0, "Account B sees zero slots of Account A");
  const metricsB = await inAccountScope(ctxB, () => readCurationOperationsMetrics(ctxB, fx.factory));
  assert.equal(metricsB?.exposures.length, 0, "Account B sees zero exposures of Account A");
  await assert.rejects(
    () => inAccountScope(ctxB, () => readCurationOperationsMetrics(ctxA, fx.factory)),
    /forbidden_account_scope/
  );

  console.log("PASS T07 & multi-tenant isolation: equivalence veto propagation, operational metrics, and A vs B isolation");

  // Full v2 member-db verification (member_current_offers, member_watch_evidence with ::text casts)
  assert.equal(await setFavorite("u_a", equivVarA.productId, true, "a", fx.factory), true);
  const memberSaved = await savedDeals("u_a", "a", fx.factory);
  assert.ok(Array.isArray(memberSaved));
  const memberWatches = await watchedDeals("u_a", "a", fx.factory);
  assert.ok(Array.isArray(memberWatches));
  const memberRecs = await recommendedDeals("u_a", 8, "a", fx.factory);
  assert.ok(Array.isArray(memberRecs));
  console.log("PASS v2 member-db reads (savedDeals, watchedDeals, recommendedDeals)");

  // Legacy tenant 'b' (no row in curation_policy_v2) with 72h-old observation keeps catalog/detail visible without 48h offerValidUntil expiry
  await fx.pg.exec(`
    insert into garimpa.product(id,tenant_id,marketplace,external_id,title,category,image_url,product_url,last_price_cents,last_seen_at)
    values ('prod_legacy_b','b','mercadolivre','MLB999001','Produto Legado 72h','Casa','https://http2.mlstatic.com/legacy-b.webp','https://mercadolivre.com.br/p/MLB999001',14900,now()-interval '72 hours');
    insert into garimpa.product_curation(tenant_id,product_id,status) values ('b','prod_legacy_b','approved');
    insert into garimpa.price_observation(id,tenant_id,product_id,price_cents,observed_at)
    values ('obs_legacy_b','b','prod_legacy_b',14900,now()-interval '72 hours');
    insert into garimpa.publication(id,tenant_id,affiliate_id,product_id,channel,slug,status,affiliate_url)
    values ('pub_legacy_b','b','aff_b','prod_legacy_b','web','ml-MLB999001','active','https://mercadolivre.com.br/sec/legacy-b');
  `);
  const legacyCatalog = await catalogPage({}, "b", fx.factory);
  const legacyCard = legacyCatalog.page.deals.find((d: any) => d.id === "prod_legacy_b");
  assert.ok(legacyCard && legacyCard.image_url === "https://http2.mlstatic.com/legacy-b.webp", "legacy 72h deal stays in catalogPage with image");
  assert.equal(legacyCard?.offerValidUntil, undefined, "legacy tenant without curation_policy_v2 omits offerValidUntil in catalogPage");
  const legacyDetail = await dealDetail("ml-MLB999001", "b", fx.factory);
  assert.ok(legacyDetail?.deal && legacyDetail.deal.image_url === "https://http2.mlstatic.com/legacy-b.webp", "legacy 72h deal stays in dealDetail with image");
  assert.equal(legacyDetail?.deal.offerValidUntil, undefined, "legacy tenant without curation_policy_v2 omits offerValidUntil in dealDetail");
  console.log("PASS v2 vs legacy offerValidUntil handling in catalogPage and dealDetail");
} finally {
  await fx.pg.close();
}
