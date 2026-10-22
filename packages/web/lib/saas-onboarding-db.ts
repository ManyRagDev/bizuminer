import { assertCommercialRolloutReady } from "./commercial-rollout.ts";
/**
 * DAL e Serviço de Onboarding, Convites e Ciclo de Vida SaaS (EP-12 / M-12 / C-01 / C-08).
 *
 * Implementa:
 * 1. Convite com token criptográfico seguro, hash SHA-256 e uso único atômico.
 * 2. Aceitação autenticada com vinculação de membership e isolamento de tenant.
 * 3. Fronteira estrita de 'platform_admin' (capability de plataforma vs membership de afiliado).
 * 4. Progressão sequencial do onboarding com validação de pré-requisitos (canCompleteOnboardingStep).
 * 5. Exportação privada de dados da conta (GDPR / LGPD / G-PRIVACY) com barreira multi-tenant.
 * 6. Suspensão administrativa de conta e revogação imediata de operações.
 */

import { createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import { db } from "./db.ts";
import { withCommercialDb as withAccountDb, type AccountContext } from "./commercial-rollout.ts";
import {
  type OnboardingStep,
  type AccountInvitation,
  canCompleteOnboardingStep,
  validateAccountInvitation,
  validateMembershipRole,
} from "./saas-onboarding-contract.ts";

export type Sql = postgres.Sql | postgres.TransactionSql;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface CreateInvitationInput {
  invitedEmail: string;
  role: "owner" | "operator";
  expiresInHours?: number;
}

export interface AcceptInvitationInput {
  rawToken: string;
  invitedEmail?: string;
}

export interface RecordProgressInput {
  step: OnboardingStep;
  status: "in_progress" | "completed";
  evidenceRef?: string;
}

/**
 * Cria um convite para um novo membro/operador da conta.
 * Apenas 'owner' da conta pode convidar membros.
 */
export async function createAccountInvitation(
  context: AccountContext,
  input: CreateInvitationInput,
  sqlFactory: typeof db = db,
): Promise<{ invitationId: string; rawToken: string; expiresAt: string }> {
  if (context.membershipRole !== "owner") {
    throw new Error(
      "owner_required: Apenas owners da conta podem emitir convites.",
    );
  }

  const roleCheck = validateMembershipRole(input.role);
  if (!roleCheck.allowed) {
    throw new Error(roleCheck.reason);
  }

  const email = input.invitedEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("invalid_email");
  }

  const hours = input.expiresInHours ?? 48;
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);

  return withAccountDb(
    context,
    async (sql) => {
      const [row] = await sql<{ id: string }[]>`
      insert into garimpa.account_invitation (
        tenant_id,
        affiliate_id,
        token_hash,
        invited_email,
        role,
        expires_at,
        created_by
      ) values (
        ${context.tenantId},
        ${context.affiliateId},
        ${tokenHash},
        ${email},
        ${input.role},
        ${expiresAt},
        ${context.actorAppUserId!}
      )
      returning id
    `;

      return {
        invitationId: row.id,
        rawToken,
        expiresAt,
      };
    },
    sqlFactory,
  );
}

/**
 * Aceita um convite de forma transacional e atômica.
 * Garante que:
 * - O token seja válido, não expirado e pertença ao e-mail informado.
 * - Duas requisições concorrentes disputem lease atômico (apenas uma aceita).
 * - O usuário receba a membership da conta no papel especificado pelo convite.
 * - NUNCA autoconceda papel de plataforma (platform_admin).
 */
export async function acceptAccountInvitation(
  context: {
    actorAppUserId: string | null;
    authenticatedAuthUserId: string | null;
    verifiedEmail?: string;
    emailConfirmed?: boolean;
  },
  input: AcceptInvitationInput,
  sqlFactory: typeof db = db,
): Promise<{
  accepted: boolean;
  affiliateId: string;
  tenantId: string;
  role: string;
}> {
  if (!context.authenticatedAuthUserId || !context.actorAppUserId) {
    throw new Error(
      "unauthenticated_session: authenticatedAuthUserId e actorAppUserId são obrigatórios para aceitar convite",
    );
  }

  if (!context.emailConfirmed || !context.verifiedEmail?.trim())
    throw new Error("verified_session_email_required");
  if (!input.rawToken?.trim()) {
    throw new Error("token_and_email_required");
  }

  const tokenHash = hashToken(input.rawToken.trim());
  const email = context.verifiedEmail!.trim().toLowerCase();
  if (input.invitedEmail && input.invitedEmail.trim().toLowerCase() !== email)
    throw new Error("invitation_email_mismatch");
  const sql = sqlFactory();

  try {
    return await sql.begin(async (tx) => {
      await assertCommercialRolloutReady(tx);
      const rows = await tx<
        {
          accepted: boolean;
          tenant_id: string;
          affiliate_id: string;
          role: string;
        }[]
      >`
        select * from garimpa.accept_account_invitation(
          ${tokenHash},
          ${context.actorAppUserId!},
          ${context.authenticatedAuthUserId!},
          ${email}
        )
      `;
      const res = rows[0];
      if (!res || !res.accepted) {
        throw new Error("invitation_acceptance_failed");
      }
      return {
        accepted: true,
        affiliateId: res.affiliate_id,
        tenantId: res.tenant_id,
        role: res.role,
      };
    });
  } finally {
    await sql.end();
  }
}

/**
 * Registra o avanço de uma etapa do onboarding sequencial da conta.
 */
export async function recordOnboardingProgress(
  context: AccountContext,
  input: RecordProgressInput,
  sqlFactory: typeof db = db,
): Promise<{ recorded: boolean; step: OnboardingStep; status: string }> {
  return withAccountDb(
    context,
    async (sql) => {
      // 1. Consultar etapas já concluídas
      const completedRows = await sql<{ step: string }[]>`
      select step
      from garimpa.onboarding_progress
      where affiliate_id = ${context.affiliateId}
        and tenant_id = ${context.tenantId}
        and status = 'completed'
    `;
      const completedSteps = completedRows.map((r) => r.step as OnboardingStep);

      // 2. Validar ordem sequencial
      const check = canCompleteOnboardingStep(completedSteps, input.step);
      if (!check.canComplete) {
        throw new Error(
          `sequential_progress_violation: Etapa '${check.blockerStep}' precisa ser concluída antes.`,
        );
      }

      if (input.status === "completed") {
        const facts = await onboardingFacts(sql, context);
        if (!facts[input.step])
          throw new Error("missing_evidence:" + input.step);
      }

      // 3. Gravar progresso da etapa
      await sql`
      insert into garimpa.onboarding_progress (
        tenant_id,
        affiliate_id,
        step,
        status,
        evidence_ref,
        updated_at
      ) values (
        ${context.tenantId},
        ${context.affiliateId},
        ${input.step},
        ${input.status},
        ${input.evidenceRef ?? null},
        now()
      )
      on conflict (affiliate_id, step)
      do update set
        status = excluded.status,
        evidence_ref = coalesce(excluded.evidence_ref, garimpa.onboarding_progress.evidence_ref),
        updated_at = now()
    `;

      return {
        recorded: true,
        step: input.step,
        status: input.status,
      };
    },
    sqlFactory,
  );
}

/**
 * Retorna o progresso completo de onboarding da conta.
 */
export async function getOnboardingProgress(
  context: AccountContext,
  sqlFactory: typeof db = db,
): Promise<{
  completedSteps: OnboardingStep[];
  currentStep: OnboardingStep | "finished";
  allSteps: { step: string; status: string; updatedAt: string }[];
}> {
  return withAccountDb(
    context,
    async (sql) => {
      const rows = await sql<
        { step: string; status: string; updated_at: string }[]
      >`
      select step, status, updated_at::text
      from garimpa.onboarding_progress
      where affiliate_id = ${context.affiliateId}
        and tenant_id = ${context.tenantId}
      order by updated_at asc
    `;

      const facts = await onboardingFacts(sql, context);
      const completed = rows
        .filter(
          (r) => r.status === "completed" && facts[r.step as OnboardingStep],
        )
        .map((r) => r.step as OnboardingStep);

      // Encontrar próxima etapa pendente
      const allExpected = [
        "account_created",
        "marketplace_credentials_configured",
        "test_link_verified",
        "audience_policy_configured",
        "first_campaign_created",
        "first_kit_approved",
        "first_publication_confirmed",
      ] as const;

      const nextPending =
        allExpected.find((s) => !completed.includes(s)) ?? "finished";

      return {
        completedSteps: completed,
        currentStep: nextPending,
        allSteps: rows.map((r) => ({
          step: r.step,
          status: r.status,
          updatedAt: r.updated_at,
        })),
      };
    },
    sqlFactory,
  );
}

/**
 * Exporta todos os dados privados da conta para auditoria e saída (G-PRIVACY / GDPR / LGPD).
 * Garante estritamente que NENHUM dado de outra conta ou da plataforma vaze.
 */
export async function exportAccountData(
  context: AccountContext,
  sqlFactory: typeof db = db,
): Promise<{
  tenantId: string;
  exportedAt: string;
  account: { id: string; slug: string; name: string };
  entitlements: any[];
  campaigns: any[];
  kits: any[];
  publications: any[];
  conversions: any[];
  commissions: any[];
  onboarding: any[];
  records: Record<string, readonly unknown[]>;
}> {
  if (context.membershipRole !== "owner") {
    throw new Error(
      "owner_required: Apenas o dono da conta pode exportar dados integrais.",
    );
  }

  const tenantId = context.tenantId;

  return withAccountDb(
    context,
    async (sql) => {
      const [acc] = await sql<
        { id: string; public_slug: string; display_name: string }[]
      >`
      select id, public_slug, display_name
      from garimpa.affiliate_account
      where tenant_id = ${tenantId}
      limit 1
    `;

      const entitlements = await sql`
      select id, plan_version, status, starts_at::text, ends_at::text, limits, terms_ref, created_at::text
      from garimpa.account_entitlement
      where tenant_id = ${tenantId}
    `;

      const campaigns = await sql`
      select id, name, objective, status, version, created_at::text
      from garimpa.campaign
      where tenant_id = ${tenantId}
    `;

      const kits = await sql`
      select id, campaign_id, current_revision, status, version, created_at::text
      from garimpa.commercial_kit
      where tenant_id = ${tenantId}
    `;

      const publications = await sql`
      select id, campaign_id, channel, status, version, created_at::text
      from garimpa.campaign_publication
      where tenant_id = ${tenantId}
    `;

      const conversions = await sql`
      select id, marketplace, external_order_id, order_value_cents, currency, status, created_at::text
      from garimpa.conversion
      where tenant_id = ${tenantId}
    `;

      const commissions = await sql`
      select id, amount_cents, currency, state, source_key, created_at::text
      from garimpa.commission_entry
      where tenant_id = ${tenantId}
    `;

      const onboarding = await sql`
      select step, status, evidence_ref, updated_at::text
      from garimpa.onboarding_progress
      where tenant_id = ${tenantId}
    `;

      const records: Record<string, readonly unknown[]> = {};
      // Fixed allowlist: account-owned business records, never credentials, auth identities or invitation tokens.
      for (const table of [
        "opportunity",
        "audience_policy",
        "audience_policy_version",
        "commercial_kit_revision",
        "campaign_link",
        "editorial_assessment",
        "comparison_review",
        "price_evidence_policy_version",
        "operational_cost",
        "saas_revenue_entry",
        "import_batch",
        "import_row",
        "policy_experiment",
        "experiment_assignment",
        "experiment_evaluation",
        "dispatch_job",
        "dispatch_attempt",
        "account_lifecycle_event",
      ]) {
        records[table] = await sql.unsafe(
          `select * from garimpa.${table} where tenant_id=$1`,
          [tenantId],
        );
      }
      if (
        (await sql`select to_regclass('garimpa.private_artifact') as exists`)[0]
          ?.exists
      ) {
        records.artifacts =
          await sql`select id,kind,sha256,mime_type,byte_size,original_name,status,owner_ref,rights,created_at::text from garimpa.private_artifact where tenant_id=${tenantId}`;
        for (const table of [
          "governance_decision",
          "price_calibration_run",
          "dispatch_control",
          "dispatch_reservation",
        ])
          records[table] = await sql.unsafe(
            `select * from garimpa.${table} where tenant_id=$1`,
            [tenantId],
          );
      }
      return {
        records,
        tenantId,
        exportedAt: new Date().toISOString(),
        account: {
          id: acc?.id ?? context.affiliateId,
          slug: acc?.public_slug ?? "",
          name: acc?.display_name ?? "",
        },
        entitlements,
        campaigns,
        kits,
        publications,
        conversions,
        commissions,
        onboarding,
      };
    },
    sqlFactory,
  );
}

/**
 * Operação administrativa de plataforma: provisiona uma nova conta de afiliado e seu plano piloto.
 * Exige papel 'platform_admin' no app_user_role do ator autenticado.
 */
export async function provisionPilotAccountByPlatformAdmin(
  platformContext: AccountContext,
  input: {
    targetTenantId: string;
    targetAffiliateId: string;
    publicSlug: string;
    displayName: string;
    planVersion: string;
    endsAt: string;
    limits: {
      maxActiveCampaigns: number;
      maxDailyKits: number;
      allowedMarketplaces: string[];
    };
    termsRef: string;
  },
  sqlFactory: typeof db = db,
): Promise<{ provisioned: boolean; tenantId: string; affiliateId: string }> {
  const sql = sqlFactory();

  try {
    return await sql.begin(async (tx) => {
      await assertCommercialRolloutReady(tx);
      if (platformContext.actorAppUserId) {
        await tx`select set_config('garimpa.actor_app_user_id', ${platformContext.actorAppUserId}, true)`;
      }

      // 1. Validar se o ator possui a role 'platform_admin' no banco
      const identities =
        await tx`select id from garimpa.resolve_actor_identity(${platformContext.authenticatedAuthUserId ?? ""}) where id=${platformContext.actorAppUserId ?? ""}`;
      if (!identities.length) throw new Error("platform_admin_required");
      const roles = await tx<{ role: string }[]>`
        select role from garimpa.app_user_role
        where app_user_id = ${platformContext.actorAppUserId!}
          and role = 'platform_admin' and revoked_at is null
      `;

      if (roles.length === 0) {
        throw new Error(
          "platform_admin_required: Apenas administradores da plataforma podem provisionar contas.",
        );
      }

      // Configurar role de plataforma na transação
      await tx`select set_config('garimpa.platform_role', 'platform_admin', true)`;

      if (
        !/^[a-z0-9._-]{1,64}$/.test(input.targetTenantId) ||
        !input.targetAffiliateId.trim() ||
        !input.publicSlug.trim() ||
        !input.displayName.trim() ||
        !input.planVersion.trim() ||
        !input.termsRef.trim() ||
        !Number.isFinite(Date.parse(input.endsAt)) ||
        Date.parse(input.endsAt) <= Date.now() ||
        ![input.limits.maxActiveCampaigns, input.limits.maxDailyKits].every(
          (v) => Number.isSafeInteger(v) && v > 0,
        ) ||
        !input.limits.allowedMarketplaces.length ||
        input.limits.allowedMarketplaces.some(
          (v) => !["mercadolivre", "shopee", "aliexpress"].includes(v),
        )
      )
        throw new Error("explicit_approved_pilot_configuration_required");
      // 2. Inserir conta do afiliado
      await tx`
        insert into garimpa.affiliate_account (
          id, tenant_id, public_slug, display_name
        ) values (
          ${input.targetAffiliateId},
          ${input.targetTenantId},
          ${input.publicSlug},
          ${input.displayName}
        )
        on conflict (id) do nothing
      `;

      // 3. Inserir plano inicial (pilot)
      await tx`
        insert into garimpa.account_entitlement (
          tenant_id,
          affiliate_id,
          plan_version,
          status,
          starts_at,
          ends_at,
          limits,
          terms_ref
        ) values (
          ${input.targetTenantId},
          ${input.targetAffiliateId},
          ${input.planVersion},
          'pilot',
          now(),
          ${input.endsAt},
          ${JSON.stringify(input.limits)}::jsonb,
          ${input.termsRef}
        )
      `;

      // 4. Iniciar progresso de onboarding
      await tx`
        insert into garimpa.onboarding_progress (
          tenant_id,
          affiliate_id,
          step,
          status,
          updated_at
        ) values (
          ${input.targetTenantId},
          ${input.targetAffiliateId},
          'account_created',
          'completed',
          now()
        )
      `;

      return {
        provisioned: true,
        tenantId: input.targetTenantId,
        affiliateId: input.targetAffiliateId,
      };
    });
  } finally {
    await sql.end();
  }
}

/**
 * Operação administrativa de plataforma: suspende uma conta de cliente.
 * Exige papel 'platform_admin'. Bloqueia imediatamente comandos subsequentes da conta.
 */
export async function suspendAccountByPlatformAdmin(
  platformContext: AccountContext,
  input: {
    targetTenantId: string;
    reason: string;
  },
  sqlFactory: typeof db = db,
): Promise<{ suspended: boolean; tenantId: string }> {
  const sql = sqlFactory();

  try {
    return await sql.begin(async (tx) => {
      await assertCommercialRolloutReady(tx);
      if (platformContext.actorAppUserId) {
        await tx`select set_config('garimpa.actor_app_user_id', ${platformContext.actorAppUserId}, true)`;
      }

      // 1. Validar se o ator possui 'platform_admin'
      const identities =
        await tx`select id from garimpa.resolve_actor_identity(${platformContext.authenticatedAuthUserId ?? ""}) where id=${platformContext.actorAppUserId ?? ""}`;
      if (!identities.length) throw new Error("platform_admin_required");
      const roles = await tx<{ role: string }[]>`
        select role from garimpa.app_user_role
        where app_user_id = ${platformContext.actorAppUserId!}
          and role = 'platform_admin' and revoked_at is null
      `;

      if (roles.length === 0) {
        throw new Error(
          "platform_admin_required: Apenas administradores da plataforma podem suspender contas.",
        );
      }

      await tx`select set_config('garimpa.platform_role', 'platform_admin', true)`;

      // 2. Atualizar estado canônico da conta (affiliate_account) e do plano (entitlement) para 'suspended' (CF-15)
      await tx`
        update garimpa.affiliate_account
        set status = 'suspended'
        where tenant_id = ${input.targetTenantId}
      `;

      await tx`
        update garimpa.account_entitlement
        set status = 'suspended'
        where tenant_id = ${input.targetTenantId}
      `;

      // 3. Obter affiliate_id e registrar account_lifecycle_event
      const [acc] = await tx<{ id: string }[]>`
        select id from garimpa.affiliate_account
        where tenant_id = ${input.targetTenantId}
        limit 1
      `;

      if (acc) {
        await tx`
          insert into garimpa.account_lifecycle_event (
            tenant_id,
            affiliate_id,
            event_type,
            actor_app_user_id,
            payload
          ) values (
            ${input.targetTenantId},
            ${acc.id},
            'AccountSuspended',
            ${platformContext.actorAppUserId!},
            ${JSON.stringify({
              tenantId: input.targetTenantId,
              reason: input.reason,
              suspendedBy: platformContext.actorAppUserId,
            })}::jsonb
          )
        `;
      }

      return {
        suspended: true,
        tenantId: input.targetTenantId,
      };
    });
  } finally {
    await sql.end();
  }
}

/**
 * Reativa uma conta previamente suspensa pela plataforma (CF-15).
 */
export async function reactivateAccountByPlatformAdmin(
  platformContext: AccountContext,
  input: {
    targetTenantId: string;
    reason: string;
  },
  sqlFactory: typeof db = db,
): Promise<{ reactivated: boolean; tenantId: string }> {
  const sql = sqlFactory();

  try {
    return await sql.begin(async (tx) => {
      await assertCommercialRolloutReady(tx);
      await tx`select set_config('garimpa.actor_app_user_id', ${platformContext.actorAppUserId ?? ""}, true)`;
      const identities =
        await tx`select id from garimpa.resolve_actor_identity(${platformContext.authenticatedAuthUserId ?? ""}) where id=${platformContext.actorAppUserId ?? ""}`;
      if (!identities.length) throw new Error("platform_admin_required");
      const roles = await tx<{ role: string }[]>`
        select role from garimpa.app_user_role
        where app_user_id = ${platformContext.actorAppUserId!}
          and role = 'platform_admin' and revoked_at is null
      `;

      if (roles.length === 0) {
        throw new Error(
          "platform_admin_required: Apenas administradores da plataforma podem reativar contas.",
        );
      }

      await tx`select set_config('garimpa.platform_role', 'platform_admin', true)`;

      await tx`
        update garimpa.affiliate_account
        set status = 'active'
        where tenant_id = ${input.targetTenantId}
      `;

      await tx`
        update garimpa.account_entitlement
        set status = 'active'
        where tenant_id = ${input.targetTenantId}
      `;

      const [acc] = await tx<{ id: string }[]>`
        select id from garimpa.affiliate_account
        where tenant_id = ${input.targetTenantId}
        limit 1
      `;

      if (acc) {
        await tx`
          insert into garimpa.account_lifecycle_event (
            tenant_id,
            affiliate_id,
            event_type,
            actor_app_user_id,
            payload
          ) values (
            ${input.targetTenantId},
            ${acc.id},
            'AccountReactivated',
            ${platformContext.actorAppUserId!},
            ${JSON.stringify({
              tenantId: input.targetTenantId,
              reason: input.reason,
              reactivatedBy: platformContext.actorAppUserId,
            })}::jsonb
          )
        `;
      }

      return {
        reactivated: true,
        tenantId: input.targetTenantId,
      };
    });
  } finally {
    await sql.end();
  }
}

export async function onboardingFacts(
  sql: any,
  context: AccountContext,
): Promise<Record<OnboardingStep, boolean>> {
  const t = context.tenantId,
    a = context.affiliateId;
  const [r] = await sql`select
 exists(select 1 from garimpa.affiliate_account where id=${a} and tenant_id=${t} and status='active') as account_created,
 exists(select 1 from garimpa.affiliate_marketplace_config where affiliate_id=${a} and status='active' and length(tracking_id)>0 and length(tool_id)>0) as marketplace_credentials_configured,
 exists(select 1 from garimpa.account_lifecycle_event e join garimpa.affiliate_marketplace_config c on c.affiliate_id=e.affiliate_id and c.id::text=e.payload->>'configId' join garimpa.private_artifact artifact on artifact.id::text=e.payload->>'evidenceId' and artifact.tenant_id=e.tenant_id and artifact.status='ready' where e.tenant_id=${t} and e.affiliate_id=${a} and e.event_type='AffiliateLinkTestVerified' and c.status='active' and c.updated_at::text=e.payload->>'configVersion') as test_link_verified,
 exists(select 1 from garimpa.audience_policy p join garimpa.audience_policy_version v on v.policy_id=p.id and v.tenant_id=p.tenant_id and v.version=p.current_version where p.tenant_id=${t} and p.status='active') as audience_policy_configured,
 exists(select 1 from garimpa.campaign where tenant_id=${t} and status<>'archived') as first_campaign_created,
 exists(select 1 from garimpa.commercial_kit k join garimpa.commercial_kit_revision r on r.kit_id=k.id and r.tenant_id=k.tenant_id and r.revision=k.current_revision where k.tenant_id=${t} and k.status='approved') as first_kit_approved,
 exists(select 1 from garimpa.campaign_publication where tenant_id=${t} and status='published_confirmed' and published_at is not null) as first_publication_confirmed`;
  return r;
}

export async function createPilotOwnerInvitation(
  c: AccountContext,
  input: { targetTenantId: string; email: string; expiresAt: string },
  factory: typeof db = db,
) {
  const rawToken = randomBytes(32).toString("hex");
  if (
    !input.email.includes("@") ||
    !Number.isFinite(Date.parse(input.expiresAt)) ||
    Date.parse(input.expiresAt) <= Date.now()
  )
    throw new Error("invalid_invitation");
  const sql = factory();
  try {
    return await sql.begin(async (tx) => {
      await assertCommercialRolloutReady(tx);
      const [identity] =
        await tx`select id from garimpa.resolve_actor_identity(${c.authenticatedAuthUserId ?? ""}) where id=${c.actorAppUserId ?? ""} and 'platform_admin'=any(roles)`;
      if (!identity) throw new Error("platform_admin_required");
      await tx`select set_config('garimpa.actor_app_user_id',${c.actorAppUserId!},true)`;
      await tx`select set_config('garimpa.platform_role','platform_admin',true)`;
      const [account] = await tx<
        any[]
      >`select id from garimpa.affiliate_account where tenant_id=${input.targetTenantId} and status='active'`;
      if (!account) throw new Error("account_not_found");
      await tx`insert into garimpa.account_invitation(tenant_id,affiliate_id,token_hash,invited_email,role,expires_at,created_by) values(${input.targetTenantId},${account.id},${hashToken(rawToken)},${input.email.trim().toLowerCase()},'owner',${input.expiresAt},${c.actorAppUserId!})`;
      return { rawToken, expiresAt: input.expiresAt };
    });
  } finally {
    await sql.end();
  }
}

export async function verifyAccountLinkTest(
  c: AccountContext,
  input: {
    configId: string;
    evidenceId: string;
    affiliateUrl: string;
    notes: string;
  },
  factory: typeof db = db,
) {
  if (c.membershipRole !== "owner" || !input.notes.trim())
    throw new Error("owner_evidence_required");
  return withAccountDb(
    c,
    async (tx) => {
      const [config] = await tx<
        any[]
      >`select *,updated_at::text as config_version from garimpa.affiliate_marketplace_config where id::text=${input.configId} and affiliate_id=${c.affiliateId} and status='active'`;
      const [evidence] =
        await tx`select id from garimpa.private_artifact where id::text=${input.evidenceId} and tenant_id=${c.tenantId} and kind='account_evidence' and status='ready'`;
      const url = new URL(input.affiliateUrl);
      if (
        !config ||
        !evidence ||
        url.protocol !== "https:" ||
        config.marketplace !== "mercadolivre" ||
        !/(^|\.)mercadolivre\.com\.br$/.test(url.hostname) ||
        ![...url.searchParams.values()].includes(config.tracking_id)
      )
        throw new Error("verified_link_evidence_required");
      await tx`insert into garimpa.account_lifecycle_event(tenant_id,affiliate_id,event_type,actor_app_user_id,payload) values(${c.tenantId},${c.affiliateId},'AffiliateLinkTestVerified',${c.actorAppUserId!},${tx.json({ configId: config.id, configVersion: config.config_version, evidenceId: input.evidenceId, targetDigest: hashToken(input.affiliateUrl), notes: input.notes, verification: "human_documented" })})`;
      return { verified: true };
    },
    factory,
  );
}
