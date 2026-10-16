"use server";
import { pageAccount, platformPageContext } from "../../lib/page-account.ts";

import { revalidatePath } from "next/cache";
import {
  getPageAuth,
  isAffiliate,
  resolveAccountContext,
  resolveAppUserId,
  roleAccess,
  type AccountContext,
} from "../../lib/auth.ts";
import {
  createAccountInvitation,
  acceptAccountInvitation,
  recordOnboardingProgress,
  getOnboardingProgress,
  exportAccountData,
  suspendAccountByPlatformAdmin,
  reactivateAccountByPlatformAdmin,
  provisionPilotAccountByPlatformAdmin,
  createPilotOwnerInvitation,
  verifyAccountLinkTest,
  type CreateInvitationInput,
  type AcceptInvitationInput,
  type RecordProgressInput,
} from "../../lib/saas-onboarding-db.ts";

async function getAuthContext(
  requestedAccount?: string,
): Promise<{ context: AccountContext; appUserId: string } | null> {
  const user = await getPageAuth();
  if (!user || !(await isAffiliate(user))) return null;
  const context = await pageAccount(requestedAccount);
  if (!context || !context.actorAppUserId) return null;
  return { context, appUserId: context.actorAppUserId };
}

export async function provisionPilotAction(
  input: Parameters<typeof provisionPilotAccountByPlatformAdmin>[1] & {
    ownerEmail: string;
    invitationExpiresAt: string;
  },
) {
  const c = await platformPageContext();
  if (!c) return { ok: false, error: "platform_admin_required" };
  try {
    if (
      !input.ownerEmail?.trim().includes("@") ||
      !Number.isFinite(Date.parse(input.invitationExpiresAt)) ||
      Date.parse(input.invitationExpiresAt) <= Date.now()
    )
      throw new Error("invalid_invitation");
    await provisionPilotAccountByPlatformAdmin(c, input);
    const invitation = await createPilotOwnerInvitation(c, {
      targetTenantId: input.targetTenantId,
      email: input.ownerEmail,
      expiresAt: input.invitationExpiresAt,
    });
    return { ok: true, invitation };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
export async function verifyLinkTestAction(
  input: Parameters<typeof verifyAccountLinkTest>[1],
) {
  const c = await pageAccount();
  if (!c) return { ok: false, error: "forbidden" };
  try {
    await verifyAccountLinkTest(c, input);
    revalidatePath("/admin/onboarding");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function createAccountInvitationAction(
  input: CreateInvitationInput & { tenantId?: string },
): Promise<
  | { ok: true; invitationId: string; rawToken: string; expiresAt: string }
  | { ok: false; error: string }
> {
  const auth = await getAuthContext(input.tenantId);
  if (!auth) return { ok: false, error: "forbidden" };

  try {
    const res = await createAccountInvitation(auth.context, input);
    revalidatePath("/admin");
    return { ok: true, ...res };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "create_invitation_failed",
    };
  }
}

export async function acceptAccountInvitationAction(
  input: AcceptInvitationInput,
): Promise<
  | { ok: true; accepted: boolean; tenantId: string; role: string }
  | { ok: false; error: string }
> {
  const user = await getPageAuth();
  if (!user) return { ok: false, error: "unauthenticated" };

  if (!user.emailConfirmed || !user.email)
    return { ok: false, error: "verified_session_email_required" };
  const appUserId = await resolveAppUserId(user.id);
  if (!appUserId) return { ok: false, error: "identity_required" };

  try {
    const res = await acceptAccountInvitation(
      {
        actorAppUserId: appUserId,
        authenticatedAuthUserId: user.id,
        verifiedEmail: user.email,
        emailConfirmed: user.emailConfirmed,
      },
      input,
    );
    revalidatePath("/admin");
    return {
      ok: true,
      accepted: res.accepted,
      tenantId: res.tenantId,
      role: res.role,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "accept_invitation_failed",
    };
  }
}

export async function getAccountOnboardingStatusAction(
  tenantId?: string,
): Promise<{ ok: true; progress: any } | { ok: false; error: string }> {
  const auth = await getAuthContext(tenantId);
  if (!auth) return { ok: false, error: "forbidden" };

  try {
    const res = await getOnboardingProgress(auth.context);
    return { ok: true, progress: res };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "get_onboarding_failed",
    };
  }
}

export async function recordOnboardingProgressAction(
  input: RecordProgressInput & { tenantId?: string },
): Promise<
  { ok: true; step: string; status: string } | { ok: false; error: string }
> {
  const auth = await getAuthContext(input.tenantId);
  if (!auth) return { ok: false, error: "forbidden" };

  try {
    const res = await recordOnboardingProgress(auth.context, input);
    revalidatePath("/admin");
    return { ok: true, step: res.step, status: res.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "record_progress_failed",
    };
  }
}

export async function exportAccountDataAction(
  tenantId?: string,
): Promise<
  | { ok: true; exportJson: string; exportedAt: string }
  | { ok: false; error: string }
> {
  const auth = await getAuthContext(tenantId);
  if (!auth) return { ok: false, error: "forbidden" };

  try {
    const res = await exportAccountData(auth.context);
    return {
      ok: true,
      exportJson: JSON.stringify(res, null, 2),
      exportedAt: res.exportedAt,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "export_failed",
    };
  }
}

export async function suspendAccountAction(input: {
  targetTenantId: string;
  reason: string;
}): Promise<{ ok: true; suspended: boolean } | { ok: false; error: string }> {
  const user = await getPageAuth();
  if (!user) return { ok: false, error: "forbidden" };

  const context = await platformPageContext();
  if (!context) return { ok: false, error: "context_error" };

  try {
    const res = await suspendAccountByPlatformAdmin(context, {
      targetTenantId: input.targetTenantId,
      reason: input.reason,
    });
    revalidatePath("/admin");
    return { ok: true, suspended: res.suspended };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "suspend_failed",
    };
  }
}

export async function reactivateAccountAction(input: {
  targetTenantId: string;
  reason: string;
}): Promise<{ ok: true; reactivated: boolean } | { ok: false; error: string }> {
  const user = await getPageAuth();
  if (!user) return { ok: false, error: "forbidden" };

  const context = await platformPageContext();
  if (!context) return { ok: false, error: "context_error" };

  try {
    const res = await reactivateAccountByPlatformAdmin(context, {
      targetTenantId: input.targetTenantId,
      reason: input.reason,
    });
    revalidatePath("/admin");
    return { ok: true, reactivated: res.reactivated };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "reactivate_failed",
    };
  }
}
