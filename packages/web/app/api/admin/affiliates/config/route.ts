import { NextRequest } from "next/server";
import { checkAdminUser, sinkJson } from "../../../../../lib/api-auth";
import { upsertMarketplaceConfig } from "../../../../../lib/affiliate-db";

export const runtime = "nodejs";

/**
 * Grava/atualiza a credencial de marketplace de um afiliado (E1).
 *
 * Só o dono (ADMIN_EMAIL) chama. O corpo carrega tracking_id/tool_id; a
 * resposta NUNCA os devolve — apenas configured/status/validatedAt. A
 * credencial é configuração autoritativa do servidor (R2): o client a envia,
 * mas nunca a recebe de volta nem a escolhe para outra conta.
 */
export async function POST(request: NextRequest) {
  const check = await checkAdminUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  let body: { affiliateId?: unknown; marketplace?: unknown; trackingId?: unknown; toolId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return sinkJson(check.sink, { ok: false, error: "invalid_body" }, { status: 400 });
  }

  const affiliateId = typeof body.affiliateId === "string" ? body.affiliateId.trim() : "";
  const marketplace = typeof body.marketplace === "string" ? body.marketplace.trim() : "";
  const trackingId = typeof body.trackingId === "string" ? body.trackingId.trim() : "";
  const toolId = typeof body.toolId === "string" ? body.toolId.trim() : "";

  if (!affiliateId || marketplace !== "mercadolivre" || !trackingId || !toolId) {
    return sinkJson(check.sink, { ok: false, error: "invalid_payload" }, { status: 400 });
  }

  try {
    const config = await upsertMarketplaceConfig({ affiliateId, marketplace, trackingId, toolId });
    return sinkJson(check.sink, { ok: true, config }, { status: 200 });
  } catch {
    return sinkJson(check.sink, { ok: false, error: "server_error" }, { status: 500 });
  }
}
