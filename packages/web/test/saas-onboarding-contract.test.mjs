import test from "node:test";
import assert from "node:assert/strict";
import {
  validateEntitlementQuota,
  canCompleteOnboardingStep,
  ONBOARDING_STEPS,
  validateAccountInvitation,
  validateMembershipRole,
} from "../lib/saas-onboarding-contract.ts";

const pilotEntitlement = {
  id: "ent-1",
  tenantId: "tenant_beta",
  affiliateId: "aff_beta",
  planVersion: "pilot-v1",
  status: "pilot",
  startsAt: "2026-10-01T00:00:00Z",
  limits: {
    maxActiveCampaigns: 3,
    maxDailyKits: 5,
    allowedMarketplaces: ["mercadolivre", "shopee"],
  },
  termsRef: "pilot-terms-v1",
};

test("validateEntitlementQuota blocks suspended accounts and enforces quotas", () => {
  // 1. Sem entitlement: bloqueado
  const noEnt = validateEntitlementQuota({
    entitlement: null,
    operation: "create_campaign",
  });
  assert.equal(noEnt.allowed, false);

  // 2. Conta suspensa: bloqueado
  const suspended = validateEntitlementQuota({
    entitlement: { ...pilotEntitlement, status: "suspended" },
    operation: "create_campaign",
  });
  assert.equal(suspended.allowed, false);
  assert.ok(suspended.reason.includes("suspensa"));

  // 3. Quota de campanhas excedida
  const overCampaigns = validateEntitlementQuota({
    entitlement: pilotEntitlement,
    operation: "create_campaign",
    currentActiveCampaigns: 3,
  });
  assert.equal(overCampaigns.allowed, false);
  assert.ok(overCampaigns.reason.includes("Limite de campanhas"));

  // 4. Quota de kits diários excedida
  const overKits = validateEntitlementQuota({
    entitlement: pilotEntitlement,
    operation: "create_kit",
    todayKitsCount: 5,
  });
  assert.equal(overKits.allowed, false);
  assert.ok(overKits.reason.includes("Limite diário de kits"));

  // 5. Marketplace não autorizado
  const forbiddenMp = validateEntitlementQuota({
    entitlement: pilotEntitlement,
    operation: "use_marketplace",
    marketplace: "amazon",
  });
  assert.equal(forbiddenMp.allowed, false);
  assert.ok(forbiddenMp.reason.includes("não habilitado"));

  // 6. Operações dentro da quota: autorizadas
  const allowedOp = validateEntitlementQuota({
    entitlement: pilotEntitlement,
    operation: "create_campaign",
    currentActiveCampaigns: 1,
  });
  assert.equal(allowedOp.allowed, true);
});

test("canCompleteOnboardingStep enforces sequential progress", () => {
  assert.deepEqual(ONBOARDING_STEPS, [
    "account_created",
    "marketplace_credentials_configured",
    "test_link_verified",
    "audience_policy_configured",
    "first_campaign_created",
    "first_kit_approved",
    "first_publication_confirmed",
  ]);

  // Primeiro passo pode ser concluído imediatamente
  const step1 = canCompleteOnboardingStep([], "account_created");
  assert.equal(step1.canComplete, true);

  // Segundo passo sem o primeiro: bloqueado
  const step2Without1 = canCompleteOnboardingStep([], "marketplace_credentials_configured");
  assert.equal(step2Without1.canComplete, false);
  assert.equal(step2Without1.blockerStep, "account_created");

  // Segundo passo com o primeiro: permitido
  const step2With1 = canCompleteOnboardingStep(["account_created"], "marketplace_credentials_configured");
  assert.equal(step2With1.canComplete, true);
});

test("validateAccountInvitation rejects cross-tenant, expired, or already used invitations", () => {
  const validInv = {
    id: "inv_1",
    tenantId: "tenant_beta",
    invitedEmail: "operator@beta.com",
    role: "operator",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    usedAt: null,
  };

  // 1. Convite válido para o mesmo tenant
  const valid = validateAccountInvitation({
    invitation: validInv,
    requestingTenantId: "tenant_beta",
  });
  assert.equal(valid.valid, true);

  // 2. Convite de outro tenant: REJEITADO
  const crossTenant = validateAccountInvitation({
    invitation: validInv,
    requestingTenantId: "tenant_alpha",
  });
  assert.equal(crossTenant.valid, false);
  assert.equal(crossTenant.reason, "CROSS_TENANT_INVITATION_REJECTED");

  // 3. Convite já utilizado: REJEITADO
  const used = validateAccountInvitation({
    invitation: { ...validInv, usedAt: new Date().toISOString() },
    requestingTenantId: "tenant_beta",
  });
  assert.equal(used.valid, false);
  assert.equal(used.reason, "INVITATION_ALREADY_USED");

  // 4. Convite expirado: REJEITADO
  const expired = validateAccountInvitation({
    invitation: { ...validInv, expiresAt: new Date(Date.now() - 1000).toISOString() },
    requestingTenantId: "tenant_beta",
  });
  assert.equal(expired.valid, false);
  assert.equal(expired.reason, "INVITATION_EXPIRED");

  // 4b. Data de expiração inválida: REJEITADO (fail-closed)
  const invalidExp = validateAccountInvitation({
    invitation: { ...validInv, expiresAt: "invalid" },
    requestingTenantId: "tenant_beta",
  });
  assert.equal(invalidExp.valid, false);
  assert.equal(invalidExp.reason, "INVALID_EXPIRES_AT");

  // 4c. Entitlement com período vencido: REJEITADO
  const expiredPeriod = validateEntitlementQuota({
    entitlement: {
      ...pilotEntitlement,
      endsAt: "2020-01-01T00:00:00Z",
    },
    operation: "create_campaign",
    now: new Date("2026-10-14T00:00:00Z"),
  });
  assert.equal(expiredPeriod.allowed, false);

  // 4d. Limites ausentes não assumem defaults arbitrários: REJEITADO
  const unconfigured = validateEntitlementQuota({
    entitlement: {
      ...pilotEntitlement,
      limits: {},
    },
    operation: "create_campaign",
  });
  assert.equal(unconfigured.allowed, false);

  // 5. Validação de papéis: impede autopromoção para role de plataforma
  assert.equal(validateMembershipRole("owner").allowed, true);
  assert.equal(validateMembershipRole("operator").allowed, true);
  assert.equal(validateMembershipRole("admin").allowed, false);
  assert.equal(validateMembershipRole("superadmin").allowed, false);
  assert.match(validateMembershipRole("admin").reason, /FORBIDDEN_ROLE/);
});

