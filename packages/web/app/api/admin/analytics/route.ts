import { NextRequest, NextResponse } from "next/server";
import { checkAffiliateUser } from "../../../../lib/api-auth.ts";
import { getGA4DashboardData, isGA4Configured } from "../../../../lib/ga4-reporting.ts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const check = await checkAffiliateUser(request);
  if (check.kind === "no_session") {
    return NextResponse.json({ ok: false, error: "no_session" }, { status: 401 });
  }
  if (check.kind === "forbidden") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const force = request.nextUrl.searchParams.get("refresh") === "1";
  const data = await getGA4DashboardData(force);

  return NextResponse.json({
    ok: true,
    configured: isGA4Configured(),
    data,
  });
}
