import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth, roleAccess, resolveAppUserId, type AuthUser } from "./auth.ts";
import { mergeAnonymousIntoAuth } from "./auth-merge.ts";
import { validUserId } from "./member-contract.ts";
import { attachSink, createCookieSink } from "./supabase.ts";

/**
 * Identidade e autorização das APIs (AL-3, 22/08/2026).
 *
 * Área pessoal: sessão Supabase → linha app_user via auth_user_id. O
 * cookie bm_uid serve apenas para importar os dados locais durante o login;
 * sem cadastro, os favoritos permanecem somente no localStorage.
 *
 * Painel/operação — exclusivo de quem possui a role `afiliado`. 401 sem
 * sessão, 403 com sessão sem a role.
 */

export interface MemberIdentity {
  userId: string;
  sink: NextResponse;
}

export async function resolveMemberIdentity(request: NextRequest): Promise<MemberIdentity | null> {
  const sink = createCookieSink();
  const user = await getRouteAuth(request, sink);
  if (user) {
    let appUserId = await resolveAppUserId(user.id);
    if (!appUserId) {
      const uid = request.cookies.get("bm_uid")?.value;
      appUserId = await mergeAnonymousIntoAuth({
        authUserId: user.id,
        email: user.email,
        displayName: user.name,
        bmUid: validUserId(uid) ? uid : null,
      });
    }
    return { userId: appUserId, sink };
  }
  return null;
}

export type AffiliateCheck =
  | { kind: "ok"; user: AuthUser; appUserId: string; sink: NextResponse }
  | { kind: "no_session" }
  | { kind: "forbidden" };

export async function checkAffiliateUser(request: NextRequest): Promise<AffiliateCheck> {
  const sink = createCookieSink();
  const auth = await getRouteAuth(request, sink);
  if (!auth) return { kind: "no_session" };
  const access = await roleAccess(auth.id, "afiliado");
  if (!access) return { kind: "forbidden" };
  return { kind: "ok", user: auth, appUserId: access.appUserId, sink };
}

/** Resposta JSON com os cookies de sessão do sink aplicados. */
export function sinkJson(sink: NextResponse, body: unknown, init?: ResponseInit): NextResponse {
  return attachSink(sink, NextResponse.json(body, init));
}
