import { NextRequest } from "next/server";
import { checkAdminUser, sinkJson } from "../../../../../lib/api-auth";
import { houseMonitoringPolicies, houseMonitoringPolicyEvents, setHouseMonitoringPolicy } from "../../../../../lib/affiliate-monitoring-db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const check = await checkAdminUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const [policies, events] = await Promise.all([houseMonitoringPolicies(), houseMonitoringPolicyEvents()]);
    return sinkJson(check.sink, { ok: true, policies, events },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return sinkJson(check.sink, { ok: false, error: "policy_unavailable" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const check = await checkAdminUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return sinkJson(check.sink, { ok: false, error: "invalid_origin" }, { status: 403 });
  }
  let body: { marketplace?: unknown; enabled?: unknown };
  try { body = await request.json() as typeof body; }
  catch { return sinkJson(check.sink, { ok: false, error: "invalid_body" }, { status: 400 }); }
  if ((body.marketplace !== "shopee" && body.marketplace !== "aliexpress") || typeof body.enabled !== "boolean") {
    return sinkJson(check.sink, { ok: false, error: "invalid_policy" }, { status: 400 });
  }
  try {
    const policy = await setHouseMonitoringPolicy(body.marketplace, body.enabled, check.user.id);
    return sinkJson(check.sink, { ok: true, policy }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return sinkJson(check.sink, { ok: false, error: "policy_unavailable" }, { status: 503 });
  }
}
