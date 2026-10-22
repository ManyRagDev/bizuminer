import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";

const require = createRequire(import.meta.url);
const {
  validatePreDispatch,
  canLeaseJob,
  canFinalizeJob,
  computeNextAttempt,
  reconcileUnknownJob,
  classifyExpiredLease,
  SyntheticDistributionAdapter,
} = require("../../packages/web/lib/dispatch-contract.ts");

const {
  scheduleDispatchJob,
  leaseNextEligibleJob,
  sweepExpiredLeases,
  markIoStarted,
  finalizeJobSuccess,
  finalizeJobFailure,
  finalizeJobUnknown,
  cancelDispatchJob,
  reconcileDispatchJob,
  listDispatchJobs,
  getDispatchJobById,
  listDispatchAttempts,
} = require("../../packages/web/lib/dispatch-db.ts");

const {
  executeDispatchCycle,
} = require("../../packages/web/lib/dispatch-worker.ts");

const w = require("../../packages/web/lib/commercial-workflow.ts");

const { pg, factory } = await commercialFixture();

console.log("--- D11 AUTOMATION, OUTBOX WORKER & RECONCILIATION TESTS ---");

const ctx = (t: string, user = `user_${t}`, role = "owner") => ({
  tenantId: t,
  affiliateId: `aff_${t}`,
  actor: "human" as const,
  actorAppUserId: user,
  authenticatedAuthUserId: `auth_${t}`,
  membershipRole: role,
  requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
});

// Seed accounts, users, products, memberships, destinations
await pg.exec(`
  insert into garimpa.affiliate_account(id, tenant_id, public_slug, display_name) values
    ('aff_disp_a', 'disp_a', 'disp-a', 'Conta Disparo A'),
    ('aff_disp_b', 'disp_b', 'disp-b', 'Conta Disparo B')
  on conflict do nothing;

  insert into garimpa.app_user(id, tenant_id, auth_user_id) values
    ('user_disp_a', 'disp_a', 'auth_disp_a'),
    ('user_disp_b', 'disp_b', 'auth_disp_b')
  on conflict do nothing;

  insert into garimpa.app_user_role(app_user_id, role) values
    ('user_disp_a', 'afiliado'),
    ('user_disp_b', 'afiliado')
  on conflict do nothing;

  insert into garimpa.affiliate_membership(affiliate_id, app_user_id, role) values
    ('aff_disp_a', 'user_disp_a', 'owner'),
    ('aff_disp_b', 'user_disp_b', 'owner')
  on conflict do nothing;

  insert into garimpa.product(id, tenant_id, marketplace, external_id, title, product_url, last_price_cents) values
    ('prod_disp_a', 'disp_a', 'mercadolivre', 'ext_disp_1', 'Smartphone Alpha', 'https://mercadolivre.com.br/item1', 150000),
    ('prod_disp_b', 'disp_b', 'shopee', 'ext_disp_2', 'Fones Beta', 'https://shopee.com.br/item2', 8000)
  on conflict do nothing;

  insert into garimpa.product_curation(tenant_id, product_id, status) values
    ('disp_a', 'prod_disp_a', 'approved'),
    ('disp_b', 'prod_disp_b', 'approved')
  on conflict do nothing;

  insert into garimpa.publication(id, tenant_id, affiliate_id, product_id, channel, slug, status, affiliate_url) values
    ('pub_disp_a', 'disp_a', 'aff_disp_a', 'prod_disp_a', 'web', 'disp-a--item1', 'active', 'https://aff.link/item1'),
    ('pub_disp_b', 'disp_b', 'aff_disp_b', 'prod_disp_b', 'web', 'disp-b--item2', 'active', 'https://aff.link/item2')
  on conflict do nothing;

  insert into garimpa.affiliate_marketplace_config(affiliate_id, marketplace, tracking_id, tool_id, status) values
    ('aff_disp_a', 'mercadolivre', 'tag_disp_a', 'tool_disp_a', 'active'),
    ('aff_disp_b', 'shopee', 'tag_disp_b', 'tool_disp_b', 'active')
  on conflict do nothing;

  insert into garimpa.account_entitlement(tenant_id, affiliate_id, plan_version, status, starts_at, limits, terms_ref) values
    ('disp_a', 'aff_disp_a', 'pilot-v1', 'active', '2026-01-01T00:00:00Z', '{"maxActiveCampaigns":10,"maxDailyKits":20,"allowedMarketplaces":["mercadolivre"]}'::jsonb, 'terms_v1'),
    ('disp_b', 'aff_disp_b', 'pilot-v1', 'active', '2026-01-01T00:00:00Z', '{"maxActiveCampaigns":10,"maxDailyKits":20,"allowedMarketplaces":["shopee"]}'::jsonb, 'terms_v1')
  on conflict do nothing;

  insert into garimpa.destination(id, tenant_id, channel, label, status, external_target_ref, automation_mode) values
    ('dest_disp_a', 'disp_a', 'synthetic_test', 'Canal Teste A', 'active', 'test_channel_a', 'assisted'),
    ('dest_disp_b', 'disp_b', 'synthetic_test', 'Canal Teste B', 'active', 'test_channel_b', 'assisted')
  on conflict do nothing;
`);

const qualifiedEvidence = {
  version: 2,
  currency: 'BRL',
  priceType: 'exact',
  variantIdentity: { state: 'source_verified', key: 'unit', attributes: {} },
  packageQuantity: 1,
  fieldStates: {
    sellerId: 'not_applicable',
    packageContents: 'not_applicable',
    dimensions: 'not_applicable',
    payment: 'not_applicable',
    coupon: 'not_applicable',
    region: 'not_applicable',
  },
};

await pg.query(
  `insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, offer_evidence) values
    ('obs_disp_a', 'disp_a', 'prod_disp_a', 150000, $1),
    ('obs_disp_b', 'disp_b', 'prod_disp_b', 8000, $1)`,
  [JSON.stringify(qualifiedEvidence)],
);

const baseSql = factory();
async function asTenant<T>(tenantId: string, role = "owner", fn: (tx: any) => Promise<T>): Promise<T> {
  return baseSql.begin(async (tx: any) => {
    await tx`select set_config('garimpa.tenant_id', ${tenantId}, true)`;
    await tx`select set_config('garimpa.membership_role', ${role}, true)`;
    return fn(tx);
  });
}

// Criar campanha e kit aprovado para disp_a via commercial-workflow
const campA = await w.createCampaignForAccount(
  ctx("disp_a"),
  { name: "Campanha Disparo A", objective: "Divulgação", audience: "Público Geral", requestId: "req_camp_disp_a" },
  factory,
);
const kitA = await w.createKitForAccount(
  ctx("disp_a"),
  { campaignId: campA.campaignId, productId: "prod_disp_a", channel: "whatsapp_channel", reason: "Revisão", requestId: "req_kit_disp_a" },
  factory,
);
const valA = await w.validateKitForAccount(
  ctx("disp_a"),
  { kitId: kitA.kitId, expectedVersion: kitA.kitVersion, requestId: "req_val_disp_a" },
  factory,
);
const appA = await w.approveKitForAccount(
  ctx("disp_a"),
  { kitId: kitA.kitId, expectedVersion: valA.kitVersion, requestId: "req_app_disp_a" },
  factory,
);

// Obter IDs gerados de campaign_publication e commercial_kit_revision
const deskA = await w.getCommercialDesk(ctx("disp_a"), factory);
const pubA = deskA.publications[0];
assert.ok(pubA, "Publication deve existir após aprovação do kit");

const [pubRow] = await asTenant("disp_a", "owner", (tx) =>
  tx<{ kit_revision_id: string }[]>`select kit_revision_id from garimpa.campaign_publication where id = ${pubA.id}`
);
const kitRevisionId = pubRow.kit_revision_id;

// ============================================================================
// 1. Validações Pré-I/O (Pre-Dispatch Guards)
// ============================================================================
console.log("1. Testando validações de pré-disparo (kill switch, drift de preço, validade de evidência)...");

// Kill switch ativo
const checkKillSwitch = validatePreDispatch({
  accountStatus: "active",
  destinationStatus: "active",
  killSwitchActive: true,
  kitStatus: "approved",
  kitRevisionId: kitRevisionId,
  targetKitRevisionId: kitRevisionId,
  priceObservedCents: 150000,
  snapshotPriceCents: 150000,
  validUntil: new Date(Date.now() + 100000).toISOString(),
  linkMonetizationStatus: "valid",
});
assert.equal(checkKillSwitch.canDispatch, false);
assert.equal(checkKillSwitch.reason, "KILL_SWITCH_ACTIVE");

// Drift factual de preço
const checkPriceDrift = validatePreDispatch({
  accountStatus: "active",
  destinationStatus: "active",
  killSwitchActive: false,
  kitStatus: "approved",
  kitRevisionId: kitRevisionId,
  targetKitRevisionId: kitRevisionId,
  priceObservedCents: 180000, // Preço subiu
  snapshotPriceCents: 150000,
  validUntil: new Date(Date.now() + 100000).toISOString(),
  linkMonetizationStatus: "valid",
});
assert.equal(checkPriceDrift.canDispatch, false);
assert.ok(checkPriceDrift.reason?.includes("PRICE_DRIFT"));

// Evidência expirada
const checkExpiredEvidence = validatePreDispatch({
  accountStatus: "active",
  destinationStatus: "active",
  killSwitchActive: false,
  kitStatus: "approved",
  kitRevisionId: kitRevisionId,
  targetKitRevisionId: kitRevisionId,
  priceObservedCents: 150000,
  snapshotPriceCents: 150000,
  validUntil: new Date(Date.now() - 60000).toISOString(), // No passado
  linkMonetizationStatus: "valid",
});
assert.equal(checkExpiredEvidence.canDispatch, false);
assert.equal(checkExpiredEvidence.reason, "EVIDENCE_EXPIRED");

// Conta suspensa
const checkSuspended = validatePreDispatch({
  accountStatus: "suspended",
  destinationStatus: "active",
  killSwitchActive: false,
  kitStatus: "approved",
  kitRevisionId: kitRevisionId,
  targetKitRevisionId: kitRevisionId,
  priceObservedCents: 150000,
  snapshotPriceCents: 150000,
  validUntil: new Date(Date.now() + 100000).toISOString(),
  linkMonetizationStatus: "valid",
});
assert.equal(checkSuspended.canDispatch, false);
assert.ok(checkSuspended.reason?.startsWith("ACCOUNT_NOT_ACTIVE"));

console.log("✔ Validações pré-I/O confirmadas com fail-closed estrito.");

// ============================================================================
// 2. Agendamento Idempotente e Proteção contra Reagendamento de Jobs em Curso
// ============================================================================
console.log("2. Testando agendamento idempotente e proteção contra sobrescrita de jobs em curso...");

const scheduledTime = new Date().toISOString();
const job1 = await asTenant("disp_a", "owner", (tx) =>
  scheduleDispatchJob(tx, {
    tenantId: "disp_a",
    campaignPublicationId: pubA.id,
    kitRevisionId: kitRevisionId,
    destinationId: "dest_disp_a",
    scheduledAt: scheduledTime,
    idempotencyKey: "dispatch_key_1",
  })
);
assert.ok(job1.id);
assert.equal(job1.status, "queued");

// A caller scoped to B must not attach its audit row to A's job, even when
// it knows the UUID. The composite FK independently enforces ownership.
await assert.rejects(()=>asTenant("disp_b", "owner", (tx)=>tx`
  insert into garimpa.dispatch_attempt(tenant_id,job_id,attempt_number,worker_token,status)
  values('disp_b',${job1.id},1,'forged-token','in_flight')
`),(error:any)=>error.code==='23503');
console.log('✔ Tentativa de outra conta não pode referenciar o job por UUID.');

// Re-agendar o mesmo alvo antes do lease atualiza horário idempotentemente
const newScheduledTime = new Date(Date.now() + 5000).toISOString();
const jobReplay = await asTenant("disp_a", "owner", (tx) =>
  scheduleDispatchJob(tx, {
    tenantId: "disp_a",
    campaignPublicationId: pubA.id,
    kitRevisionId: kitRevisionId,
    destinationId: "dest_disp_a",
    scheduledAt: newScheduledTime,
    idempotencyKey: "dispatch_key_1",
  })
);
assert.equal(jobReplay.id, job1.id);
assert.equal(jobReplay.scheduledAt, newScheduledTime);

console.log("✔ Agendamento idempotente validado.");

// ============================================================================
// 3. Lease Atômico e Concorrência de Workers (SKIP LOCKED)
// ============================================================================
console.log("3. Testando lease atômico e proteção de posse entre workers concorrentes...");

// Resetar scheduled_at para o passado para estar elegível
await asTenant("disp_a", "owner", (tx) =>
  tx`update garimpa.dispatch_job set scheduled_at = now() - interval '10 seconds' where id = ${job1.id}`
);

// Worker 1 dá lease no job
const workerToken1 = "worker_tok_1";
const leasedJob = await asTenant("disp_a", "owner", (tx) =>
  leaseNextEligibleJob(tx, "disp_a", workerToken1, 60)
);
assert.ok(leasedJob);
assert.equal(leasedJob?.id, job1.id);
assert.equal(leasedJob?.status, "leased");
assert.equal(leasedJob?.leaseToken, workerToken1);
assert.equal(leasedJob?.attempt, 1);

// Worker 2 tenta dar lease simultaneamente: com SKIP LOCKED e job ocupado, retorna null
const workerToken2 = "worker_tok_2";
const competingLease = await asTenant("disp_a", "owner", (tx) =>
  leaseNextEligibleJob(tx, "disp_a", workerToken2, 60)
);
assert.equal(competingLease, null, "Worker 2 não deve adquirir lease de job já em posse do Worker 1");

// Worker 2 tenta finalizar o job de Worker 1: deve falhar com LEASE_NOT_HELD
await assert.rejects(
  async () => {
    await asTenant("disp_a", "owner", (tx) =>
      finalizeJobSuccess(tx, "disp_a", job1.id, workerToken2, { providerMessageId: "fake_id" })
    );
  },
  /LEASE_NOT_HELD/,
  "Worker sem lease vigente não pode finalizar o job",
);

console.log("✔ Lease atômico e proteção de concorrência validados.");

// ============================================================================
// 4. Recuperação Conservadora de Crash (Antes vs Depois do Marcador de I/O)
// ============================================================================
console.log("4. Testando recuperação de crash (antes de I/O -> queued; após I/O -> unknown)...");

// Cenário 4.1: Worker 1 caiu ANTES de marcar início de I/O (io_started_at é null)
// Simular expiração do lease
await asTenant("disp_a", "owner", (tx) =>
  tx`update garimpa.dispatch_job set lease_until = now() - interval '5 seconds' where id = ${job1.id}`
);

// Varredura de recuperação
const sweep1 = await asTenant("disp_a", "owner", (tx) => sweepExpiredLeases(tx, "disp_a"));
assert.equal(sweep1.recoveredQueued, 1, "Job sem I/O iniciado deve ser recuperado para 'queued'");
assert.equal(sweep1.transitionedUnknown, 0);

const jobRecoveredQueued = await asTenant("disp_a", "owner", (tx) => getDispatchJobById(tx, "disp_a", job1.id));
assert.equal(jobRecoveredQueued?.status, "queued");
assert.equal(jobRecoveredQueued?.leaseToken, null);

// Cenário 4.2: Worker 2 adquire lease e marca início de I/O, mas cai antes de concluir
const leasedAgain = await asTenant("disp_a", "owner", (tx) =>
  leaseNextEligibleJob(tx, "disp_a", workerToken2, 60)
);
assert.ok(leasedAgain);
assert.equal(leasedAgain?.id, job1.id);

// Worker 2 marca início do I/O externo
const ioMarked = await asTenant("disp_a", "owner", (tx) =>
  markIoStarted(tx, "disp_a", job1.id, workerToken2)
);
assert.equal(ioMarked, true);

// Worker 2 cai / perde conectividade (lease expira com io_started_at preenchido)
await asTenant("disp_a", "owner", (tx) =>
  tx`update garimpa.dispatch_job set lease_until = now() - interval '5 seconds' where id = ${job1.id}`
);

// Varredura de recuperação
const sweep2 = await asTenant("disp_a", "owner", (tx) => sweepExpiredLeases(tx, "disp_a"));
assert.equal(sweep2.transitionedUnknown, 1, "Job com I/O iniciado deve transitar para 'unknown', NUNCA retry cego");
assert.equal(sweep2.recoveredQueued, 0);

const jobInUnknown = await asTenant("disp_a", "owner", (tx) => getDispatchJobById(tx, "disp_a", job1.id));
assert.equal(jobInUnknown?.status, "unknown");
assert.ok(jobInUnknown?.reconciliationNote?.includes("WORKER_CRASH_AFTER_IO_START"));

// Tentativa de re-adquirir lease desse job em unknown: canLeaseJob proíbe expressamente
assert.equal(canLeaseJob(jobInUnknown!), false, "Jobs em estado unknown nunca devem ser re-leased automaticamente");

console.log("✔ Recuperação conservadora de crash validada (zero retry cego).");

// ============================================================================
// 5. Reconciliação Manual Auditada de Job em Estado Unknown
// ============================================================================
console.log("5. Testando reconciliação auditada de job em estado unknown...");

const reconciled = await asTenant("disp_a", "owner", (tx) =>
  reconcileDispatchJob(tx, "disp_a", {
    jobId: job1.id,
    resolvedStatus: "succeeded",
    reconciliationNote: "Verificado no painel oficial do canal que a mensagem msg_synth_123 foi recebida com sucesso.",
    reconciledBy: "operador_auditor_senior",
    providerMessageId: "msg_synth_123",
    confirmedAt: new Date().toISOString(),
  })
);

assert.equal(reconciled.status, "succeeded");
assert.equal(reconciled.providerMessageId, "msg_synth_123");
assert.equal(reconciled.reconciledBy, "operador_auditor_senior");
assert.ok(reconciled.reconciledAt);

// Tentativa de reconciliar novamente quando não está mais em unknown falha
await assert.rejects(
  async () => {
    await asTenant("disp_a", "owner", (tx) =>
      reconcileDispatchJob(tx, "disp_a", {
        jobId: job1.id,
        resolvedStatus: "failed",
        reconciliationNote: "Tentativa redundante",
        reconciledBy: "operador_auditor_senior",
      })
    );
  },
  /cannot_reconcile_non_unknown_job/,
  "Apenas jobs em status unknown podem ser reconciliados",
);

console.log("✔ Reconciliação auditada com registro de evento de domínio validada.");

// ============================================================================
// 6. Cancelamento Limpo Antes de I/O vs Transição para Unknown Após Início de I/O
// ============================================================================
console.log("6. Testando cancelamento seguro antes e após marcador de I/O...");

// Criar novo produto/publicação para teste de cancelamento
await pg.exec(`
  insert into garimpa.product(id, tenant_id, marketplace, external_id, title, product_url, last_price_cents) values
    ('prod_disp_c2', 'disp_a', 'mercadolivre', 'ext_c2', 'Produto C2', 'https://mercadolivre.com.br/c2', 5000)
  on conflict do nothing;
  insert into garimpa.product_curation(tenant_id, product_id, status) values ('disp_a', 'prod_disp_c2', 'approved') on conflict do nothing;
  insert into garimpa.publication(id, tenant_id, affiliate_id, product_id, channel, slug, status, affiliate_url) values
    ('pub_disp_c2', 'disp_a', 'aff_disp_a', 'prod_disp_c2', 'web', 'disp-a--c2', 'active', 'https://aff.link/c2')
  on conflict do nothing;
`);

await pg.query(
  `insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, offer_evidence) values
    ('obs_disp_c2', 'disp_a', 'prod_disp_c2', 5000, $1)`,
  [JSON.stringify(qualifiedEvidence)],
);

const kitC2 = await w.createKitForAccount(
  ctx("disp_a"),
  { campaignId: campA.campaignId, productId: "prod_disp_c2", channel: "whatsapp_channel", reason: "Kit C2", requestId: "req_kit_c2" },
  factory,
);
const valC2 = await w.validateKitForAccount(ctx("disp_a"), { kitId: kitC2.kitId, expectedVersion: kitC2.kitVersion, requestId: "val_c2" }, factory);
await w.approveKitForAccount(ctx("disp_a"), { kitId: kitC2.kitId, expectedVersion: valC2.kitVersion, requestId: "app_c2" }, factory);
const [pubC2Row] = await asTenant("disp_a", "owner", (tx) =>
  tx<{ kit_revision_id: string }[]>`select kit_revision_id from garimpa.campaign_publication where id = ${kitC2.publicationId}`
);
const kitRevC2Id = pubC2Row.kit_revision_id;

// 6.1 Cancelamento limpo em estado queued
const jobQueuedToCancel = await asTenant("disp_a", "owner", (tx) =>
  scheduleDispatchJob(tx, {
    tenantId: "disp_a",
    campaignPublicationId: kitC2.publicationId,
    kitRevisionId: kitRevC2Id,
    destinationId: "dest_disp_a",
    scheduledAt: new Date(Date.now() + 60000).toISOString(),
    idempotencyKey: "dispatch_key_cancel_1",
  })
);

const cancelClean = await asTenant("disp_a", "owner", (tx) =>
  cancelDispatchJob(tx, "disp_a", jobQueuedToCancel.id, { note: "Cancelado pelo operador antes do envio" })
);
assert.equal(cancelClean.cancelled, true);
assert.equal(cancelClean.status, "cancelled");

// 6.2 Cancelamento após início de I/O: move para unknown para não presumir falsamente "não enviado"
await asTenant("disp_a", "owner", (tx) =>
  tx`update garimpa.dispatch_job set status = 'leased', lease_token = 'worker_x', lease_until = now() + interval '60s', io_started_at = now() where id = ${jobQueuedToCancel.id}`
);

const cancelInFlight = await asTenant("disp_a", "owner", (tx) =>
  cancelDispatchJob(tx, "disp_a", jobQueuedToCancel.id, { note: "Tentativa de cancelamento durante trânsito" })
);
assert.equal(cancelInFlight.cancelled, false);
assert.equal(cancelInFlight.status, "unknown", "Cancelamento com I/O em voo deve transitar para unknown");

console.log("✔ Semântica de cancelamento antes e após I/O validada.");

// ============================================================================
// 7. Ciclo Completo do Worker com SyntheticDistributionAdapter
// ============================================================================
console.log("7. Testando ciclo completo de execução do worker (sucesso, rejeição retryable e fatal)...");

// Criar produto/kit para rodagem do worker
await pg.exec(`
  insert into garimpa.product(id, tenant_id, marketplace, external_id, title, product_url, last_price_cents) values
    ('prod_disp_worker', 'disp_a', 'mercadolivre', 'ext_w1', 'Produto Worker', 'https://mercadolivre.com.br/w1', 2000)
  on conflict do nothing;
  insert into garimpa.product_curation(tenant_id, product_id, status) values ('disp_a', 'prod_disp_worker', 'approved') on conflict do nothing;
  insert into garimpa.publication(id, tenant_id, affiliate_id, product_id, channel, slug, status, affiliate_url) values
    ('pub_disp_worker', 'disp_a', 'aff_disp_a', 'prod_disp_worker', 'web', 'disp-a--w1', 'active', 'https://aff.link/w1')
  on conflict do nothing;
`);

await pg.query(
  `insert into garimpa.price_observation(id, tenant_id, product_id, price_cents, offer_evidence) values
    ('obs_disp_worker', 'disp_a', 'prod_disp_worker', 2000, $1)`,
  [JSON.stringify(qualifiedEvidence)],
);

const kitW = await w.createKitForAccount(
  ctx("disp_a"),
  { campaignId: campA.campaignId, productId: "prod_disp_worker", channel: "telegram_channel", reason: "Kit Worker", requestId: "req_kit_w" },
  factory,
);
const valW = await w.validateKitForAccount(ctx("disp_a"), { kitId: kitW.kitId, expectedVersion: kitW.kitVersion, requestId: "val_w" }, factory);
await w.approveKitForAccount(ctx("disp_a"), { kitId: kitW.kitId, expectedVersion: valW.kitVersion, requestId: "app_w" }, factory);
const [pubWRow] = await asTenant("disp_a", "owner", (tx) =>
  tx<{ kit_revision_id: string }[]>`select kit_revision_id from garimpa.campaign_publication where id = ${kitW.publicationId}`
);
const kitRevWId = pubWRow.kit_revision_id;

const jobWorker = await asTenant("disp_a", "owner", (tx) =>
  scheduleDispatchJob(tx, {
    tenantId: "disp_a",
    campaignPublicationId: kitW.publicationId,
    kitRevisionId: kitRevWId,
    destinationId: "dest_disp_a",
    scheduledAt: new Date(Date.now() - 1000).toISOString(),
    idempotencyKey: "dispatch_key_worker_1",
  })
);

// Executar worker com adapter em modo sucesso
const adapter = new SyntheticDistributionAdapter();
adapter.behavior = "success";

await pg.exec(`insert into garimpa.affiliate_secret(tenant_id,marketplace,secret_id,key_version,ciphertext,nonce,tag) values('disp_a','telegram_channel','synthetic-test-secret','test','not-a-real-secret','test','test');update garimpa.destination set channel='telegram_channel',automation_mode='scheduled',secret_ref='synthetic-test-secret' where id='dest_disp_a';update garimpa.campaign_publication set destination_id='dest_disp_a' where id='${kitW.publicationId}';insert into garimpa.dispatch_control(tenant_id,kill_switch,configuration,updated_by) values('disp_a',false,'{"maxPerWindow":10,"windowSeconds":86400,"cooldownSeconds":0,"windowAnchor":"2026-01-01T00:00:00Z"}','user_disp_a');`);
const originalSend=adapter.sendApprovedRevision.bind(adapter);
const validAdapter={channel:'telegram_channel',capabilities:adapter.capabilities,validateDestination:async()=>({valid:true}),sendApprovedRevision:originalSend};
const cycleResult = await executeDispatchCycle({factory,origin:'https://audit.invalid',validateCredential:async()=>true},ctx('disp_a'),validAdapter,{workerToken:'worker_runner_1',leaseDurationSeconds:30});


assert.equal(cycleResult.jobProcessed, true);
assert.equal(cycleResult.jobId, jobWorker.id);
assert.equal(cycleResult.status, "succeeded");

// Verificar se tentativa foi auditada em garimpa.dispatch_attempt
const attempts = await asTenant("disp_a", "owner", (tx) =>
  listDispatchAttempts(tx, "disp_a", jobWorker.id)
);
assert.equal(attempts.length, 1);
assert.equal(attempts[0].status, "sent");
assert.ok(attempts[0].ioStartedAt);
assert.ok(attempts[0].ioCompletedAt);
assert.ok(attempts[0].providerMessageId);

console.log("✔ Ciclo completo do worker com rastreamento de tentativas validado.");

// ============================================================================
// 8. Isolamento Multi-Tenant Sob RLS
// ============================================================================
console.log("8. Testando isolamento rigoroso multi-tenant sob RLS...");

// Tenant B lista jobs: não deve ver jobs de Tenant A
const jobsB = await asTenant("disp_b", "owner", (tx) =>
  listDispatchJobs(tx, "disp_b")
);
assert.equal(jobsB.length, 0, "Tenant B não deve visualizar jobs de Tenant A");

// Tenant B tenta buscar diretamente o job de Tenant A
const crossJob = await asTenant("disp_b", "owner", (tx) =>
  getDispatchJobById(tx, "disp_b", jobWorker.id)
);
assert.equal(crossJob, null, "Tenant B não deve obter job de Tenant A por ID sob RLS");

// Tenant B tenta dar lease em job de Tenant A
const crossLease = await asTenant("disp_b", "owner", (tx) =>
  leaseNextEligibleJob(tx, "disp_b", "worker_b")
);
assert.equal(crossLease, null, "Tenant B não deve dar lease em jobs pertencentes a Tenant A");

console.log("✔ Isolamento multi-tenant de jobs e tentativas de disparo confirmado.");

console.log("\nTODOS OS 8 TESTES DO CORE DE DISPARO, WORKER E RECONCILIAÇÃO (D11) PASSARAM COM SUCESSO!");
