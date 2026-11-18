import type { NextRequest } from "next/server";
import { checkAffiliateUser, sinkJson } from "../../../../lib/api-auth.ts";
import { inAccountScope } from "../../../../lib/account-scope.ts";
import { readTodayOperations } from "../../../../lib/today-operation-db.ts";
import {readOperationProgress} from '../../../../lib/operation-progress-db.ts';
import {progressProductIds} from '../../../../lib/operation-progress.ts';
import {captureQuery,CaptureInputError} from '../../../../lib/capture-activity.ts';

export const preferredRegion = "gru1";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const check = await checkAffiliateUser(request);
  if (check.kind !== "ok") return Response.json({ ok: false }, { status: check.kind === "no_session" ? 401 : 403, headers });
  return inAccountScope(check.context, async () => {
    try {
      const query=captureQuery(request.nextUrl.searchParams);
      const status=await readOperationProgress(check.context,{productIds:progressProductIds(query.produtos),after:query.depois||undefined,category:query.categoria||undefined});
      if(status.mode==='legacy'){
        const old=await readTodayOperations(check.context);
        status.activities=old.activities;status.issues=old.issues;
        status.poll.active=old.activities.some(a=>['queued','capture','triage','monitoring','publication'].includes(a.kind));
      }
      const usable=Object.values(status.availability).some(Boolean);
      return sinkJson(check.sink,status,{status:usable?200:503,headers});
    } catch(error) {
      const invalid=error instanceof CaptureInputError || error instanceof Error && error.message==='invalid_progress_input';
      return sinkJson(check.sink,{ok:false,error:invalid?'invalid_input':'status_unavailable'},{status:invalid?400:503,headers});
    }
  });
}
