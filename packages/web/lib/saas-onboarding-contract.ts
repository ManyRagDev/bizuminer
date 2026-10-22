/**
 * Contratos de Onboarding, Entitlements e Limites de Uso SaaS (EP-12 / C-08).
 *
 * Garante que clientes do piloto e assinantes:
 * 1. Não operem sem plano/entitlement ativo com termos aprovados.
 * 2. Sejam estritamente limitados por quotas no servidor.
 * 3. Sigam uma jornada de onboarding sequencial e verificável.
 */

export const ONBOARDING_STEPS = [
  "account_created",
  "marketplace_credentials_configured",
  "test_link_verified",
  "audience_policy_configured",
  "first_campaign_created",
  "first_kit_approved",
  "first_publication_confirmed",
] as const;

export type OnboardingStep = typeof ONBOARDING_STEPS[number];

export interface AccountEntitlement {
  readonly id: string;
  readonly tenantId: string;
  readonly affiliateId: string;
  readonly planVersion: string;
  readonly status: "pilot" | "active" | "suspended" | "ended";
  readonly startsAt: string;
  readonly endsAt?: string | null;
  readonly limits: {
    readonly maxActiveCampaigns?: number;
    readonly maxDailyKits?: number;
    readonly allowedMarketplaces?: readonly string[];
  };
  readonly termsRef: string;
}

/**
 * Valida se uma operação pode ser executada sob os entitlements da conta.
 */
export function validateEntitlementQuota(params: {
  entitlement: AccountEntitlement | null | undefined;
  operation: "create_campaign" | "create_kit" | "use_marketplace";
  currentActiveCampaigns?: number;
  todayKitsCount?: number;
  marketplace?: string;
  now?: Date;
}): { allowed: boolean; reason?: string } {
  const { entitlement, operation } = params;
  const now = params.now ?? new Date();

  if (!entitlement) {
    return {
      allowed: false,
      reason: "Conta sem plano ou entitlement ativo atribuído.",
    };
  }

  if (entitlement.status === "suspended") {
    return {
      allowed: false,
      reason: "Conta suspensa administrativamente. Operação bloqueada.",
    };
  }

  if (entitlement.status === "ended") {
    return {
      allowed: false,
      reason: "Período do plano ou piloto encerrado.",
    };
  }

  if (entitlement.startsAt) {
    const startsMs = new Date(entitlement.startsAt).getTime();
    if (!Number.isFinite(startsMs) || now.getTime() < startsMs) {
      return {
        allowed: false,
        reason: "Plano ou entitlement ainda não iniciado.",
      };
    }
  }

  if (entitlement.endsAt) {
    const endsMs = new Date(entitlement.endsAt).getTime();
    if (!Number.isFinite(endsMs) || now.getTime() >= endsMs) {
      return {
        allowed: false,
        reason: "Período do plano ou piloto encerrado.",
      };
    }
  }

  if (operation === "create_campaign") {
    const maxCampaigns = entitlement.limits.maxActiveCampaigns;
    if (maxCampaigns === undefined || maxCampaigns === null) {
      return {
        allowed: false,
        reason: "Limite de campanhas ativas não configurado para o plano.",
      };
    }
    if ((params.currentActiveCampaigns ?? 0) >= maxCampaigns) {
      return {
        allowed: false,
        reason: `Limite de campanhas ativas atingido (${maxCampaigns}).`,
      };
    }
  }

  if (operation === "create_kit") {
    const maxDaily = entitlement.limits.maxDailyKits;
    if (maxDaily === undefined || maxDaily === null) {
      return {
        allowed: false,
        reason: "Limite diário de kits comerciais não configurado para o plano.",
      };
    }
    if ((params.todayKitsCount ?? 0) >= maxDaily) {
      return {
        allowed: false,
        reason: `Limite diário de kits comerciais atingido (${maxDaily}).`,
      };
    }
  }

  if (operation === "use_marketplace" && params.marketplace) {
    const allowed = entitlement.limits.allowedMarketplaces;
    if (allowed && !allowed.includes(params.marketplace)) {
      return {
        allowed: false,
        reason: `Marketplace '${params.marketplace}' não habilitado no plano contratado.`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Valida a progressão sequencial do onboarding de um afiliado externo.
 */
export function canCompleteOnboardingStep(
  completedSteps: readonly OnboardingStep[],
  targetStep: OnboardingStep,
): { canComplete: boolean; blockerStep?: OnboardingStep } {
  const targetIndex = ONBOARDING_STEPS.indexOf(targetStep);
  if (targetIndex <= 0) {
    return { canComplete: true };
  }

  const previousRequiredStep = ONBOARDING_STEPS[targetIndex - 1]!;
  if (!completedSteps.includes(previousRequiredStep)) {
    return {
      canComplete: false,
      blockerStep: previousRequiredStep,
    };
  }

  return { canComplete: true };
}

export interface AccountInvitation {
  readonly id: string;
  readonly tenantId: string;
  readonly invitedEmail: string;
  readonly role: "owner" | "operator";
  readonly expiresAt: string;
  readonly usedAt: string | null;
}

/**
 * Validação de segurança para convites de novos operadores/membros.
 * Garante que convite vencido, já usado ou de outro tenant seja rejeitado.
 */
export function validateAccountInvitation(params: {
  invitation: AccountInvitation | null | undefined;
  requestingTenantId: string;
  now?: Date;
}): { valid: boolean; reason?: string } {
  const { invitation, requestingTenantId } = params;
  const now = params.now ?? new Date();

  if (!invitation) {
    return { valid: false, reason: "INVITATION_NOT_FOUND" };
  }

  if (invitation.tenantId !== requestingTenantId) {
    return { valid: false, reason: "CROSS_TENANT_INVITATION_REJECTED" };
  }

  if (invitation.usedAt) {
    return { valid: false, reason: "INVITATION_ALREADY_USED" };
  }

  if (!invitation.expiresAt || typeof invitation.expiresAt !== "string") {
    return { valid: false, reason: "INVALID_EXPIRES_AT" };
  }
  const expiresMs = new Date(invitation.expiresAt).getTime();
  if (!Number.isFinite(expiresMs)) {
    return { valid: false, reason: "INVALID_EXPIRES_AT" };
  }
  if (now.getTime() >= expiresMs) {
    return { valid: false, reason: "INVITATION_EXPIRED" };
  }

  return { valid: true };
}

/**
 * Impede que papéis de plataforma (ex: admin, superadmin) sejam concedidos
 * ou autoconcedidos via memberships de afiliados.
 */
export function validateMembershipRole(role: string): {
  allowed: boolean;
  normalizedRole?: "owner" | "operator";
  reason?: string;
} {
  if (role === "owner" || role === "operator") {
    return { allowed: true, normalizedRole: role };
  }

  return {
    allowed: false,
    reason: `FORBIDDEN_ROLE: O papel '${role}' não é uma role válida de membership de afiliado.`,
  };
}

