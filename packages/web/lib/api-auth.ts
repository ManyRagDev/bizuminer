import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth, isAdmin, resolveAppUserId, type AuthUser } from "./auth.ts";
import { mergeAnonymousIntoAuth } from "./auth-merge.ts";
import { validUserId } from "./member-contract.ts";
import { attachSink, createCookieSink } from "./supabase.ts";

/**
 * Identidade e autorização das APIs (AL-3, 22/08/2026).
 *
 * Área do cliente — modelo híbrido (decisão de 22/08):
 *  1. sessão Supabase → linha app_user via auth_user_id (merge idempotente
 *     se o vínculo faltar por um caminho raro);
 *  2. sem sessão → cookie bm_uid, exatamente como antes do login.
 *
 * Painel — exclusivo do dono: sessão + e-mail === ADMIN_EMAIL. 401 sem
 * sessão, 403 com sessão de outra conta.
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
  const uid = request.cookies.get("bm_uid")?.value;
  if (!validUserId(uid)) return null;
  return { userId: uid, sink };
}

export type AdminCheck =
  | { kind: "ok"; user: AuthUser; sink: NextResponse }
  | { kind: "no_session" }
  | { kind: "forbidden" };

export async function checkAdminUser(request: NextRequest): Promise<AdminCheck> {
  const sink = createCookieSink();
  const auth = await getRouteAuth(request, sink);
  if (!auth) return { kind: "no_session" };
  if (!isAdmin(auth)) return { kind: "forbidden" };
  return { kind: "ok", user: auth, sink };
}

/** Resposta JSON com os cookies de sessão do sink aplicados. */
export function sinkJson(sink: NextResponse, body: unknown, init?: ResponseInit): NextResponse {
  return attachSink(sink, NextResponse.json(body, init));
}
