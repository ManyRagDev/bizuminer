import { NextRequest } from "next/server";
import { checkAdminUser, sinkJson } from "../../../../lib/api-auth";
import { resolveAppUserId } from "../../../../lib/auth";
import { createPairingCode } from "../../../../lib/extension-db";
import { captureIpKey } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

/**
 * Cria um código de pareamento para um dispositivo (E4, plano §7.1).
 * Só o dono (ADMIN_EMAIL) chama; o código bruto aparece UMA vez, aqui. O banco
 * guarda só o hash. Pilot: afiliado é a casa (aff_local).
 */

const PAIRING_HOURLY_LIMIT = 5;
const pairingAttempts = new Map<string, number[]>();

function pairingLimited(key: string): boolean {
  const now = Date.now();
  const cutoff = now - 60 * 60 * 1000;
  const times = (pairingAttempts.get(key) ?? []).filter((t) => t > cutoff);
  if (times.length >= PAIRING_HOURLY_LIMIT) {
    pairingAttempts.set(key, times);
    return true;
  }
  times.push(now);
  pairingAttempts.set(key, times);
  return false;
}

export async function POST(request: NextRequest) {
  const check = await checkAdminUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const ip = captureIpKey(request.headers.get("x-forwarded-for"));
  if (pairingLimited(`pair:${check.user.id}:${ip}`)) {
    return sinkJson(check.sink, { ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: { deviceName?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return sinkJson(check.sink, { ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deviceName = typeof body.deviceName === "string" ? body.deviceName.trim() : "";
  if (deviceName.length < 1 || deviceName.length > 80) {
    return sinkJson(check.sink, { ok: false, error: "invalid_device_name" }, { status: 400 });
  }

  const appUserId = await resolveAppUserId(check.user.id);
  if (!appUserId) {
    return sinkJson(check.sink, { ok: false, error: "app_user_not_found" }, { status: 409 });
  }

  try {
    const { deviceId, pairingCode, expiresAt } = await createPairingCode({
      affiliateId: "aff_local",
      appUserId,
      deviceName,
    });
    return sinkJson(check.sink, { ok: true, deviceId, pairingCode, expiresAt: expiresAt.toISOString() }, { status: 201 });
  } catch {
    return sinkJson(check.sink, { ok: false, error: "server_error" }, { status: 500 });
  }
}
