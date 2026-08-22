import { NextRequest, NextResponse } from "next/server";
import { mergeAnonymousIntoAuth } from "../../../lib/auth-merge";
import { sanitizeNext } from "../../../lib/auth-contract";
import { createRouteSupabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Retorno do Google OAuth (PKCE). Troca o código pela sessão, roda o merge
 * bm_uid → conta e redireciona para onde a pessoa ia. `next` é sanitizado:
 * só caminho interno (anti open-redirect).
 *
 * A origem do redirect é a do próprio request: o redirectTo do login foi
 * montado com window.location.origin, então o callback devolve para o mesmo
 * ambiente (localhost em dev, domínio canônico em produção) — nunca o oposto.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const next = sanitizeNext(request.nextUrl.searchParams.get("next"), "/minha-area");

  if (!code) {
    return NextResponse.redirect(new URL("/entrar?erro=1", origin));
  }

  const response = NextResponse.redirect(new URL(next, origin));
  const supabase = createRouteSupabase(request, response);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/entrar?erro=auth", origin));
  }

  const { data } = await supabase.auth.getUser();
  const user = data?.user ?? null;
  if (user) {
    const meta = user.user_metadata ?? {};
    try {
      await mergeAnonymousIntoAuth({
        authUserId: user.id,
        email: user.email ?? null,
        displayName:
          typeof meta.full_name === "string" && meta.full_name.trim()
            ? meta.full_name.trim()
            : typeof meta.name === "string"
              ? meta.name.trim()
              : null,
        bmUid: request.cookies.get("bm_uid")?.value ?? null,
      });
    } catch {
      // Merge falhou: a sessão existe e a área funciona; o vínculo será
      // refeito na próxima escrita autenticada. Erro não derruba o login.
    }
  }

  return response;
}
