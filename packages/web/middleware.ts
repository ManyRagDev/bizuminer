import { NextRequest, NextResponse } from "next/server";

const UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Identidade pré-auth: todo visitante recebe um UUID em cookie httpOnly.
 * Nenhum dado pessoal — o cookie só permite que salvos/acompanhamentos
 * sobrevivam à sessão. Quando o auth chegar (AL-3), este id vira o elo
 * de merge com a conta (app_user.auth_user_id).
 */
export function middleware(request: NextRequest) {
  const existing = request.cookies.get("bm_uid")?.value;
  if (existing && UID_RE.test(existing)) return NextResponse.next();

  const response = NextResponse.next();
  response.cookies.set("bm_uid", crypto.randomUUID(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return response;
}

export const config = {
  // Páginas e APIs; estáticos e assets ficam de fora.
  matcher: ["/((?!_next/|favicon|brand/|og-|apple-touch|site\\.webmanifest).*)"],
};
