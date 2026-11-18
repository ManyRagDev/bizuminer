import { adminMutationOrigin } from "../../../../../lib/admin-request-origin.ts";
import { inAccountScope } from "../../../../../lib/account-scope.ts";
import { NextRequest } from "next/server";
import { checkAffiliateUser, sinkJson } from "../../../../../lib/api-auth";

export const preferredRegion = "gru1";

export const runtime = "nodejs";

/** The legacy GitHub producer is disabled; scheduling belongs to the durable worker. */
export async function POST(request: NextRequest) {
  const check = await checkAffiliateUser(request);
  if (check.kind === "no_session") return Response.json({ ok: false, error: "no_session" }, { status: 401 });
  if (check.kind === "forbidden") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
 if(check.context.tenantId!=="local"||check.context.membershipRole!=="owner")return sinkJson(check.sink,{error:"house_owner_required_for_house_workflow"},{status:403});
 return inAccountScope(check.context, async () => {

  if (!adminMutationOrigin(request)) {
    return sinkJson(check.sink, { ok: false, error: "invalid_origin" }, { status: 403 });
  }
  return sinkJson(check.sink, { ok: false, error: "durable_monitoring_not_scheduled" }, { status: 503 });

 });
}
