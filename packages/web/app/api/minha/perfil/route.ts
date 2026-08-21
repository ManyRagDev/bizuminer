import { NextRequest } from "next/server";
import { catalogCategories } from "../../../../lib/db";
import { allowedProfileCategories, parseProfilePayload, validUserId } from "../../../../lib/member-contract";
import { ensureUser, getProfile, saveProfile } from "../../../../lib/member-db";

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

export async function GET(request: NextRequest) {
  const userId = identity(request);
  if (!userId) return Response.json({ ok: false, error: "no_identity" }, { status: 401 });
  try {
    const profile = await getProfile(userId);
    return Response.json({ ok: true, profile }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

/** Preferências validadas contra as categorias reais do catálogo. */
export async function POST(request: NextRequest) {
  const userId = identity(request);
  if (!userId) return Response.json({ ok: false, error: "no_identity" }, { status: 401 });
  try {
    // Aceita o catálogo inteiro e o que já estava gravado. Validar contra a
    // varredura corrente apagava preferência em silêncio (defeito de 19/08).
    const [catalog, current] = await Promise.all([catalogCategories(), getProfile(userId)]);
    const allowed = allowedProfileCategories(catalog, current.preferredCategories);
    const payload = parseProfilePayload(await safeJson(request), allowed);
    if (!payload) return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
    await ensureUser(userId);
    await saveProfile(userId, payload);
    return Response.json({ ok: true, profile: payload });
  } catch {
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
