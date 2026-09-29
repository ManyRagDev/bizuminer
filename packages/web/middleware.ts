import { NextRequest, NextResponse } from "next/server";
import { createMiddlewareSupabase } from "./lib/supabase";

const UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Identidade pré-auth + sessão (AL-3, 22/08/2026).
 *
 * 1. Todo visitante recebe o cookie httpOnly bm_uid: ele identifica o estado
 *    local a importar no login, mas não autoriza escrita na área pessoal.
 * 2. O Proxy do @supabase/ssr roda em TODAS as rotas: rotaciona o token e
 *    devolve a sessão nova. As páginas públicas (vitrine, produto) usam a
 *    sessão para personalizar — corações da conta em qualquer aparelho.
 * 3. Gates de rota: /minha-area e /admin sem sessão → /entrar; /api/admin/*
 *    sem sessão → 401; /api/minha/* exige sessão no próprio handler;
 *    /entrar com sessão → /minha-area. O gate real fica em cada página/API —
 *    o middleware é a UX, não a fronteira.
 */
export async function middleware(request: NextRequest) {
  const existing = request.cookies.get("bm_uid")?.value;
  const issuedUid = !existing || !UID_RE.test(existing) ? crypto.randomUUID() : null;
  if (issuedUid) request.cookies.set("bm_uid", issuedUid);

  const { supabase, supabaseResponse } = createMiddlewareSupabase(request);
  const { data } = await supabase.auth.getClaims();
  const authenticated = Boolean(data?.claims);

  const { pathname } = request.nextUrl;
  let response: NextResponse;

  if (pathname.startsWith("/api/admin/") || pathname === "/api/pauta") {
    // Painel: corta ausência de sessão cedo; o handler valida `afiliado`.
    response = authenticated
      ? supabaseResponse
      : NextResponse.json({ ok: false, error: "no_session" }, { status: 401 });
  } else if (pathname.startsWith("/api/minha/")) {
    // Área pessoal: o handler exige sessão e resolve o app_user.
    response = supabaseResponse;
  } else if (pathname === "/entrar") {
    response = authenticated
      ? NextResponse.redirect(new URL("/minha-area", request.url))
      : supabaseResponse;
  } else if (pathname === "/minha-area" || pathname === "/admin" || pathname === "/pauta" ||
             pathname.startsWith("/minha-area/") || pathname.startsWith("/admin/")) {
    response = authenticated
      ? supabaseResponse
      : NextResponse.redirect(new URL(`/entrar?next=${encodeURIComponent(pathname)}`, request.url));
  } else {
    // Público: só o refresh de sessão (para a personalização das páginas).
    response = supabaseResponse;
  }

  if (issuedUid) {
    response.cookies.set("bm_uid", issuedUid, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
  }
  return response;
}

export const config = {
  // Páginas e APIs; estáticos e assets ficam de fora.
  matcher: ["/((?!_next/|favicon|brand/|og-|apple-touch|site\\.webmanifest).*)"],
};
