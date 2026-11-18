import { NextRequest, NextResponse } from "next/server";
import { authLoginMethods, sanitizeNext } from "../../../lib/auth-contract.ts";
import { mergeAnonymousIntoAuth } from "../../../lib/auth-merge.ts";
import { attachSink, createCookieSink, createRouteSupabase } from "../../../lib/supabase.ts";

export const dynamic = "force-dynamic";
export const preferredRegion = "gru1";
const MAX_BODY_BYTES = 65_536;
const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

/** NextURL rewrites loopback names; Host preserves the browser cookie origin.
 * The reverse proxy must preserve Host/protocol. Forwarded-Host is not trusted.
 */
function loginRequestOrigin(request: NextRequest): string | null {
  const protocol = request.nextUrl.protocol;
  if (protocol !== "https:" && protocol !== "http:") return null;
  const host = request.headers.get("host");
  if (host === null) return request.nextUrl.origin;
  if (host.length > 320 || !/^(?:\[[0-9a-f:.]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.?)(?::[0-9]{1,5})?$/i.test(host)) return null;
  try {
    const url = new URL(`${protocol}//${host}`);
    return url.hostname && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
}

/** Bound form input before parsing; never echo credentials in redirects/errors. */
async function readLoginForm(request: NextRequest): Promise<URLSearchParams | null> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") return null;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export async function POST(request: NextRequest) {
  if (!authLoginMethods(process.env.AUTH_LOGIN_MODE).password) return new NextResponse("Entrada indisponível", { status: 404, headers: NO_STORE });
  const origin = loginRequestOrigin(request);
  if (!origin || request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return new NextResponse("Solicitação inválida", { status: 403, headers: NO_STORE });
  }
  const form = await readLoginForm(request);
  const next = sanitizeNext(form?.get("next"));
  const fail = () => {
    const target = new URL("/entrar", origin);
    target.searchParams.set("erro", "credenciais");
    target.searchParams.set("next", next);
    return NextResponse.redirect(target, { status: 303, headers: NO_STORE });
  };
  const email = form?.get("email")?.trim() ?? "";
  const password = form?.get("password") ?? "";
  if (!form || form.getAll("email").length !== 1 || form.getAll("password").length !== 1 || form.getAll("next").length > 1
      || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || password.length === 0 || password.length > 4096) return fail();

  // The SDK writes session cookies into a sink. Publish them only after getUser
  // verifies the new identity server-side, never from form fields or claims.
  const sink = createCookieSink();
  try {
    const supabase = createRouteSupabase(request, sink);
    const signedIn = await supabase.auth.signInWithPassword({ email, password });
    if (signedIn.error) return fail();
    const verified = await supabase.auth.getUser();
    const user = verified.data.user;
    if (verified.error || !user || signedIn.data.user?.id !== user.id) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      return fail();
    }
    const meta = user.user_metadata ?? {};
    try {
      await mergeAnonymousIntoAuth({
        authUserId: user.id,
        email: user.email ?? null,
        displayName: typeof meta.full_name === "string" && meta.full_name.trim() ? meta.full_name.trim()
          : typeof meta.name === "string" ? meta.name.trim() : null,
        bmUid: request.cookies.get("bm_uid")?.value ?? null,
      });
    } catch {
      // Same idempotent personal-data merge as OAuth; never grants account roles.
      // Existing session pages retry a missing app_user link when necessary.
    }
    const response = attachSink(sink, NextResponse.redirect(new URL(next, origin), { status: 303 }));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Pragma", "no-cache");
    return response;
  } catch { return fail(); }
}
