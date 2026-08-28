import { NextRequest } from "next/server";
import { checkAdminUser, sinkJson } from "../../../../../lib/api-auth";
import { listDevices, revokeDevice, renameDevice } from "../../../../../lib/extension-admin";

export const runtime = "nodejs";

/**
 * Gestão de dispositivos da extensão (E7). Só o dono. GET lista os dispositivos
 * do afiliado (sem token bruto/hash); POST revoga ou renomeia, escopado ao
 * afiliado dono — um ID forjado de outro afiliado não age.
 */

export async function GET(request: NextRequest) {
  const check = await checkAdminUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const affiliateId = request.nextUrl.searchParams.get("affiliateId") ?? "aff_local";
  try {
    const devices = await listDevices(affiliateId);
    return sinkJson(check.sink, { ok: true, devices }, { status: 200 });
  } catch {
    return sinkJson(check.sink, { ok: false, error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const check = await checkAdminUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  let body: { action?: unknown; affiliateId?: unknown; deviceId?: unknown; name?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return sinkJson(check.sink, { ok: false, error: "invalid_body" }, { status: 400 });
  }

  const affiliateId = typeof body.affiliateId === "string" ? body.affiliateId : "aff_local";
  const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";

  if (!deviceId) return sinkJson(check.sink, { ok: false, error: "invalid_payload" }, { status: 400 });

  try {
    if (body.action === "revoke") {
      const ok = await revokeDevice(affiliateId, deviceId);
      return sinkJson(check.sink, { ok, revoked: ok }, { status: ok ? 200 : 404 });
    }
    if (body.action === "rename") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (name.length < 1 || name.length > 80) return sinkJson(check.sink, { ok: false, error: "invalid_name" }, { status: 400 });
      const ok = await renameDevice(affiliateId, deviceId, name);
      return sinkJson(check.sink, { ok, renamed: ok }, { status: ok ? 200 : 404 });
    }
    return sinkJson(check.sink, { ok: false, error: "invalid_action" }, { status: 400 });
  } catch {
    return sinkJson(check.sink, { ok: false, error: "server_error" }, { status: 500 });
  }
}
