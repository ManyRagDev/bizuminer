import { randomUUID } from "node:crypto";
import { isAllowedExtensionOrigin } from "../../../../lib/extension-cors.ts";
import { recaptureError, recaptureHeaders, recaptureIdentity } from "../../../../lib/recapture-http.ts";
import { readRecapturePlan } from "../../../../lib/recapture-db.ts";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function OPTIONS(request:Request) {
  return new Response(null,{status:isAllowedExtensionOrigin(request.headers.get("origin")) ? 204 : 403,headers:recaptureHeaders(request)});
}
export async function GET(request:Request) {
  try { const device=await recaptureIdentity(request); return Response.json({ok:true,...await readRecapturePlan(device,randomUUID())},{headers:recaptureHeaders(request)}); }
  catch(error) { return recaptureError(request,error); }
}
