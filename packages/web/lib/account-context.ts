import type postgres from "postgres";
import { db } from "./db.ts";
import { validTenantId } from "./tenant-db.ts";

/**
 * Contrato C-01 (EP-10A): Contexto operacional de conta autenticada.
 * Resolve-se no servidor após Supabase getUser, role e membership,
 * nunca do tenant recebido sem autorização.
 */
export interface AccountContext {
  tenantId: string;
  affiliateId: string;
  actor: "human" | "worker" | "device";
  actorAppUserId: string | null;
  authenticatedAuthUserId: string | null;
  membershipRole: "owner" | "operator" | null;
  requestId: string;
}

export interface UserAccountMembership {
  affiliateId: string;
  tenantId: string;
  publicSlug: string;
  displayName: string;
  accountStatus: "active" | "suspended";
  membershipRole: "owner" | "operator";
  appUserId: string;
}

/**
 * Lista as contas ativas às quais a pessoa autenticada (authUserId) possui vínculo não revogado (C-01).
 * Não expõe segredos.
 */
export async function getUserMemberships(
  authUserId: string,
  sqlFactory: typeof db = db,
): Promise<UserAccountMembership[]> {
  const sql = sqlFactory();
  try {
    let rows: {
      affiliate_id: string;
      tenant_id: string;
      public_slug: string;
      display_name: string;
      account_status: string;
      membership_role: string;
      app_user_id: string;
    }[];

    try {
      // 1. Chamar a função SECURITY DEFINER (M-10A1) para contornar o bootstrap sem tenant GUC
      rows = await sql<typeof rows>`
        select
          affiliate_id,
          tenant_id,
          public_slug,
          display_name,
          account_status,
          membership_role,
          app_user_id
        from garimpa.resolve_actor_accounts(${authUserId})
      `;
    } catch (error) {
      if ((error as { code?: string }).code !== "42883") throw error;
      // 2. Fallback direto caso a migration M-10A1 ainda não esteja instalada no ambiente
      const columns = await sql<
        { present: boolean }[]
      >`select exists(select 1 from information_schema.columns where table_schema='garimpa' and table_name='affiliate_membership' and column_name='revoked_at') as present`;
      rows = await sql<typeof rows>`
        select
          a.id as affiliate_id,
          a.tenant_id,
          a.public_slug,
          a.display_name,
          a.status as account_status,
          m.role as membership_role,
          u.id as app_user_id
        from garimpa.app_user u
        join garimpa.affiliate_membership m on m.app_user_id = u.id and ${sql.unsafe(columns[0]?.present ? "m.revoked_at is null" : "true")}
        join garimpa.affiliate_account a on a.id = m.affiliate_id and a.status = 'active'
        where u.auth_user_id = ${authUserId}
        order by (a.id = 'aff_local') desc, a.created_at asc
      `;
    }

    return rows.map((r) => ({
      affiliateId: r.affiliate_id,
      tenantId: r.tenant_id,
      publicSlug: r.public_slug,
      displayName: r.display_name,
      accountStatus: r.account_status as "active" | "suspended",
      membershipRole: r.membership_role as "owner" | "operator",
      appUserId: r.app_user_id,
    }));
  } finally {
    await sql.end();
  }
}

/**
 * Resolve e valida o AccountContext para a requisição ou ação.
 * Garante que a conta requisitada pertença às memberships ativas do usuário.
 * Falha fechada (retorna null) caso o usuário tente acessar conta alheia (C-01).
 */
export async function resolveAccountContext(params: {
  authUserId: string;
  requestedAccount?: string | null;
  requestId?: string;
  sqlFactory?: typeof db;
}): Promise<AccountContext | null> {
  const memberships = await getUserMemberships(
    params.authUserId,
    params.sqlFactory,
  );
  if (!memberships.length) return null;

  let selected: UserAccountMembership | undefined;
  if (params.requestedAccount) {
    selected = memberships.find(
      (m) =>
        m.affiliateId === params.requestedAccount ||
        m.tenantId === params.requestedAccount ||
        m.publicSlug === params.requestedAccount,
    );
    if (!selected) {
      // Pediu conta à qual não pertence: falha fechada
      return null;
    }
  } else {
    // Default: conta prioritária (casa se disponível, ou primeira vinculada)
    selected = memberships[0];
  }

  const requestId =
    params.requestId ?? (await import("node:crypto")).randomUUID();
  return {
    tenantId: selected.tenantId,
    affiliateId: selected.affiliateId,
    actor: "human",
    actorAppUserId: selected.appUserId,
    authenticatedAuthUserId: params.authUserId,
    membershipRole: selected.membershipRole,
    requestId,
  };
}
