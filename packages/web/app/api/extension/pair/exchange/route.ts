import { NextRequest } from "next/server";
import { extensionCorsHeaders } from "../../../../../lib/extension-cors";
import { exchangePairingCode } from "../../../../../lib/extension-db";
import { normalizePairingCode } from "../../../../../lib/extension-token";
import { captureIpKey } from "../../../../../lib/rate-limit";

export const runtime = "nodejs";

/**
 * Troca código de pareamento por token (E4, plano §7.2). CORS restrito às
 * origens configuradas. Código inválido/expirado usa mensagem genérica; limite
 * por IP evita enumeração.
 */

const EXCHANGE_WINDOW_MS = 60 * 1000;
const EXCHANGE_LIMIT = 10;
const exchangeAttempts = new Map<string, number[]>();

function exchangeLimited(key: string): boolean {
  const now = Date.now();
  const cutoff = now - EXCHANGE_WINDOW_MS;
  const times = (exchangeAttempts.get(key) ?? []).filter((t) => t > cutoff);
  if (times.length >= EXCHANGE_LIMIT) {
    exchangeAttempts.set(key, times);
    return true;
  }
  times.push(now);
  exchangeAttempts.set(key, times);
  return false;
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: extensionCorsHeaders(request.headers.get("origin")) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = extensionCorsHeaders(origin);

  const ip = captureIpKey(request.headers.get("x-forwarded-for"));
  if (exchangeLimited(`exchange:${ip}`)) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429, headers });
  }

  let body: { pairingCode?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_body" }, { status: 400, headers });
  }

  const code = typeof body.pairingCode === "string" ? normalizePairingCode(body.pairingCode) : "";
  if (!code) {
    return Response.json({ ok: false, error: "invalid_payload" }, { status: 400, headers });
  }

  try {
    const result = await exchangePairingCode(code);
    if (!result) {
      // Genérico de propósito: não revela se o código não existe ou expirou.
      return Response.json({ ok: false, error: "invalid_or_expired_code" }, { status: 401, headers });
    }
    return Response.json({ ok: true, ...result }, { status: 200, headers });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500, headers });
  }
}
