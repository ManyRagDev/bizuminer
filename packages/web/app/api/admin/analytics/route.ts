import type { NextRequest } from "next/server";
import { sinkJson } from "../../../../lib/api-auth.ts";
import { getRouteAuth, roleAccess } from "../../../../lib/auth.ts";
import { getGA4DashboardData } from "../../../../lib/ga4-reporting.ts";
import { createCookieSink } from "../../../../lib/supabase.ts";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const sink = createCookieSink();
  const user = await getRouteAuth(request, sink);
  if (!user) {
    return sinkJson(sink, { ok: false, error: "no_session" }, { status: 401, headers });
  }
  if (!(await roleAccess(user.id, "platform_admin"))) {
    return sinkJson(sink, { ok: false, error: "forbidden" }, { status: 403, headers });
  }

  const force = request.nextUrl.searchParams.get("refresh") === "1";
  const result = await getGA4DashboardData(force);
  return sinkJson(sink, result, {
    status: result.status === "unavailable" ? 503 : 200,
    headers,
  });
}
