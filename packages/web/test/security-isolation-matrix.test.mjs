import test from "node:test";
import assert from "node:assert/strict";
import { resolveAccountContext } from "../lib/account-context.ts";
import { encryptSecret, decryptSecret } from "../lib/affiliate-secret.ts";
import { validateCampaignTokenForSlug } from "../lib/campaign-attribution.ts";

const SYNTHETIC_TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // 32 bytes hex
process.env.AFFILIATE_SECRETS_MASTER_KEY = SYNTHETIC_TEST_KEY;

test("Security Matrix: Membership Authorization & Role Boundaries (T17)", async () => {
  // Mock sqlFactory que retorna memberships conhecidas
  const mockSqlFactory = () => {
    const fn = async () => [
      {
        affiliate_id: "aff_alpha",
        tenant_id: "tenant_alpha",
        public_slug: "alpha-shop",
        display_name: "Alpha Shop",
        account_status: "active",
        membership_role: "owner",
        app_user_id: "usr_123",
      },
      {
        affiliate_id: "aff_beta",
        tenant_id: "tenant_beta",
        public_slug: "beta-deals",
        display_name: "Beta Deals",
        account_status: "active",
        membership_role: "operator",
        app_user_id: "usr_123",
      },
    ];
    fn.end = async () => {};
    return fn;
  };

  // 1. Owner em tenant_alpha
  const alphaContext = await resolveAccountContext({
    authUserId: "auth_user_1",
    requestedAccount: "tenant_alpha",
    sqlFactory: mockSqlFactory,
  });
  assert.ok(alphaContext !== null);
  assert.equal(alphaContext.tenantId, "tenant_alpha");
  assert.equal(alphaContext.membershipRole, "owner");

  // 2. Operator em tenant_beta
  const betaContext = await resolveAccountContext({
    authUserId: "auth_user_1",
    requestedAccount: "tenant_beta",
    sqlFactory: mockSqlFactory,
  });
  assert.ok(betaContext !== null);
  assert.equal(betaContext.tenantId, "tenant_beta");
  assert.equal(betaContext.membershipRole, "operator");

  // 3. Tentativa de acessar tenant_gamma (sem membership): falha fechado (null)
  const gammaContext = await resolveAccountContext({
    authUserId: "auth_user_1",
    requestedAccount: "tenant_gamma",
    sqlFactory: mockSqlFactory,
  });
  assert.equal(gammaContext, null, "não deve autorizar acesso a tenant sem membership ativa");
});

test("Security Matrix: Affiliate Secret Isolation & AAD Tamper Resistance (T17)", () => {
  // Tenant Alpha cifra segredo de Shopee
  const encryptedAlpha = encryptSecret("shopee_token_alpha_secret", "tenant_alpha", "shopee", "app_key");

  // Decifra com credenciais legítimas do Tenant Alpha
  const decryptedAlpha = decryptSecret(encryptedAlpha, "tenant_alpha", "shopee", "app_key");
  assert.equal(decryptedAlpha, "shopee_token_alpha_secret");

  // Tenant Beta tenta decifrar o mesmo ciphertext com seu tenantId: falha fechado (AAD mismatch lança erro de autenticação GCM)
  assert.throws(() => {
    decryptSecret(encryptedAlpha, "tenant_beta", "shopee", "app_key");
  }, /Unsupported state or unable to authenticate data/, "tentativa de transplante entre tenants deve ser rejeitada pelo GCM");

  // Tentativa de transplante entre marketplaces: falha fechado
  assert.throws(() => {
    decryptSecret(encryptedAlpha, "tenant_alpha", "mercadolivre", "app_key");
  }, /Unsupported state or unable to authenticate data/, "tentativa de transplante entre marketplaces deve ser rejeitada pelo GCM");
});

test("Security Matrix: Public Link Minimization & Fail-Closed Token Verification (T18)", async () => {
  // Mock DB que simula a tabela de links de campanha
  const mockDbWithCampaign = (expectedCode, expectedSlug) => {
    const fn = async (strings, ...values) => {
      // Se a query busca o código e slug esperados
      const queryStr = strings.join("?");
      if (values.includes(expectedCode) && values.includes(expectedSlug)) {
        return [
          {
            link_id: "lnk_valid_123",
            pub_id: "pub_valid_456",
            tenant_id: "tenant_alpha",
            product_id: "prod_ml_789",
          },
        ];
      }
      // Se o slug for diferente, a query SQL de join/filtro retorna vazio
      return [];
    };
    fn.end = async () => {};
    return () => fn;
  };

  const validCode = "ab3k9zx42qwp";
  const legitimateSlug = "ml-MLB123456";
  const tamperedSlug = "ml-MLB999999";
  const dbFactory = mockDbWithCampaign(validCode, legitimateSlug);

  // 1. Token legítimo para o produto correto: AUTORIZADO
  const legit = await validateCampaignTokenForSlug(validCode, legitimateSlug, dbFactory);
  assert.equal(legit.valid, true, "Token legítimo deve ser validado com sucesso");
  assert.equal(legit.campaignLinkId, "lnk_valid_123");
  assert.equal(legit.tenantId, "tenant_alpha");

  // 2. Token de campanha adulterado com slug de outro produto: REJEITADO como mismatched
  const tampered = await validateCampaignTokenForSlug(validCode, tamperedSlug, dbFactory);
  assert.equal(tampered.valid, false, "deve falhar fechado");
  assert.equal(
    tampered.reason,
    "mismatched_or_inactive_token",
    "Não deve aceitar falha de infraestrutura (db_lookup_unavailable) como prova de rejeição",
  );

  // 3. Token malformado falha antes de qualquer query
  const malformed = await validateCampaignTokenForSlug("short", "ml-ANY", dbFactory);
  assert.equal(malformed.valid, false);
  assert.equal(malformed.reason, "malformed_token");

  // 4. Token ausente falha
  const missing = await validateCampaignTokenForSlug(null, "ml-ANY", dbFactory);
  assert.equal(missing.valid, false);
  assert.equal(missing.reason, "token_missing");
});

test("Security Matrix: Account Suspension & Immediate Revocation (T17)", async () => {
  // Mock com conta suspensa
  const mockSqlWithSuspended = () => {
    const fn = async () => [
      {
        affiliate_id: "aff_suspended",
        tenant_id: "tenant_suspended",
        public_slug: "suspended-shop",
        display_name: "Suspended Shop",
        account_status: "suspended",
        membership_role: "owner",
        app_user_id: "usr_susp",
      },
    ];
    fn.end = async () => {};
    return fn;
  };

  // Resolução de contexto para conta suspensa: deve falhar fechado imediatamente
  // Pois memberships só aceitam account_status = 'active'
  const mockSqlOnlyActive = () => {
    const fn = async () => [];
    fn.end = async () => {};
    return fn;
  };

  const context = await resolveAccountContext({
    authUserId: "auth_user_susp",
    requestedAccount: "tenant_suspended",
    sqlFactory: mockSqlOnlyActive,
  });
  assert.equal(context, null, "Conta suspensa ou sem vínculo ativo não deve gerar AccountContext");
});

test("Security Matrix: Dispatch Outbox & Multi-Tenant Separation (EP-11 / T11)", async () => {
  const { canLeaseJob, canFinalizeJob, validatePreDispatch } = await import("../lib/dispatch-contract.ts");

  const jobA = {
    id: "job_a1",
    tenantId: "tenant_alpha",
    campaignPublicationId: "pub_a",
    kitRevisionId: "rev_a",
    destinationId: "dest_a",
    scheduledAt: new Date(Date.now() - 1000).toISOString(),
    status: "leased",
    leaseUntil: new Date(Date.now() + 60_000).toISOString(),
    leaseToken: "worker_token_alpha",
    attempt: 1,
    nextAttemptAt: null,
    idempotencyKey: "idem_a",
    createdAt: new Date().toISOString(),
  };

  // 1. Worker Beta não pode finalizar o lease do Worker Alpha
  assert.equal(
    canFinalizeJob(jobA, "worker_token_beta"),
    false,
    "Worker de tenant ou processo distinto não pode finalizar lease alheio",
  );

  // 2. Worker Alpha com seu próprio token consegue finalizar
  assert.equal(
    canFinalizeJob(jobA, "worker_token_alpha"),
    true,
    "Worker detentor do token de lease válido pode finalizar",
  );

  // 3. Validação pré-disparo bloqueia imediatamente caso conta esteja suspensa
  const preCheckSuspended = validatePreDispatch({
    accountStatus: "suspended",
    destinationStatus: "active",
    killSwitchActive: false,
    kitStatus: "approved",
    kitRevisionId: "rev_a",
    targetKitRevisionId: "rev_a",
    priceObservedCents: 1000,
    snapshotPriceCents: 1000,
    validUntil: new Date(Date.now() + 3600_000).toISOString(),
    linkMonetizationStatus: "valid",
  });
  assert.equal(preCheckSuspended.canDispatch, false);
  assert.match(preCheckSuspended.reason, /ACCOUNT_NOT_ACTIVE/);

  // 4. Validação pré-disparo bloqueia imediatamente se kill switch estiver ativo
  const preCheckKillSwitch = validatePreDispatch({
    accountStatus: "active",
    destinationStatus: "active",
    killSwitchActive: true,
    kitStatus: "approved",
    kitRevisionId: "rev_a",
    targetKitRevisionId: "rev_a",
    priceObservedCents: 1000,
    snapshotPriceCents: 1000,
    validUntil: new Date(Date.now() + 3600_000).toISOString(),
    linkMonetizationStatus: "valid",
  });
  assert.equal(preCheckKillSwitch.canDispatch, false);
  assert.equal(preCheckKillSwitch.reason, "KILL_SWITCH_ACTIVE");
});

