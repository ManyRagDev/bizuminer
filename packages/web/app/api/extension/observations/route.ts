import { isAllowedExtensionOrigin } from "../../../../lib/extension-cors.ts";
import { readExtensionJson, extensionIdempotencyMatches } from "../../../../lib/extension-request.ts";
import { recaptureError, recaptureFailure, recaptureHeaders, recaptureIdentity } from "../../../../lib/recapture-http.ts";
import { reportRecaptureObservation } from "../../../../lib/recapture-db.ts";
import { validateRecaptureObservation } from "../../../../lib/recapture-contract.ts";

export const runtime="nodejs";
export async function OPTIONS(request:Request) {
  return new Response(null,{status:isAllowedExtensionOrigin(request.headers.get("origin")) ? 204 : 403,headers:recaptureHeaders(request)});
}
export async function POST(request:Request) {
  try {
    const device=await recaptureIdentity(request), raw=await readExtensionJson(request,1_000_000);
    const payload=validateRecaptureObservation(raw);
    if (!extensionIdempotencyMatches(request,payload.requestId)) return recaptureFailure(request,"idempotency_key_mismatch",400);
    return Response.json(await reportRecaptureObservation(device,payload),{headers:recaptureHeaders(request)});
  } catch(error) { return recaptureError(request,error); }
}
