import { NextRequest } from "next/server";
import { resolveMemberIdentity, sinkJson } from "../../../../lib/api-auth";
import { parseFavoriteBulkPayload, parseFavoritePayload } from "../../../../lib/member-contract";
import { bulkFavorites, ensureUser, setFavorite } from "../../../../lib/member-db";

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** Alterna um favorito no servidor (o localStorage continua como cache local). */
export async function POST(request: NextRequest) {
  const identity = await resolveMemberIdentity(request);
  if (!identity) return Response.json({ ok: false, error: "no_identity" }, { status: 401 });
  const payload = parseFavoritePayload(await safeJson(request));
  if (!payload) return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  try {
    await ensureUser(identity.userId);
    const applied = await setFavorite(identity.userId, payload.productId, payload.saved);
    return sinkJson(identity.sink, { ok: true, applied });
  } catch {
    return sinkJson(identity.sink, { ok: false, error: "server_error" }, { status: 500 });
  }
}

/** Migração dos salvos do navegador: idempotente, ids desconhecidos caem em silêncio. */
export async function PUT(request: NextRequest) {
  const identity = await resolveMemberIdentity(request);
  if (!identity) return Response.json({ ok: false, error: "no_identity" }, { status: 401 });
  const payload = parseFavoriteBulkPayload(await safeJson(request));
  if (!payload) return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  try {
    await ensureUser(identity.userId);
    const imported = await bulkFavorites(identity.userId, payload.productIds);
    return sinkJson(identity.sink, { ok: true, imported });
  } catch {
    return sinkJson(identity.sink, { ok: false, error: "server_error" }, { status: 500 });
  }
}
