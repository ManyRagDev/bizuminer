import { authenticateDevice, type DeviceIdentity } from "./extension-db.ts";
import { extensionCorsHeaders, isAllowedExtensionOrigin } from "./extension-cors.ts";
import { hashToken } from "./extension-token.ts";
import { extensionCaptureEnabled,recaptureTenantEnabled } from "./flags.ts";

export function recaptureHeaders(request:Request) {
  return { ...extensionCorsHeaders(request.headers.get("origin")), "Access-Control-Allow-Methods":"GET, POST, OPTIONS", "Cache-Control":"no-store" };
}
export function recaptureFailure(request:Request,error:string,status:number) {
  return Response.json({ok:false,error},{status,headers:recaptureHeaders(request)});
}
export async function recaptureIdentity(request:Request):Promise<DeviceIdentity> {
  if (!isAllowedExtensionOrigin(request.headers.get("origin"))) throw new Error("origin_not_allowed");
  if (!extensionCaptureEnabled() || process.env.RECAPTURE_PROTOCOL_ENABLED !== "true") throw new Error("recapture_not_enabled");
  const token=(request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i,"").trim();
  if (!token.startsWith("bm_ext_")) throw new Error("unauthorized");
  const auth=await authenticateDevice(hashToken(token));
  if (auth.kind!=="ok") throw new Error(auth.kind==="revoked" ? "device_revoked" : "unauthorized");
  if (!recaptureTenantEnabled(auth.device.tenantId)) throw new Error("recapture_account_not_enabled");
  return auth.device;
}
export function recaptureError(request:Request,error:unknown) {
  const code=error instanceof Error ? error.message : "recapture_failed";
  if (code==="origin_not_allowed" || code==="recapture_not_enabled" || code==="recapture_account_not_enabled" || code==="device_revoked" || code==="affiliate_access_required") return recaptureFailure(request,code,403);
  if (code==="unauthorized") return recaptureFailure(request,code,401);
  if (["recapture_claim_invalid","recapture_observation_invalid","recapture_target_mismatch","recapture_session_invalid","invalid_json","body_too_large"].includes(code)) return recaptureFailure(request,code,400);
  if (code==="recapture_target_busy") return recaptureFailure(request,code,429);
  if (["recapture_claim_conflict","recapture_claim_expired","recapture_session_unavailable","recapture_control_stale","recapture_plan_changed",
    "recapture_task_no_longer_needed","recapture_session_budget_exhausted","recapture_daily_budget_exhausted","recapture_watch_capacity_reserved","recapture_report_conflict","marketplace_capture_unavailable"].includes(code))
    return recaptureFailure(request,code,409);
  if (code==="recapture_budget_not_configured") return recaptureFailure(request,code,503);
  return recaptureFailure(request,"recapture_failed",500);
}
