import { NextRequest } from "next/server";
import { resolveMemberIdentity, sinkJson } from "../../../../lib/api-auth";
import { catalogCategories } from "../../../../lib/db";
import { allowedProfileCategories, parseProfilePayload } from "../../../../lib/member-contract";
import { ensureUser, getProfile, saveProfile } from "../../../../lib/member-db";

async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const identity = await resolveMemberIdentity(request);
  if (!identity) return Response.json({ ok: false, error: "no_identity" }, { status: 401 });
  try {
    const profile = await getProfile(identity.userId);
    return sinkJson(identity.sink, { ok: true, profile }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return sinkJson(identity.sink, { ok: false, error: "server_error" }, { status: 500 });
  }
}

/** Preferências validadas contra as categorias reais do catálogo. */
export async function POST(request: NextRequest) {
  const identity = await resolveMemberIdentity(request);
  if (!identity) return Response.json({ ok: false, error: "no_identity" }, { status: 401 });
  try {
    // Aceita o catálogo inteiro e o que já estava gravado. Validar contra a
    // varredura corrente apagava preferência em silêncio (defeito de 19/08).
    const [catalog, current] = await Promise.all([catalogCategories(), getProfile(identity.userId)]);
    const allowed = allowedProfileCategories(catalog, current.preferredCategories);
    const payload = parseProfilePayload(await safeJson(request), allowed);
    if (!payload) return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
    await ensureUser(identity.userId);
    await saveProfile(identity.userId, payload);
    return sinkJson(identity.sink, { ok: true, profile: payload });
  } catch {
    return sinkJson(identity.sink, { ok: false, error: "server_error" }, { status: 500 });
  }
}
