import { NextRequest } from "next/server";
import { parseFavoriteBulkPayload, parseFavoritePayload, validUserId } from "../../../../lib/member-contract";
import { bulkFavorites, ensureUser, setFavorite } from "../../../../lib/member-db";

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

/** Alterna um favorito no servidor (o localStorage continua como cache local). */
export async function POST(request: NextRequest) {
  const userId = identity(request);
  if (!userId) return Response.json({ ok: false, error: "no_identity" }, { status: 401 });
  const payload = parseFavoritePayload(await safeJson(request));
  if (!payload) return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  try {
    await ensureUser(userId);
    const applied = await setFavorite(userId, payload.productId, payload.saved);
    return Response.json({ ok: true, applied });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

/** Migração dos salvos do navegador: idempotente, ids desconhecidos caem em silêncio. */
export async function PUT(request: NextRequest) {
  const userId = identity(request);
  if (!userId) return Response.json({ ok: false, error: "no_identity" }, { status: 401 });
  const payload = parseFavoriteBulkPayload(await safeJson(request));
  if (!payload) return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  try {
    await ensureUser(userId);
    const imported = await bulkFavorites(userId, payload.productIds);
    return Response.json({ ok: true, imported });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
