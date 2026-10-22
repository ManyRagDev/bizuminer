import test from "node:test";
import assert from "node:assert/strict";
import {
  canLeaseJob,
  canFinalizeJob,
  computeNextAttempt,
  reconcileUnknownJob,
  validatePreDispatch,
  checkRateLimitAndCooldown,
  SyntheticDistributionAdapter,
} from "../lib/dispatch-contract.ts";

test("EP-11 Dispatch: validatePreDispatch strictly blocks unverified conditions before I/O", () => {
  const baseParams = {
    accountStatus: "active",
    destinationStatus: "active",
    killSwitchActive: false,
    kitStatus: "approved",
    kitRevisionId: "rev_1",
    targetKitRevisionId: "rev_1",
    priceObservedCents: 10000,
    snapshotPriceCents: 10000,
    validUntil: new Date(Date.now() + 3600_000).toISOString(),
    linkMonetizationStatus: "valid",
    now: new Date(),
  };

  // 1. Success case
  assert.deepEqual(validatePreDispatch(baseParams), { canDispatch: true });

  // 2. Suspended account
  assert.equal(
    validatePreDispatch({ ...baseParams, accountStatus: "suspended" }).canDispatch,
    false,
  );
  assert.match(
    validatePreDispatch({ ...baseParams, accountStatus: "suspended" }).reason,
    /ACCOUNT_NOT_ACTIVE/,
  );

  // 3. Kill switch active
  assert.equal(
    validatePreDispatch({ ...baseParams, killSwitchActive: true }).canDispatch,
    false,
  );
  assert.equal(
    validatePreDispatch({ ...baseParams, killSwitchActive: true }).reason,
    "KILL_SWITCH_ACTIVE",
  );

  // 4. Inactive destination
  assert.equal(
    validatePreDispatch({ ...baseParams, destinationStatus: "suspended" }).canDispatch,
    false,
  );

  // 5. Unapproved kit
  assert.equal(
    validatePreDispatch({ ...baseParams, kitStatus: "draft" }).canDispatch,
    false,
  );

  // 6. Superseded revision
  assert.equal(
    validatePreDispatch({ ...baseParams, kitRevisionId: "rev_2" }).canDispatch,
    false,
  );

  // 7. Price drift
  assert.equal(
    validatePreDispatch({ ...baseParams, priceObservedCents: 12000 }).canDispatch,
    false,
  );
  assert.match(
    validatePreDispatch({ ...baseParams, priceObservedCents: 12000 }).reason,
    /PRICE_DRIFT/,
  );

  // 8. Expired evidence
  assert.equal(
    validatePreDispatch({
      ...baseParams,
      validUntil: new Date(Date.now() - 1000).toISOString(),
    }).canDispatch,
    false,
  );

  // 9. Malformed date fails closed
  assert.equal(
    validatePreDispatch({ ...baseParams, validUntil: "invalid" }).canDispatch,
    false,
  );
  assert.equal(
    validatePreDispatch({ ...baseParams, validUntil: "invalid" }).reason,
    "INVALID_VALID_UNTIL",
  );
  assert.equal(
    validatePreDispatch({
      ...baseParams,
      validUntil: new Date(Date.now() - 1000).toISOString(),
    }).reason,
    "EVIDENCE_EXPIRED",
  );

  // 9. Invalid campaign monetization link
  assert.equal(
    validatePreDispatch({ ...baseParams, linkMonetizationStatus: "invalid" }).canDispatch,
    false,
  );
  assert.match(
    validatePreDispatch({ ...baseParams, linkMonetizationStatus: "invalid" }).reason,
    /LINK_INVALID/,
  );
});

test("EP-11 Dispatch: lease rules and protection against concurrent worker theft", () => {
  const now = new Date("2026-10-14T12:00:00Z");

  const queuedJob = {
    id: "job_1",
    tenantId: "tenant_a",
    campaignPublicationId: "pub_1",
    kitRevisionId: "rev_1",
    destinationId: "dest_1",
    scheduledAt: "2026-10-14T11:59:00Z",
    status: "queued",
    leaseUntil: null,
    leaseToken: null,
    attempt: 0,
    nextAttemptAt: null,
    idempotencyKey: "idem_1",
    createdAt: "2026-10-14T11:00:00Z",
  };

  // Eligible queued job
  assert.equal(canLeaseJob(queuedJob, now), true);

  // Future scheduled job is not eligible yet
  const futureJob = {
    ...queuedJob,
    scheduledAt: "2026-10-14T12:05:00Z",
  };
  assert.equal(canLeaseJob(futureJob, now), false);

  // Active leased job cannot be leased by second worker
  const activeLeasedJob = {
    ...queuedJob,
    status: "leased",
    leaseToken: "worker_1",
    leaseUntil: "2026-10-14T12:02:00Z",
  };
  assert.equal(canLeaseJob(activeLeasedJob, now), false);

  // Expired lease CAN be leased by a second worker
  const expiredLeasedJob = {
    ...queuedJob,
    status: "leased",
    leaseToken: "worker_1",
    leaseUntil: "2026-10-14T11:58:00Z",
  };
  assert.equal(canLeaseJob(expiredLeasedJob, now), true);

  // Finalize check: worker with wrong token cannot finalize
  assert.equal(canFinalizeJob(activeLeasedJob, "worker_2"), false);
  assert.equal(canFinalizeJob(activeLeasedJob, "worker_1"), true);
});

test("EP-11 Dispatch: unknown status handling, retry limits and reconciliation", () => {
  const baseJob = {
    id: "job_unk",
    tenantId: "tenant_a",
    campaignPublicationId: "pub_1",
    kitRevisionId: "rev_1",
    destinationId: "dest_1",
    scheduledAt: "2026-10-14T11:00:00Z",
    status: "unknown",
    leaseUntil: null,
    leaseToken: null,
    attempt: 1,
    nextAttemptAt: null,
    idempotencyKey: "idem_unk",
    createdAt: "2026-10-14T10:00:00Z",
  };

  // A job in unknown status is NEVER blindly re-leased
  assert.equal(canLeaseJob(baseJob, new Date()), false);

  // Reconciliation with provider confirmation
  const sentReconciliation = reconcileUnknownJob(baseJob, {
    kind: "sent",
    providerMessageId: "msg_external_123",
    confirmedAt: new Date().toISOString(),
  });
  assert.equal(sentReconciliation.resolvedStatus, "succeeded");
  assert.match(sentReconciliation.note, /Confirmed sent with provider message ID/);

  // Reconciliation with provider rejection
  const rejectedReconciliation = reconcileUnknownJob(baseJob, {
    kind: "rejected",
    code: "NOT_DELIVERED",
    retryable: false,
  });
  assert.equal(rejectedReconciliation.resolvedStatus, "failed");

  // Reconciliation inconclusive
  const inconclusive = reconcileUnknownJob(baseJob, null);
  assert.equal(inconclusive.resolvedStatus, "unknown");

  // Retry computation
  const retryableResult = {
    kind: "rejected",
    code: "NETWORK_TEMPORARY",
    retryable: true,
    retryAfterSeconds: 45,
  };
  const nextAttempt = computeNextAttempt(
    { ...baseJob, attempt: 1 },
    retryableResult,
    3,
    new Date("2026-10-14T12:00:00Z"),
    () => 0.5,
  );
  assert.equal(nextAttempt.nextStatus, "queued");
  assert.equal(nextAttempt.nextAttemptAt, "2026-10-14T12:01:06.000Z");

  // Max attempts exceeded -> fatal fail
  const maxAttemptReached = computeNextAttempt(
    { ...baseJob, attempt: 3 },
    retryableResult,
    3,
    new Date("2026-10-14T12:00:00Z"),
  );
  assert.equal(maxAttemptReached.nextStatus, "failed");
});

test("EP-11 Dispatch: rate limiting and destination cooldown checks", () => {
  const now = new Date("2026-10-14T12:00:00Z");

  // Under limit and no cooldown
  const ok = checkRateLimitAndCooldown({
    lastDispatchedAt: "2026-10-14T11:45:00Z",
    minIntervalSeconds: 60,
    currentHourlyCount: 5,
    maxHourlyCount: 20,
    now,
  });
  assert.equal(ok.allowed, true);

  // Hourly quota exceeded
  const quotaHit = checkRateLimitAndCooldown({
    lastDispatchedAt: "2026-10-14T11:45:00Z",
    minIntervalSeconds: 60,
    currentHourlyCount: 20,
    maxHourlyCount: 20,
    now,
  });
  assert.equal(quotaHit.allowed, false);
  assert.match(quotaHit.reason, /HOURLY_QUOTA_EXCEEDED/);

  // Cooldown active (only 20s passed, 60s required)
  const cooldownHit = checkRateLimitAndCooldown({
    lastDispatchedAt: "2026-10-14T11:59:40Z",
    minIntervalSeconds: 60,
    currentHourlyCount: 5,
    maxHourlyCount: 20,
    now,
  });
  assert.equal(cooldownHit.allowed, false);
  assert.equal(cooldownHit.waitSeconds, 40);
  assert.match(cooldownHit.reason, /COOLDOWN_ACTIVE/);
});

test("EP-11 Dispatch: SyntheticDistributionAdapter implements full provider lifecycle safely", async () => {
  const adapter = new SyntheticDistributionAdapter();

  // Validate destination
  const valid = await adapter.validateDestination("+5511999999999");
  assert.equal(valid.valid, true);

  const invalid = await adapter.validateDestination("invalid-destination");
  assert.equal(invalid.valid, false);

  // 1. Success dispatch
  adapter.behavior = "success";
  const sentRes = await adapter.sendApprovedRevision({
    destination: { id: "dest_1", targetRef: "+5511999999999" },
    text: "Promoção exclusiva",
    link: "https://bizuminer.com.br/p/abcdef123456",
    idempotencyKey: "test_idem_1",
  });
  assert.equal(sentRes.kind, "sent");
  assert.match(sentRes.providerMessageId, /^msg_synth_/);

  // Reconcile status of sent message
  const reconciled = await adapter.reconcileStatus(sentRes.providerMessageId);
  assert.equal(reconciled?.kind, "sent");

  // 2. Timeout unknown behavior (transport fails after connect)
  adapter.behavior = "timeout_unknown";
  const unkRes = await adapter.sendApprovedRevision({
    destination: { id: "dest_1", targetRef: "+5511999999999" },
    text: "Promoção exclusiva",
    link: "https://bizuminer.com.br/p/abcdef123456",
    idempotencyKey: "test_idem_2",
  });
  assert.equal(unkRes.kind, "unknown");
  assert.match(unkRes.reason, /TRANSPORT_TIMEOUT/);
});

test("BUG-008: retry grows exponentially, includes bounded jitter and respects provider floor",()=>{
  const now=new Date("2026-10-14T12:00:00Z"), result={kind:"rejected",code:"429",retryable:true,retryAfterSeconds:30};
  const delay=(attempt,random=()=>0.5,r=result)=>Date.parse(computeNextAttempt({attempt},r,3,now,random).nextAttemptAt)-now.getTime();
  assert.equal(delay(1),66000);assert.equal(delay(2),132000);
  assert.equal(delay(1,()=>0),60000);assert.equal(delay(1,()=>1),72000);
  assert.equal(delay(1,()=>0,{...result,retryAfterSeconds:300}),300000);
  assert.equal(computeNextAttempt({attempt:3},result,3,now).nextStatus,"failed");
});
