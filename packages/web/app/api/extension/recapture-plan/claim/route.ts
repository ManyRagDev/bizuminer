import { isAllowedExtensionOrigin } from "../../../../../lib/extension-cors.ts";
import { readExtensionJson, extensionIdempotencyMatches } from "../../../../../lib/extension-request.ts";
import { recaptureError, recaptureFailure, recaptureHeaders, recaptureIdentity } from "../../../../../lib/recapture-http.ts";
import { claimRecaptureTask, type RecaptureClaim } from "../../../../../lib/recapture-db.ts";

export const runtime="nodejs";
export async function OPTIONS(request:Request) {
  return new Response(null,{status:isAllowedExtensionOrigin(request.headers.get("origin")) ? 204 : 403,headers:recaptureHeaders(request)});
}
export async function POST(request:Request) {
  try {
    const device=await recaptureIdentity(request), raw=await readExtensionJson(request);
    if (!raw || typeof raw!=="object" || Array.isArray(raw)) return recaptureFailure(request,"recapture_claim_invalid",400);
    const input=raw as Record<string,unknown>;
    const keys=Object.keys(input).sort().join(',');
    if ((keys!=="claimToken,requestId,revision,sessionId,taskId"
      && keys!=="claimToken,requestId,revision,sessionId,supportsClaimTargets,taskId")
      || [input.claimToken,input.requestId,input.revision,input.sessionId,input.taskId].some(value=>typeof value!=="string")
      || input.supportsClaimTargets!==undefined && input.supportsClaimTargets!==true)
      return recaptureFailure(request,"recapture_claim_invalid",400);
    if (!extensionIdempotencyMatches(request,input.requestId as string)) return recaptureFailure(request,"idempotency_key_mismatch",400);
    return Response.json({ok:true,...await claimRecaptureTask(device,input as RecaptureClaim)},{headers:recaptureHeaders(request)});
  } catch(error) { return recaptureError(request,error); }
}
