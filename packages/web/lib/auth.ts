import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "./auth-contract.ts";
import { mergeAnonymousIntoAuth } from "./auth-merge.ts";
import { db } from "./db.ts";
import { createPageSupabase, createRouteSupabase } from "./supabase.ts";

/**
 * Sessão e identidade no servidor (AL-3, 22/08/2026).
 *
 * Identidade resolvida em duas camadas:
 *  - Supabase Auth (getUser) → quem é a pessoa;
 *  - app_user (auth_user_id) → a linha de dados dela no schema garimpa.
 *
 * O vínculo nasce no /auth/callback (merge). Nenhum dado pessoal entra em
 * cookie de sessão além do que o Supabase já guarda.
 */

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
}

function toAuthUser(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }): AuthUser {
  const meta = user.user_metadata ?? {};
  const name =
    typeof meta.full_name === "string" && meta.full_name.trim()
      ? meta.full_name.trim()
      : typeof meta.name === "string"
        ? meta.name.trim()
        : null;
  return { id: user.id, email: user.email ?? null, name };
}

/** Página (server component): sessão vinda dos cookies + getUser() na rede. */
export async function getPageAuth(): Promise<AuthUser | null> {
  const supabase = await createPageSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return toAuthUser(data.user);
}

/** Route handler: mesma checagem, com o response como destino da sessão. */
export async function getRouteAuth(request: NextRequest, response: NextResponse): Promise<AuthUser | null> {
  const supabase = createRouteSupabase(request, response);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return toAuthUser(data.user);
}

/** O dono é único: e-mail normalizado === ADMIN_EMAIL. Sem coluna `role` —
 *  decisão do documento mestre (cliente e dono em modelos separados). */
export function isAdmin(user: AuthUser): boolean {
  return isAdminEmail(user.email);
}

/** Linha app_user da conta autenticada (via auth_user_id), ou null. */
export async function resolveAppUserId(authUserId: string, tenantId = "local"): Promise<string | null> {
  const sql = db();
  try {
    const rows = await sql<{ id: string }[]>`
      select id
      from garimpa.app_user
      where tenant_id = ${tenantId} and auth_user_id = ${authUserId}
      limit 1
    `;
    return rows[0]?.id ?? null;
  } finally {
    await sql.end();
  }
}

export interface PageSession {
  authUser: AuthUser;
  appUserId: string;
}

/**
 * Sessão de página + linha app_user correspondente. Usado pelas páginas
 * públicas que personalizam algo (vitrine, produto): sem sessão → null;
 * com sessão, devolve o id de dados. O merge idempotente cobre o caminho
 * raro de sessão sem vínculo (o normal já nasce no /auth/callback).
 */
export async function getPageSession(bmUid: string | null): Promise<PageSession | null> {
  const user = await getPageAuth();
  if (!user) return null;
  let appUserId = await resolveAppUserId(user.id);
  if (!appUserId) {
    appUserId = await mergeAnonymousIntoAuth({
      authUserId: user.id,
      email: user.email,
      displayName: user.name,
      bmUid,
    });
  }
  return { authUser: user, appUserId };
}
