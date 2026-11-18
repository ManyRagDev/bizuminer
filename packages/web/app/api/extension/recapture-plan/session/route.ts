import { isAllowedExtensionOrigin } from "../../../../../lib/extension-cors.ts";
import { readExtensionJson } from "../../../../../lib/extension-request.ts";
import { recaptureError,recaptureFailure,recaptureHeaders,recaptureIdentity } from "../../../../../lib/recapture-http.ts";
import { setRecaptureSessionStatus } from "../../../../../lib/recapture-db.ts";

export const runtime="nodejs";
export async function OPTIONS(request:Request) {
  return new Response(null,{status:isAllowedExtensionOrigin(request.headers.get("origin")) ? 204 : 403,headers:recaptureHeaders(request)});
}
export async function POST(request:Request) {
  try {
    const device=await recaptureIdentity(request),body=await readExtensionJson(request);
    if (!body || typeof body!=="object" || Array.isArray(body)) return recaptureFailure(request,"recapture_session_invalid",400);
    const input=body as Record<string,unknown>;
    const keys=Object.keys(input).sort().join(',');
    if ((keys!=="action,sessionId" && keys!=="action,controlSequence,sessionId") || typeof input.sessionId!=="string"
      || (input.controlSequence!==undefined && (!Number.isInteger(input.controlSequence) || (input.controlSequence as number)<1 || (input.controlSequence as number)>2147483647))
      || (input.action!=="pause" && input.action!=="resume" && input.action!=="cancel")) return recaptureFailure(request,"recapture_session_invalid",400);
    await setRecaptureSessionStatus(device,input.sessionId,input.action,undefined,input.controlSequence as number|undefined);
    return Response.json({ok:true},{headers:recaptureHeaders(request)});
  } catch(error) {return recaptureError(request,error);}
}
