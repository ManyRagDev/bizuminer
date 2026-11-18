import type { NextRequest } from "next/server";
import { checkAffiliateUser, sinkJson } from "../../../../../lib/api-auth.ts";
import { inAccountScope } from "../../../../../lib/account-scope.ts";
import { readCaptureActivity } from "../../../../../lib/capture-activity-db.ts";
import { CaptureInputError, captureQuery, capturePathReference } from "../../../../../lib/capture-activity.ts";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function GET(request:NextRequest,{params}:{params:Promise<{reference:string}>}) {
  const access=await checkAffiliateUser(request);
  if(access.kind!=='ok') return Response.json({ok:false},{status:access.kind==='no_session'?401:403,headers});
  return inAccountScope(access.context,async()=>{
    try {const result=await readCaptureActivity(access.context,capturePathReference((await params).reference),captureQuery(request.nextUrl.searchParams));
      if(!result) return sinkJson(access.sink,{ok:false},{status:404,headers});
      return sinkJson(access.sink,{ok:result.available,...result},{status:result.available?200:503,headers});}
    catch(error) {return sinkJson(access.sink,{ok:false,error:error instanceof CaptureInputError?'invalid_filter':'capture_history_unavailable'},
      {status:error instanceof CaptureInputError?400:503,headers});}
  });
}
