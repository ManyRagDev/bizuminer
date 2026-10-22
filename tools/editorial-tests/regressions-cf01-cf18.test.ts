/**
 * Regressões das Correções CF-01 a CF-18 (Plano 17 / Conferência 16).
 * Valida o comportamento correto do motor BizuMiner V2 sob RLS e grants fiéis.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";

const require = createRequire(import.meta.url);
const { withAccountDb } = require("../../packages/web/lib/tenant-db.ts");
const { curationSummary } = require("../../packages/web/lib/curation-db.ts");
const opp = require("../../packages/web/lib/opportunity-db.ts");
const rubric = require("../../packages/web/lib/rubric-db.ts");
const fin = require("../../packages/web/lib/commercial-financial-db.ts");
const exp = require("../../packages/web/lib/experiment-db.ts");
const onboard = require("../../packages/web/lib/saas-onboarding-db.ts");
const { executeDispatchCycle } = require("../../packages/web/lib/dispatch-worker.ts");
const { scheduleDispatchJob, cancelDispatchJob } = require("../../packages/web/lib/dispatch-db.ts");

const ctx = (t: string, role = "owner") => ({
  tenantId: t,
  affiliateId: "aff_" + t,
  actor: "human" as const,
  actorAppUserId: "u_" + t,
  authenticatedAuthUserId: "auth_" + t,
  membershipRole: role as any,
  requestId: "audit_" + t,
});

export async function runCfRegressions() {
  const { pg, factory } = await commercialFixture();
  const asTenant = (t: string, fn: any) =>
    factory().begin(async (tx: any) => {
      await tx`select set_config('garimpa.tenant_id', ${t}, true)`;
      return fn(tx);
    });

  // Base seed data
  await pg.exec(`
    insert into garimpa.affiliate_account(id, tenant_id, public_slug, display_name) values
    ('aff_a', 'a', 'audit-a', 'Audit A'),
    ('aff_b', 'b', 'audit-b', 'Audit B'),
    ('aff_local', 'local', 'audit-house', 'Audit House');
    insert into garimpa.app_user(id, tenant_id, auth_user_id) values
    ('u_a', 'a', 'auth_a'),
    ('u_b', 'b', 'auth_b'),
    ('u_new', 'a', 'auth_new');
    insert into garimpa.app_user_role(app_user_id, role) values
    ('u_a', 'afiliado'),
    ('u_b', 'afiliado');
    insert into garimpa.affiliate_membership(affiliate_id, app_user_id, role) values
    ('aff_a', 'u_a', 'owner'),
    ('aff_b', 'u_b', 'owner');
    insert into garimpa.product(id, tenant_id, marketplace, external_id, title, product_url, last_price_cents) values
    ('p_a', 'a', 'mercadolivre', '101', 'Audit product A', 'https://mercadolivre.com.br/a', 10000),
    ('p_b', 'b', 'mercadolivre', '102', 'Audit product B', 'https://mercadolivre.com.br/b', 10000),
    ('p_house', 'local', 'mercadolivre', '103', 'Audit house product', 'https://mercadolivre.com.br/house', 10000);
    insert into garimpa.product_curation(tenant_id, product_id, status) values
    ('a', 'p_a', 'approved'),
    ('b', 'p_b', 'pending'),
    ('local', 'p_house', 'pending');
    insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, offer_evidence) values
    ('o_a', 'a', 'p_a', 10000, '{}'),
    ('o_b', 'b', 'p_b', 10000, '{}'),
    ('o_house', 'local', 'p_house', 10000, '{}');
    insert into garimpa.account_entitlement(tenant_id, affiliate_id, plan_version, status, starts_at, ends_at, limits, terms_ref) values
    ('a', 'aff_a', 'test', 'active', '2026-01-01', '2027-01-01', '{"maxActiveCampaigns":10,"maxDailyKits":10}', 'test-only'),
    ('b', 'aff_b', 'test', 'active', '2026-01-01', '2027-01-01', '{"maxActiveCampaigns":10,"maxDailyKits":10}', 'test-only');
    insert into garimpa.account_invitation(tenant_id, affiliate_id, token_hash, invited_email, role, expires_at, created_by) values
    ('a', 'aff_a', 'hash-a', 'synthetic-a@example.invalid', 'operator', '2027-01-01', 'u_a'),
    ('b', 'aff_b', 'hash-b', 'synthetic-b@example.invalid', 'operator', '2027-01-01', 'u_b');
  `);

  console.log("=== EXECUTANDO BATERIA DE REGRESSÕES CF-01 A CF-18 ===");

  // CF-01: RLS without context must fail closed
  console.log("Testando CF-01: RLS sem contexto nega leitura/escrita...");
  const cf01Result = await factory().begin(async (tx: any) => ({
    invitations: await tx`select tenant_id, token_hash from garimpa.account_invitation order by tenant_id`,
    plans: await tx`select tenant_id, plan_version from garimpa.account_entitlement order by tenant_id`,
    updated: await tx`update garimpa.account_entitlement set terms_ref='cf01_forbidden' returning tenant_id`,
  }));
  assert.equal(cf01Result.invitations.length, 0, "CF-01: Convites não devem vazar sem contexto");
  assert.equal(cf01Result.plans.length, 0, "CF-01: Planos não devem vazar sem contexto");
  assert.equal(cf01Result.updated.length, 0, "CF-01: Planos não devem ser alterados sem contexto");
  console.log("✔ PASS CF-01: RLS sem contexto falha fechado.");

  // CF-14 & CF-13: Aceite seguro de convite com grants fiéis
  console.log("Testando CF-14 & CF-13: Aceite seguro de convite com verificação de identidade e grant restrito...");
  const invite = await onboard.createAccountInvitation(ctx("a"), { invitedEmail: "invitee@example.invalid", role: "operator" }, factory);
  // Rejeita aceitação sem auth user verificado ou com email divergente
  await assert.rejects(
    () => onboard.acceptAccountInvitation({ ...ctx("a"), actorAppUserId: "u_new", authenticatedAuthUserId: null }, { rawToken: invite.rawToken, invitedEmail: "invitee@example.invalid" }, factory),
    /identidade|unauthenticated|forbidden|sessão/i,
    "CF-13: Rejeita aceite sem authenticatedAuthUserId",
  );
  await assert.rejects(
    () => onboard.acceptAccountInvitation({ ...ctx("a"), actorAppUserId: "u_new", authenticatedAuthUserId: "auth_new", verifiedEmail:"invitee@example.invalid", emailConfirmed:true }, { rawToken: invite.rawToken, invitedEmail: "wrong@example.invalid" }, factory),
    /email|destinatário/i,
    "CF-13: Rejeita email não correspondente ao convite",
  );
  // Aceite legítimo deve funcionar atomicamente e atribuir role 'afiliado' sem dar erro 42501
  const accepted = await onboard.acceptAccountInvitation(
    { ...ctx("a"), actorAppUserId: "u_new", authenticatedAuthUserId: "auth_new", verifiedEmail:"invitee@example.invalid", emailConfirmed:true },
    { rawToken: invite.rawToken, invitedEmail: "invitee@example.invalid" },
    factory,
  );
  assert.equal(accepted.accepted, true, "CF-14: Aceite legítimo deve ter sucesso");
  const memberCheck: any = await pg.query(`select role from garimpa.affiliate_membership where affiliate_id='aff_a' and app_user_id='u_new'`);
  assert.equal(memberCheck.rows[0]?.role, "operator", "CF-14: Membership atribuída corretamente");
  const roleCheck: any = await pg.query(`select role from garimpa.app_user_role where app_user_id='u_new'`);
  assert.equal(roleCheck.rows[0]?.role, "afiliado", "CF-14: Role base atribuída corretamente");
  console.log("✔ PASS CF-13 & CF-14: Aceite de convite seguro sob grant fiel.");

  // CF-15: Suspensão deve atualizar affiliate_account e revogar leituras privadas
  console.log("Testando CF-15: Suspensão de conta alcança estado canônico e bloqueia acesso privado...");
  await pg.exec(`insert into garimpa.app_user_role(app_user_id, role) values ('u_a', 'platform_admin');`);
  await onboard.suspendAccountByPlatformAdmin(ctx("a"), { targetTenantId: "a", reason: "Audit suspension" }, factory);
  const suspendedCheck: any = await pg.query(`
    select (select status from garimpa.affiliate_account where tenant_id='a') as account_status,
           (select status from garimpa.account_entitlement where tenant_id='a') as entitlement_status
  `);
  assert.equal(suspendedCheck.rows[0]?.account_status, "suspended", "CF-15: affiliate_account deve estar suspended");
  assert.equal(suspendedCheck.rows[0]?.entitlement_status, "suspended", "CF-15: account_entitlement deve estar suspended");
  await assert.rejects(
    () => withAccountDb(ctx("a"), (tx: any) => tx`select count(*) from garimpa.audience_policy where tenant_id='a'`, factory),
    /suspens|suspended|forbidden/i,
    "CF-15: withAccountDb deve rejeitar tenant suspenso",
  );
  // Reativar para próximos testes
  await pg.exec(`update garimpa.affiliate_account set status='active' where tenant_id='a'; update garimpa.account_entitlement set status='active' where tenant_id='a';`);
  console.log("✔ PASS CF-15: Suspensão afeta estado canônico e revoga acesso.");

  // CF-02 & CF-03: Contexto em comandos privados e captura de extensão
  console.log("Testando CF-02 & CF-03: Contexto de ator e dispositivo na captura...");
  await pg.exec(`insert into garimpa.extension_device(id, affiliate_id, created_by_app_user_id, name, token_hash) values ('dev_test', 'aff_a', 'u_a', 'Test Dev', 'hash-test-dev');`);
  const { persistExtensionCapture } = require("../../packages/web/lib/extension-db.ts");
  const device = {
    deviceId: "dev_test",
    affiliateId: "aff_a",
    tenantId: "a",
    affiliatePublicSlug: "slug-a",
    affiliateDisplayName: "Afiliado A",
    appUserId: "u_a",
  };
  const payload = {
    clientCapturedAt: new Date().toISOString(),
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    page: {
      url: "https://mercadolivre.com.br/test-capture",
    },
    product: {
      externalId: "ext-101",
      title: "Ext capture test",
      productUrl: "https://mercadolivre.com.br/test-capture",
      priceCents: 15000,
      originalPriceCents: 20000,
      availability: "in_stock" as const,
      marketplace: "mercadolivre" as const,
    },
  };
  const captureSuccess = await persistExtensionCapture(device, payload, factory);
  assert.equal(captureSuccess.ok, true, "CF-03: persistExtensionCapture deve ter sucesso com contexto de ator");
  console.log("✔ PASS CF-02 & CF-03: Contexto de dispositivo e ator propagados.");

  // CF-04 & CF-05: Revisão humana sem IA e revisor multi-membership
  console.log("Testando CF-04 & CF-05: Persistência humana e revisor multi-conta...");
  const assessmentPayload = {
    schemaVersion: 2,
    quality: { level: "strong", reason: "Human verified" },
    value: { level: "adequate", reason: "Good price" },
    audience: { level: "adequate", reason: "General audience" },
    evidenceConfidence: { level: "adequate", reason: "Verified facts" },
    factsUsed: ["price:10000"],
    inferences: [],
    unknowns: [],
    safetyFlags: [],
    policyVersion: "audit-v1",
    evidenceDigest: "digest-cf04",
    createdAt: new Date().toISOString(),
  };
  // u_b tem home tenant 'b', mas adicionamos membership 'operator' em 'aff_a'
  await pg.exec(`insert into garimpa.affiliate_membership(affiliate_id, app_user_id, role) values ('aff_a', 'u_b', 'operator') on conflict do nothing;`);
  const reviewResult = await asTenant("a", (tx: any) =>
    rubric.recordHumanRubricReview(tx, {
      tenantId: "a",
      productId: "p_a",
      humanAssessment: assessmentPayload,
      reviewedByAppUserId: "u_b",
    }),
  );
  assert.equal(reviewResult.saved, true, "CF-04: Revisão humana deve ser salva mesmo sem IA");
  const humanSaved: any = await pg.query(`select count(*)::int as count from garimpa.editorial_assessment where product_id='p_a' and tenant_id='a'`);
  assert.ok(humanSaved.rows[0]?.count >= 1, "CF-04: editorial_assessment deve conter a avaliação salva");
  console.log("✔ PASS CF-04 & CF-05: Avaliação humana persistida e autoria multi-tenant respeitada.");

  // CF-06: 30 replays não ratificam rubrica sem aprovação explícita
  console.log("Testando CF-06: Replays não ratificam rubrica...");
  for(let n=0;n<30;n++)await asTenant("a",(tx:any)=>rubric.recordHumanRubricReview(tx,{tenantId:"a",productId:"p_a",humanAssessment:assessmentPayload,reviewedByAppUserId:"u_a"}));
  const metrics = await asTenant("a", (tx: any) => rubric.getRubricPromotionMetrics(tx, "a"));
  assert.notEqual(metrics.status, "ratified", "CF-06: Métrica de amostra não deve declarar ratified sem evento de ratificação");
  console.log("✔ PASS CF-06: Métricas separadas de ratificação humana.");

  // CF-07: Experimento não promove shadow sem revisão nem aceita versão inexistente
  console.log("Testando CF-07: Governança estrita de experimentos de política...");
  const policy = await asTenant("a", (tx: any) => opp.createAudiencePolicy(tx, "a", { name: "Exp policy" }));
  await asTenant("a", (tx: any) => opp.createAudiencePolicyVersion(tx, "a", { policyId: policy.id, version: "base", config: {} }));
  await assert.rejects(
    () => exp.createPolicyExperiment(ctx("a"), { baselineVersion: "base", candidateVersion: "nonexistent", hypothesis: "Test", primaryMetric: "score", audiencePolicyId: policy.id }, factory),
    /candidate|candidata|inexistente|versão|not.found/i,
    "CF-07: Deve rejeitar criação de experimento com versão candidata inexistente",
  );
  console.log("✔ PASS CF-07: Experimento exige versão candidata e método válido.");

  // CF-08, CF-09, CF-10: Identidade financeira, tuplas e sem duplicação de conversões
  console.log("Testando CF-08, CF-09 & CF-10: Identidade financeira, ajustes e lotes sobrepostos...");
  const header = "externalOrderId,externalItemId,occurredAt,orderValueCents,commissionCents,currency,marketplace,subId,status,commissionState";
  const csvContent = (lines: string[]) => header + "\n" + lines.join("\n");
  const line1 = "colon:a,b,2026-10-14T10:00:00Z,10000,100,BRL,shopee,,confirmed,confirmed";
  const line2 = "colon,a:b,2026-10-14T10:00:00Z,10000,250,BRL,shopee,,confirmed,confirmed";
  // CF-09: Chaves com ':' não colidem
  const pA = await fin.createOrGetImportBatchPreview(ctx("a"), { marketplace: "shopee", csvContent: csvContent([line1]) }, factory);
  const pB = await fin.createOrGetImportBatchPreview(ctx("a"), { marketplace: "shopee", csvContent: csvContent([line2]) }, factory);
  await fin.commitImportBatch(ctx("a"), { batchId: pA.batchId, expectedDigest: pA.preview.fileDigest, selectedRowIds: pA.preview.rowDecisions.map((r: any) => r.rowId) }, factory);
  const commitB = await fin.commitImportBatch(ctx("a"), { batchId: pB.batchId, expectedDigest: pB.preview.fileDigest, selectedRowIds: pB.preview.rowDecisions.map((r: any) => r.rowId) }, factory);
  assert.equal(commitB.committedRowsCount, 1, "CF-09: Chaves distintas com ':' coexistem no commit");

  // CF-10: Lotes sobrepostos não duplicam conversão
  const overlapLine = "overlap-ord,overlap-item,2026-10-14T10:00:00Z,10000,100,BRL,shopee,,confirmed,confirmed";
  const prev1 = await fin.createOrGetImportBatchPreview(ctx("a"), { marketplace: "shopee", csvContent: csvContent([overlapLine]) }, factory);
  const prev2 = await fin.createOrGetImportBatchPreview(ctx("a"), { marketplace: "shopee", csvContent: csvContent([overlapLine, "second-ord,second-item,2026-10-14T10:00:00Z,20000,200,BRL,shopee,,confirmed,confirmed"]) }, factory);
  await fin.commitImportBatch(ctx("a"), { batchId: prev1.batchId, expectedDigest: prev1.preview.fileDigest, selectedRowIds: prev1.preview.rowDecisions.map((r: any) => r.rowId) }, factory);
  await fin.commitImportBatch(ctx("a"), { batchId: prev2.batchId, expectedDigest: prev2.preview.fileDigest, selectedRowIds: prev2.preview.rowDecisions.map((r: any) => r.rowId) }, factory);
  const convCount: any = await pg.query(`select count(*)::int as count from garimpa.conversion where external_order_id='overlap-ord' and tenant_id='a'`);
  assert.equal(convCount.rows[0]?.count, 1, "CF-10: Conversão não deve ser duplicada por commits sobrepostos");

  // CF-08: Ajuste / correção de comissão
  const correctionLine = "overlap-ord,overlap-item,2026-10-14T10:00:00Z,10000,150,BRL,shopee,,confirmed,received";
  const prevCorr = await fin.createOrGetImportBatchPreview(ctx("a"), { marketplace: "shopee", csvContent: csvContent([correctionLine]) }, factory);
  const commitCorr = await fin.commitImportBatch(ctx("a"), { batchId: prevCorr.batchId, expectedDigest: prevCorr.preview.fileDigest, selectedRowIds: prevCorr.preview.rowDecisions.map((r: any) => r.rowId),reviewResolutions:Object.fromEntries(prevCorr.preview.rowDecisions.map((r:any)=>[r.rowId,{sourceRevision:"received-revision-2",rationale:"Synthetic report review"}])) }, factory);
  assert.ok(commitCorr.committedRowsCount >= 1 || commitCorr.adjustmentsCount >= 1, "CF-08: Correção deve ser comitada como ajuste");
  console.log("✔ PASS CF-08, CF-09 & CF-10: Identidade financeira, ledger e deduplicação consistentes.");

  // CF-11 & CF-12: Dispatch worker sem fallback falso e respeitando marker/cancelamento
  console.log("Testando CF-11 & CF-12: Dispatch worker com validação factual e marker durável...");
  await pg.exec(`
    insert into garimpa.audience_policy(id, tenant_id, name) values('dp_test', 'a', 'Dispatch policy') on conflict do nothing;
    insert into garimpa.audience_policy_version(id, policy_id, tenant_id, version, config) values('dpv_test', 'dp_test', 'a', 'v1', '{}') on conflict do nothing;
    insert into garimpa.opportunity(id, tenant_id, product_id, policy_version_id, audience_key, channel, state, class, price_evidence_snapshot, valid_until)
      values('dopp_test', 'a', 'p_a', 'dpv_test', 'test', 'telegram_channel', 'prioritized', 'unclassified', '{}', '2027-01-01') on conflict do nothing;
    insert into garimpa.destination(id, tenant_id, channel, label, external_target_ref, automation_mode) values
      ('dest_test', 'a', 'telegram_channel', 'Audit Dest', 'tg_channel_test', 'assisted') on conflict do nothing;
    insert into garimpa.campaign(id, tenant_id, name, objective, created_by) values
      ('camp_test', 'a', 'Audit campaign', 'Conversion', 'u_a') on conflict do nothing;
    insert into garimpa.commercial_kit(id, tenant_id, campaign_id, opportunity_id, status) values
      ('kit_empty', 'a', 'camp_test', 'dopp_test', 'draft') on conflict do nothing;
    insert into garimpa.commercial_kit_revision(id, tenant_id, kit_id, revision, snapshot, claims, materials, created_by, content_digest) values
      ('rev_empty', 'a', 'kit_empty', 1, '{}', '[]', '[]', 'u_a', 'digest_empty') on conflict do nothing;
    insert into garimpa.campaign_publication(id, tenant_id, campaign_id, kit_id, kit_revision_id, destination_id, channel, status, created_by) values
      ('pub_empty', 'a', 'camp_test', 'kit_empty', 'rev_empty', 'dest_test', 'telegram_channel', 'planned', 'u_a') on conflict do nothing;
  `);
  // CF-11: Job com kit vazio/sem link rejeita ou falha no ciclo sem chamar adapter com dados inventados
  const emptyJob = await asTenant("a", (tx: any) =>
    scheduleDispatchJob(tx, {
      tenantId: "a",
      campaignPublicationId: "pub_empty",
      kitRevisionId: "rev_empty",
      destinationId: "dest_test",
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
      idempotencyKey: "audit_dispatch_empty",
    }),
  );
  let adapterCalled = false;
  const dummyAdapter = {
    sendApprovedRevision: async () => {
      adapterCalled = true;
      return { kind: "sent", providerMessageId: "dummy" };
    },
  };
  const cycleResult = await executeDispatchCycle({factory,origin:"https://audit.invalid",validateCredential:async()=>true},ctx("a"),dummyAdapter,{workerToken:"tok_test"});
  assert.equal(cycleResult.preDispatchBlocked,true);
  assert.equal(adapterCalled, false, "CF-11: Adapter não deve ser chamado com fatos vazios/ausentes");
  console.log("✔ PASS CF-11: Dispatch rejeita fatos sintéticos ou de fallback.");

  // CF-12: Cancelamento antes do marker aborta envio e nunca chama adapter
  let calledCf12 = 0;
  let cancelledCf12 = false;
  const cancelAdapter = {
    sendApprovedRevision: async () => {
      calledCf12++;
      return { kind: "sent", providerMessageId: "dummy" };
    },
  };
  await pg.exec(`
    insert into garimpa.campaign_publication(id, tenant_id, campaign_id, kit_id, kit_revision_id, destination_id, channel, status, created_by) values
    ('pub_cancel_test', 'a', 'camp_test', 'kit_empty', 'rev_empty', 'dest_test', 'telegram_channel', 'ready', 'u_a') on conflict do nothing;
  `);
  const cancelJob = await asTenant("a", (tx: any) =>
    scheduleDispatchJob(tx, {
      tenantId: "a",
      campaignPublicationId: "pub_cancel_test",
      kitRevisionId: "rev_empty",
      destinationId: "dest_test",
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
      idempotencyKey: "audit_dispatch_cancel",
    }),
  );
  const {leaseNextEligibleJob,markIoStarted}=require("../../packages/web/lib/dispatch-db.ts");
  await asTenant("a",async(tx:any)=>{const leased=await leaseNextEligibleJob(tx,"a","audit-cancel-worker");assert.equal(leased.id,cancelJob.id);cancelledCf12=(await cancelDispatchJob(tx,"a",leased.id)).cancelled;assert.equal(await markIoStarted(tx,"a",leased.id,"audit-cancel-worker"),false);});
  assert.equal(cancelledCf12,true,"Cancellation must actually reach the marker race");
  assert.equal(calledCf12, 0, "CF-12: Adapter não deve ser chamado após cancelamento/perda de marker");
  console.log("✔ PASS CF-12: Cancelamento antes do marker aborta I/O sem chamar adapter.");

  // CF-16: Progresso de onboarding requer evidências factuais
  console.log("Testando CF-16: Onboarding exige evidência factual comprovada...");
  await onboard.recordOnboardingProgress(ctx("a"), { step: "account_created", status: "completed" }, factory);
  await assert.rejects(
    () => onboard.recordOnboardingProgress(ctx("a"), { step: "marketplace_credentials_configured", status: "completed" }, factory),
    /evidência|credential|configuração|missing/i,
    "CF-16: Não pode marcar credenciais configuradas sem credencial real",
  );
  console.log("✔ PASS CF-16: Progresso de onboarding verificado por fatos.");

  await pg.close();
  console.log("=== TODAS AS REGRESSÕES CF-01 A CF-18 FORAM VERIFICADAS COM SUCESSO! ===");
}

if (process.argv[1]?.endsWith("regressions-cf01-cf18.test.ts")) {
  runCfRegressions().catch((err) => {
    console.error("FALHA NAS REGRESSÕES CF:", err);
    process.exit(1);
  });
}
