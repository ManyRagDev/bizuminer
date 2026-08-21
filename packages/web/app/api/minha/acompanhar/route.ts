import { NextRequest } from "next/server";
import { parseWatchPayload, validUserId } from "../../../../lib/member-contract";
import { ensureUser, startWatch, stopWatch } from "../../../../lib/member-db";

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function identity(request: NextRequest): string | null {
  const uid = request.cookies.get("bm_uid")?.value;
  return validUserId(uid) ? uid : null;
}

/** Começa a acompanhar: o baseline é o preço mais recente no momento da marcação. */
export async function POST(request: NextRequest) {
  const userId = identity(request);
  if (!userId) return Response.json({ ok: false, error: "no_identity" }, { status: 401 });
  const payload = parseWatchPayload(await safeJson(request));
  if (!payload) return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  try {
    await ensureUser(userId);
    const watch = await startWatch(userId, payload.productId, payload.targetPriceCents);
    if (!watch) return Response.json({ ok: false, error: "no_price_observation" }, { status: 422 });
    return Response.json({ ok: true, watch });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

/** Para de acompanhar: desativa sem apagar (o interesse é insumo do alerta M3). */
export async function DELETE(request: NextRequest) {
  const userId = identity(request);
  if (!userId) return Response.json({ ok: false, error: "no_identity" }, { status: 401 });
  const payload = parseWatchPayload(await safeJson(request));
  if (!payload) return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  try {
    const stopped = await stopWatch(userId, payload.productId);
    return Response.json({ ok: true, stopped });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
