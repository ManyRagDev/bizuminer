import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAccountInvitation,
  validateEntitlementQuota,
  canCompleteOnboardingStep,
  validateMembershipRole,
} from "../lib/saas-onboarding-contract.ts";
import {
  buildMetricResult,
} from "../lib/experiment-contract.ts";

test("AC-18.1: validateAccountInvitation detects cross-tenant, already used, and expired invitations", () => {
  const now = new Date("2026-10-15T12:00:00Z");

  const validInvitation = {
    id: "inv_123",
    tenantId: "tenant_new",
    invitedEmail: "affiliate@example.com",
    role: "owner",
    expiresAt: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(), // 24h future
    usedAt: null,
  };

  // 1. Valid invitation accepts cleanly
  const validCheck = validateAccountInvitation({
    invitation: validInvitation,
    requestingTenantId: "tenant_new",
    now,
  });
  assert.equal(validCheck.valid, true);

  // 2. Cross-tenant invitation rejected
  const crossTenantCheck = validateAccountInvitation({
    invitation: validInvitation,
    requestingTenantId: "tenant_other",
    now,
  });
  assert.equal(crossTenantCheck.valid, false);
  assert.equal(crossTenantCheck.reason, "CROSS_TENANT_INVITATION_REJECTED");

  // 3. Replay protection: already used invitation
  const usedCheck = validateAccountInvitation({
    invitation: {
      ...validInvitation,
      usedAt: "2026-10-15T10:00:00Z",
    },
    requestingTenantId: "tenant_new",
    now,
  });
  assert.equal(usedCheck.valid, false);
  assert.equal(usedCheck.reason, "INVITATION_ALREADY_USED");

  // 4. Expired token
  const expiredCheck = validateAccountInvitation({
    invitation: {
      ...validInvitation,
      expiresAt: new Date(now.getTime() - 3600 * 1000).toISOString(), // 1h ago
    },
    requestingTenantId: "tenant_new",
    now,
  });
  assert.equal(expiredCheck.valid, false);
  assert.equal(expiredCheck.reason, "INVITATION_EXPIRED");
});

test("AC-18.2: validateEntitlementQuota strictly enforces campaign limit of 10", () => {
  const activePlan = {
    id: "ent_plan_standard",
    tenantId: "tenant_growth",
    affiliateId: "aff_growth",
    planVersion: "plan-growth-v1",
    status: "active",
    startsAt: "2026-10-01T00:00:00Z",
    endsAt: null,
    limits: {
      maxActiveCampaigns: 10,
      maxDailyKits: 20,
      allowedMarketplaces: ["shopee", "mercadolivre"],
    },
    termsRef: "terms-v1-approved",
  };

  // 1. At 9 campaigns -> 10th is allowed
  const check9 = validateEntitlementQuota({
    entitlement: activePlan,
    operation: "create_campaign",
    currentActiveCampaigns: 9,
  });
  assert.equal(check9.allowed, true);

  // 2. At 10 campaigns -> 11th is rejected with quota exceeded
  const check10 = validateEntitlementQuota({
    entitlement: activePlan,
    operation: "create_campaign",
    currentActiveCampaigns: 10,
  });
  assert.equal(check10.allowed, false);
  assert.ok(check10.reason?.includes("Limite"));
});

test("AC-18.3: Suspended account fails closed immediately across operations", () => {
  const suspendedEntitlement = {
    id: "ent_suspended",
    tenantId: "tenant_bad",
    affiliateId: "aff_bad",
    planVersion: "plan-growth-v1",
    status: "suspended",
    startsAt: "2026-10-01T00:00:00Z",
    endsAt: null,
    limits: {
      maxActiveCampaigns: 100,
      maxDailyKits: 100,
    },
    termsRef: "terms-v1-approved",
  };

  const campCheck = validateEntitlementQuota({
    entitlement: suspendedEntitlement,
    operation: "create_campaign",
    currentActiveCampaigns: 0,
  });
  assert.equal(campCheck.allowed, false);
  assert.ok(campCheck.reason?.includes("suspensa"));

  const kitCheck = validateEntitlementQuota({
    entitlement: suspendedEntitlement,
    operation: "create_kit",
    todayKitsCount: 0,
  });
  assert.equal(kitCheck.allowed, false);
  assert.ok(kitCheck.reason?.includes("suspensa"));
});

test("AC-18.4: Policy experiment metrics enforce frozen methodology and handle division by zero honestly", () => {
  // 1. Metric with zero impressions does not invent CTR
  const zeroMetric = buildMetricResult({
    key: "ctr",
    numerator: 5,
    denominator: 0,
    unit: "percent",
    source: "garimpa.click_event",
    windowStart: "2026-10-01T00:00:00Z",
    windowEnd: "2026-10-15T00:00:00Z",
    cohortDefinition: "all_active_audiences",
    sampleSize: 0,
    policyVersions: ["v1", "v2"],
  });

  assert.equal(zeroMetric.value, null);
  assert.ok(zeroMetric.limitations.some((l) => l.includes("zero")));

  // 2. Valid paired metric calculation (25/500 = 5%)
  const validMetric = buildMetricResult({
    key: "conversion_rate",
    numerator: 25,
    denominator: 500,
    unit: "percent",
    source: "garimpa.campaign_order",
    windowStart: "2026-10-01T00:00:00Z",
    windowEnd: "2026-10-15T00:00:00Z",
    cohortDefinition: "paired_test_cohort",
    sampleSize: 500,
    policyVersions: ["v1", "v2-candidate"],
  });

  assert.equal(validMetric.value, 5);
  assert.equal(validMetric.sampleSize, 500);
  assert.equal(validMetric.limitations.length, 0);
});

test("Sequential onboarding steps enforce prerequisite ordering", () => {
  // Step 1: marketplace_credentials_configured requires account_created
  const step1WithoutPrereq = canCompleteOnboardingStep([], "marketplace_credentials_configured");
  assert.equal(step1WithoutPrereq.canComplete, false);
  assert.equal(step1WithoutPrereq.blockerStep, "account_created");

  const step1WithPrereq = canCompleteOnboardingStep(["account_created"], "marketplace_credentials_configured");
  assert.equal(step1WithPrereq.canComplete, true);

  // Step 5: first_campaign_created requires all prior steps up to audience_policy_configured
  const step5WithoutAudience = canCompleteOnboardingStep(
    [
      "account_created",
      "marketplace_credentials_configured",
      "test_link_verified",
    ],
    "first_campaign_created",
  );
  assert.equal(step5WithoutAudience.canComplete, false);
  assert.equal(step5WithoutAudience.blockerStep, "audience_policy_configured");

  const step5Complete = canCompleteOnboardingStep(
    [
      "account_created",
      "marketplace_credentials_configured",
      "test_link_verified",
      "audience_policy_configured",
    ],
    "first_campaign_created",
  );
  assert.equal(step5Complete.canComplete, true);
});
