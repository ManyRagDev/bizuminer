import { NextRequest, NextResponse } from "next/server";
import { createRouteSupabase } from "../../../lib/supabase";

/**
 * Logout: derruba a sessão no Supabase e limpa os cookies de auth.
 * O bm_uid fica (identidade anônima do navegador) — não é conta.
 */
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.nextUrl.origin));
  const supabase = createRouteSupabase(request, response);
  await supabase.auth.signOut();
  return response;
}
