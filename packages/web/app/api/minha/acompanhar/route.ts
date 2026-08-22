import { NextRequest } from "next/server";
import { resolveMemberIdentity, sinkJson } from "../../../../lib/api-auth";
import { parseWatchPayload } from "../../../../lib/member-contract";
import { ensureUser, startWatch, stopWatch } from "../../../../lib/member-db";

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** Começa a acompanhar: o baseline é o preço mais recente no momento da marcação. */
export async function POST(request: NextRequest) {
  const identity = await resolveMemberIdentity(request);
  if (!identity) return Response.json({ ok: false, error: "no_identity" }, { status: 401 });
  const payload = parseWatchPayload(await safeJson(request));
  if (!payload) return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  try {
    await ensureUser(identity.userId);
    const watch = await startWatch(identity.userId, payload.productId, payload.targetPriceCents);
    if (!watch) return sinkJson(identity.sink, { ok: false, error: "no_price_observation" }, { status: 422 });
    return sinkJson(identity.sink, { ok: true, watch });
  } catch {
    return sinkJson(identity.sink, { ok: false, error: "server_error" }, { status: 500 });
  }
}

/** Para de acompanhar: desativa sem apagar (o interesse é insumo do alerta M3). */
export async function DELETE(request: NextRequest) {
  const identity = await resolveMemberIdentity(request);
  if (!identity) return Response.json({ ok: false, error: "no_identity" }, { status: 401 });
  const payload = parseWatchPayload(await safeJson(request));
  if (!payload) return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  try {
    const stopped = await stopWatch(identity.userId, payload.productId);
    return sinkJson(identity.sink, { ok: true, stopped });
  } catch {
    return sinkJson(identity.sink, { ok: false, error: "server_error" }, { status: 500 });
  }
}
