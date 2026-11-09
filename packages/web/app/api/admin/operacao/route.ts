import type { NextRequest } from "next/server";
import { checkAffiliateUser, sinkJson } from "../../../../lib/api-auth.ts";
import { inAccountScope } from "../../../../lib/account-scope.ts";
import { readPautaAvailability } from "../../../../lib/pauta-db.ts";
import { readTodayOperations } from "../../../../lib/today-operation-db.ts";
import type { TodayStatus } from "../../../../lib/today-operation.ts";

export const preferredRegion = "gru1";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const check = await checkAffiliateUser(request);
  if (check.kind !== "ok") return Response.json({ ok: false }, { status: check.kind === "no_session" ? 401 : 403, headers });
  return inAccountScope(check.context, async () => {
    try {
      const { context, sink } = check;
      const [operation, whatsapp, stories] = await Promise.all([
        readTodayOperations(context),
        readPautaAvailability(context, "whatsapp").catch(() => null),
        readPautaAvailability(context, "stories").catch(() => null),
      ]);
      const status: TodayStatus = { ...operation, pauta: { whatsapp, stories } };
      return sinkJson(sink, status, { headers });
    } catch {
      return sinkJson(check.sink, { ok: false }, { status: 503, headers });
    }
  });
}
