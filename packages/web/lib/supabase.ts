import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/**
 * Clientes Supabase do BizuMiner (AL-3, 22/08/2026).
 *
 * O login inteiro roda server-side: o browser só vê a chave publishable no
 * botão "Continuar com Google" (NEXT_PUBLIC_). A chave publishable nunca tem
 * poder sobre o banco — todo acesso a dados continua pelo DATABASE_URL com a
 * role garimpa_app, como antes.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
const PUBLIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function requireServerEnv(): void {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY ausentes do ambiente");
  }
}

/** Browser: só para iniciar o fluxo OAuth (botão "Continuar com Google"). */
export function createBrowserSupabase() {
  if (!PUBLIC_URL || !PUBLIC_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ausentes");
  }
  return createBrowserClient(PUBLIC_URL, PUBLIC_KEY);
}

/**
 * Server components (páginas): leitura via cookies() do Next. Escrita não é
 * possível aqui — quem escreve/rotaciona a sessão é o middleware (Proxy).
 */
export async function createPageSupabase() {
  requireServerEnv();
  const store = await cookies();
  return createServerClient(SUPABASE_URL!, SUPABASE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // setAll durante render de Server Component: o Proxy escreve na resposta final.
        }
      },
    },
  });
}

/**
 * Route handlers: o `response` é a resposta final que a rota vai devolver;
 * cookies de sessão (refresh, logout, exchange) caem nela. Chamadas seguintes
 * dentro do mesmo handler enxergam a sessão porque o cookie também é gravado
 * no request.
 */
export function createRouteSupabase(request: NextRequest, response: NextResponse) {
  requireServerEnv();
  return createServerClient(SUPABASE_URL!, SUPABASE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });
}

/**
 * Middleware (Proxy do @supabase/ssr): rotaciona o token e devolve o
 * NextResponse com a sessão nova; o request carrega os cookies atualizados
 * para o NextResponse.next({ request }) da resposta.
 */
export function createMiddlewareSupabase(request: NextRequest) {
  requireServerEnv();
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL!, SUPABASE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => supabaseResponse.headers.set(key, value));
      },
    },
  });
  return { supabase, supabaseResponse };
}

/** Sink estável para rotas que ainda não sabem qual resposta vão devolver. */
export function createCookieSink(): NextResponse {
  return new NextResponse(null, { status: 200 });
}

/** Transfere cookies/headers do sink para a resposta final da rota. */
export function attachSink(sink: NextResponse, response: NextResponse): NextResponse {
  for (const cookie of sink.cookies.getAll()) {
    response.cookies.set(cookie.name, cookie.value, {
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
      path: cookie.path,
      expires: cookie.expires,
      maxAge: cookie.maxAge,
      domain: cookie.domain,
    });
  }
  for (const [key, value] of sink.headers.entries()) response.headers.set(key, value);
  return response;
}
