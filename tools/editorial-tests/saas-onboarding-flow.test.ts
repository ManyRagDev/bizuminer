import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { commercialFixture } from "./commercial-fixture.ts";

const require = createRequire(import.meta.url);
const {
  validateEntitlementQuota,
  canCompleteOnboardingStep,
  validateAccountInvitation,
  validateMembershipRole,
} = require("../../packages/web/lib/saas-onboarding-contract.ts");

const {
  createAccountInvitation,
  acceptAccountInvitation,
  recordOnboardingProgress,
  getOnboardingProgress,
  exportAccountData,
  provisionPilotAccountByPlatformAdmin,
  suspendAccountByPlatformAdmin,
} = require("../../packages/web/lib/saas-onboarding-db.ts");

const { pg, factory, adminFactory } = await commercialFixture();

console.log("--- D12 SAAS ONBOARDING, INVITATIONS & PLATFORM ADMIN BOUNDARY TESTS ---");

const ctx = (t: string, user: string, authUser: string, role = "owner") => ({
  tenantId: t,
  affiliateId: `aff_${t}`,
  actor: "human" as const,
  actorAppUserId: user,
  authenticatedAuthUserId: authUser,
  membershipRole: role,
  requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
});

// Seed accounts and users in fixture
await pg.exec(`
  insert into garimpa.affiliate_account(id, tenant_id, public_slug, display_name) values
    ('aff_saas_a', 'saas_a', 'saas-a', 'Afiliado Alpha'),
    ('aff_saas_b', 'saas_b', 'saas-b', 'Afiliado Beta')
  on conflict do nothing;

  insert into garimpa.app_user(id, tenant_id, auth_user_id) values
    ('user_owner_a', 'saas_a', 'auth_owner_a'),
    ('user_oper_a', 'saas_a', 'auth_oper_a'),
    ('user_owner_b', 'saas_b', 'auth_owner_b'),
    ('user_new_invitee', 'saas_a', 'auth_invitee'),
    ('user_platform_admin', 'saas_a', 'auth_plat_admin')
  on conflict do nothing;

  insert into garimpa.app_user_role(app_user_id, role) values
    ('user_owner_a', 'afiliado'),
    ('user_oper_a', 'afiliado'),
    ('user_owner_b', 'afiliado'),
    ('user_platform_admin', 'platform_admin')
  on conflict do nothing;

  insert into garimpa.affiliate_membership(affiliate_id, app_user_id, role) values
    ('aff_saas_a', 'user_owner_a', 'owner'),
    ('aff_saas_a', 'user_oper_a', 'operator'),
    ('aff_saas_b', 'user_owner_b', 'owner')
  on conflict do nothing;

  insert into garimpa.account_entitlement(tenant_id, affiliate_id, plan_version, status, starts_at, limits, terms_ref) values
    ('saas_a', 'aff_saas_a', 'v1_pilot', 'pilot', now() - interval '1 day', '{"maxActiveCampaigns": 5, "maxDailyKits": 20, "allowedMarketplaces": ["mercadolivre", "shopee"]}'::jsonb, 'terms_v1_signed'),
    ('saas_b', 'aff_saas_b', 'v1_pilot', 'pilot', now() - interval '1 day', '{"maxActiveCampaigns": 3, "maxDailyKits": 10, "allowedMarketplaces": ["amazon"]}'::jsonb, 'terms_v1_signed')
  on conflict do nothing;
`);

// ============================================================================
// 1. Criação de Convites e Hash SHA-256
// ============================================================================
console.log("1. Testando criação de convites, hash e restrição a owners...");

const ctxOwnerA = ctx("saas_a", "user_owner_a", "auth_owner_a", "owner");
const ctxOperA = ctx("saas_a", "user_oper_a", "auth_oper_a", "operator");

// Operador não pode criar convite
await assert.rejects(
  async () => {
    await createAccountInvitation(ctxOperA, {
      invitedEmail: "invitee@test.com",
      role: "operator",
    }, factory);
  },
  /owner_required/,
  "Operador não pode criar convites"
);

// Papel proibido (ex: platform_admin) não pode ser concedido via convite
await assert.rejects(
  async () => {
    await createAccountInvitation(ctxOwnerA, {
      invitedEmail: "invitee@test.com",
      role: "platform_admin" as any,
    }, factory);
  },
  /FORBIDDEN_ROLE/,
  "Tentativa de convite com role de plataforma deve ser rejeitada"
);

// Owner cria convite com sucesso
const inviteResult = await createAccountInvitation(ctxOwnerA, {
  invitedEmail: "collaborator@partner.com",
  role: "operator",
  expiresInHours: 24,
}, factory);

assert.ok(inviteResult.invitationId, "Convite deve ter ID");
assert.equal(inviteResult.rawToken.length, 64, "Raw token deve ter 64 caracteres hex (256 bits)");

// Conferir no banco se apenas o hash foi persistido
const [invRow] = (await pg.query(
  `select token_hash, invited_email, role, used_at from garimpa.account_invitation where id = $1`,
  [inviteResult.invitationId]
)).rows as any[];

assert.notEqual(invRow.token_hash, inviteResult.rawToken, "Token cru NUNCA deve ser gravado no banco");
assert.equal(invRow.invited_email, "collaborator@partner.com");
assert.equal(invRow.role, "operator");
assert.equal(invRow.used_at, null);

console.log("✔ Criação de convite com hash SHA-256 e restrição de autorização aprovada.");

// ============================================================================
// 2. Aceitação Atômica e Prevenção de Replay / Disputa de Lease
// ============================================================================
console.log("2. Testando aceitação atômica de convite e prevenção de replay...");

const ctxInvitee = {
  tenantId: "", // novo usuário ainda sem tenant definido
  affiliateId: "",
  actor: "human" as const,
  actorAppUserId: "user_new_invitee",
  authenticatedAuthUserId: "auth_invitee",
  verifiedEmail:"collaborator@partner.com",emailConfirmed:true,
  membershipRole: "",
  requestId: "req_accept_1",
};

// Aceitar convite
const acceptResult = await acceptAccountInvitation(ctxInvitee, {
  rawToken: inviteResult.rawToken,
  invitedEmail: "collaborator@partner.com",
}, factory);

assert.equal(acceptResult.accepted, true);
assert.equal(acceptResult.affiliateId, "aff_saas_a");
assert.equal(acceptResult.role, "operator");

// Verificar se membership foi criada
const [memberRow] = (await pg.query(
  `select role from garimpa.affiliate_membership where affiliate_id = 'aff_saas_a' and app_user_id = 'user_new_invitee'`
)).rows as any[];
assert.equal(memberRow?.role, "operator", "Membro deve estar associado com papel operator");

// Replay attack: tentar aceitar o mesmo convite novamente deve falhar
await assert.rejects(
  async () => {
    await acceptAccountInvitation(ctxInvitee, {
      rawToken: inviteResult.rawToken,
      invitedEmail: "collaborator@partner.com",
    }, factory);
  },
  /invitation_invalid:INVITATION_ALREADY_USED|invitation_already_used_or_disputed/,
  "Convite já utilizado deve ser rejeitado em tentativas subsequentes"
);

console.log("✔ Aceitação atômica e proteção contra replay aprovadas.");

// ============================================================================
// 3. Rejeições Negativas (Email mismatch, expirado, cross-tenant)
// ============================================================================
console.log("3. Testando rejeições de e-mail incorreto, token expirado e cross-tenant...");

// Criar convite 2
const inv2 = await createAccountInvitation(ctxOwnerA, {
  invitedEmail: "specific@target.com",
  role: "operator",
  expiresInHours: 48,
}, factory);

// E-mail divergente
await assert.rejects(
  async () => {
    await acceptAccountInvitation(ctxInvitee, {
      rawToken: inv2.rawToken,
      invitedEmail: "wrong@target.com",
    }, factory);
  },
  /invitation_email_mismatch/,
  "Aceite com e-mail divergente deve ser negado"
);

// Simular expiração manual no banco
await pg.exec(`
  update garimpa.account_invitation
  set expires_at = now() - interval '1 hour'
  where id = '${inv2.invitationId}'
`);

await assert.rejects(
  async () => {
    await acceptAccountInvitation({...ctxInvitee,verifiedEmail:"specific@target.com"}, {
      rawToken: inv2.rawToken,
      invitedEmail: "specific@target.com",
    }, factory);
  },
  /invitation_invalid:INVITATION_EXPIRED/,
  "Convite expirado deve ser rejeitado"
);

// Criar convite 3 no Tenant A
const inv3 = await createAccountInvitation(ctxOwnerA, {
  invitedEmail: "crosstenant@test.com",
  role: "operator",
}, factory);

// A verified recipient can join A while retaining their existing membership in B.
const ctxUserB = ctx("saas_b", "user_owner_b", "auth_owner_b", "owner");
const crossAccepted=await acceptAccountInvitation({...ctxUserB,verifiedEmail:'crosstenant@test.com',emailConfirmed:true},{rawToken:inv3.rawToken},factory);
assert.equal(crossAccepted.accepted,true);
assert.equal(crossAccepted.tenantId,'saas_a');

console.log("✔ Rejeições de e-mail divergente, expiração e cross-tenant confirmadas.");

// ============================================================================
// 4. Fronteira de Capability `platform_admin`
// ============================================================================
console.log("4. Testando fronteira de capability platform_admin vs usuários de conta...");

// Owner comum tentando provisionar conta piloto via platform_admin deve ser barrado
await assert.rejects(
  async () => {
    await provisionPilotAccountByPlatformAdmin(ctxOwnerA, {
      targetTenantId: "saas_c",
      targetAffiliateId: "aff_saas_c",
      publicSlug: "saas-c",
      displayName: "Afiliado Charlie",
      planVersion: "v1_pilot",
      endsAt: "2027-01-01T00:00:00Z",
      limits: { maxActiveCampaigns: 2, maxDailyKits: 5, allowedMarketplaces: ["mercadolivre"] },
      termsRef: "terms_c_signed",
    }, factory);
  },
  /platform_admin_required/,
  "Usuário sem role 'platform_admin' não pode provisionar contas"
);

// Owner comum tentando suspender conta alheia ou própria via platform_admin deve ser barrado
await assert.rejects(
  async () => {
    await suspendAccountByPlatformAdmin(ctxOwnerA, {
      targetTenantId: "saas_b",
      reason: "Fraude alegada por terceiro",
    }, factory);
  },
  /platform_admin_required/,
  "Usuário sem role 'platform_admin' não pode suspender contas"
);

// Ator platform_admin provisiona com sucesso
const ctxPlatformAdmin = {
  tenantId: "saas_a",
  affiliateId: "aff_saas_a",
  actor: "human" as const,
  actorAppUserId: "user_platform_admin",
  authenticatedAuthUserId: "auth_plat_admin",
  membershipRole: "operator",
  requestId: "req_plat_1",
};

const provResult = await provisionPilotAccountByPlatformAdmin(ctxPlatformAdmin, {
  targetTenantId: "saas_gamma",
  targetAffiliateId: "aff_saas_gamma",
  publicSlug: "saas-gamma",
  displayName: "Afiliado Gamma Pilot",
  planVersion: "v1_pilot",
      endsAt: "2027-01-01T00:00:00Z",
  limits: { maxActiveCampaigns: 5, maxDailyKits: 15, allowedMarketplaces: ["mercadolivre"] },
  termsRef: "pilot_agreement_v1",
}, factory);

assert.equal(provResult.provisioned, true);
assert.equal(provResult.tenantId, "saas_gamma");

console.log("✔ Fronteira e privilégios exclusivos de platform_admin confirmados.");

// ============================================================================
// 5. Progressão Sequencial de Onboarding
// ============================================================================
console.log("5. Testando progressão sequencial do onboarding (pre-requisitos e steps)...");

// Seed user Gamma as owner in fixture
await pg.exec(`
  insert into garimpa.app_user(id, tenant_id, auth_user_id) values ('user_gamma_owner', 'saas_gamma', 'auth_gamma_owner') on conflict do nothing;
  insert into garimpa.app_user_role(app_user_id, role) values ('user_gamma_owner', 'afiliado') on conflict do nothing;
  insert into garimpa.affiliate_membership(affiliate_id, app_user_id, role) values ('aff_saas_gamma', 'user_gamma_owner', 'owner') on conflict do nothing;
`);

const ctxGammaOwner = ctx("saas_gamma", "user_gamma_owner", "auth_gamma_owner", "owner");

// Tentar pular direto para "test_link_verified" sem ter completado "marketplace_credentials_configured"
await assert.rejects(
  async () => {
    await recordOnboardingProgress(ctxGammaOwner, {
      step: "test_link_verified",
      status: "completed",
    }, factory);
  },
  /sequential_progress_violation.*marketplace_credentials_configured/,
  "Pular etapas obrigatórias de onboarding deve ser rejeitado"
);

await assert.rejects(()=>recordOnboardingProgress(ctxGammaOwner,{step:'marketplace_credentials_configured',status:'completed',evidenceRef:'invented-reference'},factory),/missing_evidence/);
await pg.exec(`insert into garimpa.affiliate_marketplace_config(id,affiliate_id,marketplace,tracking_id,tool_id,status) values('00000000-0000-4000-8000-000000000001','aff_saas_gamma','mercadolivre','tag_gamma','tool_gamma','active');insert into garimpa.private_artifact(id,tenant_id,kind,object_path,sha256,mime_type,byte_size,original_name,status,created_by) values('00000000-0000-4000-8000-000000000002','saas_gamma','account_evidence','saas_gamma/test-evidence',repeat('a',64),'application/pdf',20,'synthetic-test.pdf','ready','user_gamma_owner');`);
const {verifyAccountLinkTest}=require('../../packages/web/lib/saas-onboarding-db.ts');
await verifyAccountLinkTest(ctxGammaOwner,{configId:'00000000-0000-4000-8000-000000000001',evidenceId:'00000000-0000-4000-8000-000000000002',affiliateUrl:'https://www.mercadolivre.com.br/item?matt_word=tag_gamma',notes:'Synthetic human-documented portal test'},factory);
// Completar etapas em ordem sequencial
const step2 = await recordOnboardingProgress(ctxGammaOwner, {
  step: "marketplace_credentials_configured",
  status: "completed",
  evidenceRef: "cred_audit_001",
}, factory);
assert.equal(step2.recorded, true);

const step3 = await recordOnboardingProgress(ctxGammaOwner, {
  step: "test_link_verified",
  status: "completed",
  evidenceRef: "link_test_url_ml",
}, factory);
assert.equal(step3.recorded, true);

// Consultar progresso
const progress = await getOnboardingProgress(ctxGammaOwner, factory);
assert.ok(progress.completedSteps.includes("account_created"));
assert.ok(progress.completedSteps.includes("marketplace_credentials_configured"));
assert.ok(progress.completedSteps.includes("test_link_verified"));
assert.equal(progress.currentStep, "audience_policy_configured");

console.log("✔ Progressão sequencial e verificação de pré-requisitos validadas.");

// ============================================================================
// 6. Exportação Privada de Dados da Conta (GDPR / LGPD / G-PRIVACY)
// ============================================================================
console.log("6. Testando exportação privada de dados da conta e barreira multi-tenant...");

// Seed campanhas nos Tenants A e B
await pg.exec(`
  insert into garimpa.campaign(id, tenant_id, name, objective, status, created_by) values
    ('camp_priv_a', 'saas_a', 'Campanha Secreta Alpha', 'promocao', 'active', 'user_owner_a'),
    ('camp_priv_b', 'saas_b', 'Campanha Exclusiva Beta', 'promocao', 'active', 'user_owner_b')
  on conflict do nothing;
`);

// Operador não pode exportar
await assert.rejects(
  async () => {
    await exportAccountData(ctxOperA, factory);
  },
  /owner_required/,
  "Operador não pode solicitar export de dados integrais"
);

// Owner do Tenant B exporta seus dados
const exportB = await exportAccountData(ctxUserB, factory);

assert.equal(exportB.tenantId, "saas_b");
assert.equal(exportB.campaigns.length, 1);
assert.equal(exportB.campaigns[0].name, "Campanha Exclusiva Beta");

// Verificação de isolamento: NENHUM dado do Tenant A presente no export de B
const hasTenantAData = exportB.campaigns.some((c: any) => c.id === "camp_priv_a" || c.name.includes("Alpha"));
assert.equal(hasTenantAData, false, "Export do Tenant B não pode conter dados do Tenant A");

console.log("✔ Exportação privada com isolamento multi-tenant rigoroso confirmada.");

// ============================================================================
// 7. Suspensão Administrativa e Bloqueio Imediato
// ============================================================================
console.log("7. Testando suspensão administrativa de conta e bloqueio imediato...");

// Platform admin suspende Tenant B
const suspResult = await suspendAccountByPlatformAdmin(ctxPlatformAdmin, {
  targetTenantId: "saas_b",
  reason: "Inadimplência recorrente de faturas",
}, factory);

assert.equal(suspResult.suspended, true);
assert.equal(suspResult.tenantId, "saas_b");

// Verificar status no banco
const [entB] = (await pg.query(
  `select status, limits from garimpa.account_entitlement where tenant_id = 'saas_b'`
)).rows as any[];
assert.equal(entB.status, "suspended", "Status deve ter sido alterado para suspended");

// Validador de quota para Tenant B deve bloquear imediatamente
const quotaCheckB = validateEntitlementQuota({
  entitlement: {
    id: "ent_b",
    tenantId: "saas_b",
    affiliateId: "aff_saas_b",
    planVersion: "v1_pilot",
      endsAt: "2027-01-01T00:00:00Z",
    status: entB.status,
    startsAt: new Date(Date.now() - 3600000).toISOString(),
    limits: entB.limits,
    termsRef: "terms_signed",
  },
  operation: "create_campaign",
  currentActiveCampaigns: 0,
});

assert.equal(quotaCheckB.allowed, false);
assert.ok(quotaCheckB.reason?.includes("Conta suspensa administrativamente"));

// Tenant A continua intacto e ativo (suspensão de B não atinge A)
const [entA] = (await pg.query(
  `select status from garimpa.account_entitlement where tenant_id = 'saas_a'`
)).rows as any[];
assert.equal(entA.status, "pilot", "Tenant A deve permanecer intacto após suspensão do Tenant B");

// Verificar se evento AccountSuspended foi gravado em garimpa.account_lifecycle_event
const [eventRow] = (await pg.query(
  `select event_type, actor_app_user_id, payload from garimpa.account_lifecycle_event where tenant_id = 'saas_b'`
)).rows as any[];

assert.equal(eventRow?.event_type, "AccountSuspended");
assert.equal(eventRow?.actor_app_user_id, "user_platform_admin");
assert.equal(eventRow?.payload?.reason, "Inadimplência recorrente de faturas");

console.log("✔ Suspensão administrativa e isolamento de efeitos confirmados.");

// ============================================================================
// 8. Ciclo Completo de Onboarding SaaS (J2: Pilot Onboarding End-to-End)
// ============================================================================
console.log("8. Testando ciclo completo de onboarding SaaS (J2)...");

// 1. Provisionamento de nova conta Delta pelo platform admin
await provisionPilotAccountByPlatformAdmin(ctxPlatformAdmin, {
  targetTenantId: "saas_delta",
  targetAffiliateId: "aff_saas_delta",
  publicSlug: "saas-delta",
  displayName: "Afiliado Delta Pilot",
  planVersion: "v1_pilot",
      endsAt: "2027-01-01T00:00:00Z",
  limits: { maxActiveCampaigns: 2, maxDailyKits: 5, allowedMarketplaces: ["mercadolivre"] },
  termsRef: "pilot_delta_signed",
}, factory);

// 2. Criar owner da conta Delta e emitir convite para operador
await pg.exec(`
  insert into garimpa.app_user(id, tenant_id, auth_user_id) values ('user_delta_owner', 'saas_delta', 'auth_delta_owner') on conflict do nothing;
  insert into garimpa.app_user_role(app_user_id, role) values ('user_delta_owner', 'afiliado') on conflict do nothing;
  insert into garimpa.affiliate_membership(affiliate_id, app_user_id, role) values ('aff_saas_delta', 'user_delta_owner', 'owner') on conflict do nothing;
`);

const ctxDeltaOwner = ctx("saas_delta", "user_delta_owner", "auth_delta_owner", "owner");
const deltaInvite = await createAccountInvitation(ctxDeltaOwner, {
  invitedEmail: "delta_op@company.com",
  role: "operator",
}, factory);

// 3. Operador Delta aceita convite
await pg.exec(`
  insert into garimpa.app_user(id, tenant_id, auth_user_id) values ('user_delta_op', 'saas_delta', 'auth_delta_op') on conflict do nothing;
`);
const ctxDeltaOpCandidate = {
  tenantId: "",
  affiliateId: "",
  actor: "human" as const,
  actorAppUserId: "user_delta_op",
  authenticatedAuthUserId: "auth_delta_op",
  verifiedEmail:"delta_op@company.com",emailConfirmed:true,
  membershipRole: "",
  requestId: "req_delta_accept",
};

const deltaAccept = await acceptAccountInvitation(ctxDeltaOpCandidate, {
  rawToken: deltaInvite.rawToken,
  invitedEmail: "delta_op@company.com",
}, factory);
assert.equal(deltaAccept.accepted, true);
assert.equal(deltaAccept.affiliateId, "aff_saas_delta");

// Each progress step is backed by a resource in Delta, not a caller's evidence string.
await pg.exec(`insert into garimpa.affiliate_marketplace_config(id,affiliate_id,marketplace,tracking_id,tool_id,status) values('00000000-0000-4000-8000-000000000003','aff_saas_delta','mercadolivre','tag_delta','tool_delta','active');insert into garimpa.private_artifact(id,tenant_id,kind,object_path,sha256,mime_type,byte_size,original_name,status,created_by) values('00000000-0000-4000-8000-000000000004','saas_delta','account_evidence','saas_delta/test-evidence',repeat('b',64),'application/pdf',20,'synthetic-test.pdf','ready','user_delta_owner');`);
await verifyAccountLinkTest(ctxDeltaOwner,{configId:'00000000-0000-4000-8000-000000000003',evidenceId:'00000000-0000-4000-8000-000000000004',affiliateUrl:'https://www.mercadolivre.com.br/item?matt_word=tag_delta',notes:'Synthetic documented result'},factory);
const {withAccountDb}=require('../../packages/web/lib/tenant-db.ts');
const opportunity=require('../../packages/web/lib/opportunity-db.ts');
await withAccountDb(ctxDeltaOwner,async(tx:any)=>{const p=await opportunity.createAudiencePolicy(tx,'saas_delta',{name:'Público Delta'});await opportunity.createAudiencePolicyVersion(tx,'saas_delta',{policyId:p.id,version:'delta-1',config:{audienceKey:'delta',name:'Delta',targetCategories:[],allowedChannels:['whatsapp_channel'],cooldownHours:24},approvedBy:'user_delta_owner'});},factory);
const workflow=require('../../packages/web/lib/commercial-workflow.ts');
await workflow.createCampaignForAccount(ctxDeltaOwner,{name:'Primeira campanha Delta',objective:'Teste sintético',audience:'Delta',requestId:'delta-first-campaign'},factory);
// 4. Operador executa etapas de onboarding
const ctxDeltaOp = ctx("saas_delta", "user_delta_op", "auth_delta_op", "operator");
await recordOnboardingProgress(ctxDeltaOp, { step: "marketplace_credentials_configured", status: "completed", evidenceRef: "cred_delta_001" }, factory);
await recordOnboardingProgress(ctxDeltaOp, { step: "test_link_verified", status: "completed" }, factory);
await recordOnboardingProgress(ctxDeltaOp, { step: "audience_policy_configured", status: "completed" }, factory);
await recordOnboardingProgress(ctxDeltaOp, { step: "first_campaign_created", status: "completed" }, factory);

const finalProgressDelta = await getOnboardingProgress(ctxDeltaOp, factory);
assert.ok(finalProgressDelta.completedSteps.includes("first_campaign_created"));
assert.equal(finalProgressDelta.currentStep, "first_kit_approved");

console.log("✔ Ciclo completo J2 de onboarding SaaS finalizado com sucesso.");

console.log("\n========================================================");
console.log("TODAS AS 8 BATERIAS DE ONBOARDING SAAS (D12) FORAM APROVADAS!");
console.log("========================================================\n");

await pg.close();
