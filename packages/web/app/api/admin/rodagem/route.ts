import { inAccountScope } from "../../../../lib/account-scope.ts";
import { NextRequest } from "next/server";
import { checkAffiliateUser, sinkJson } from "../../../../lib/api-auth";

export const preferredRegion = "gru1";

export const runtime = "nodejs";

/**
 * Rota legada de rodagem direta: Mercado Livre é exclusivamente manual.
 * Retorna instrução manual sem criar lote e sem disparar execuções automatizadas.
 */
export async function POST(request: NextRequest) {
  const check = await checkAffiliateUser(request);
  if (check.kind === "no_session")
    return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden")
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  return inAccountScope(check.context, async () => {
    return sinkJson(
      check.sink,
      {
        ok: false,
        error: "manual_capture_only",
        message:
          "A captura do Mercado Livre é exclusivamente manual. Utilize a extensão ou o bookmarklet no navegador.",
      },
      { status: 409 },
    );
  });
}

