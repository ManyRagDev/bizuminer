import { NextRequest } from "next/server";
import { checkAdminUser, sinkJson } from "../../../../lib/api-auth";
import { listAffiliateAccounts } from "../../../../lib/affiliate-db";

export const runtime = "nodejs";

/**
 * Lista as contas de afiliado para o painel do dono (E1).
 * Nunca devolve tracking_id/tool_id — apenas configured/status/validatedAt.
 */
export async function GET(request: NextRequest) {
  const check = await checkAdminUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  try {
    const accounts = await listAffiliateAccounts();
    return sinkJson(check.sink, { ok: true, accounts }, { status: 200 });
  } catch {
    return sinkJson(check.sink, { ok: false, error: "server_error" }, { status: 500 });
  }
}
