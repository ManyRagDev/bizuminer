import { NextRequest } from "next/server";
import { checkAffiliateUser, sinkJson } from "../../../../../lib/api-auth";
import { captureBatches } from "../../../../../lib/capture-batch-db";
import { browserCaptures } from "../../../../../lib/browser-capture-db";
import {
  decodeBrowserCaptureBlock,
  validBatchId,
} from "../../../../../lib/browser-capture-contract";
import { dispatchCaptureBatch } from "../../../../../lib/capture-dispatch";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const check = await checkAffiliateUser(request);
  if (check.kind !== "ok")
    return Response.json(
      { ok: false, error: check.kind },
      { status: check.kind === "no_session" ? 401 : 403 },
    );
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return sinkJson(
      check.sink,
      { ok: false, error: "invalid_origin" },
      { status: 403 },
    );
  let body;
  try {
    body = await request.json();
  } catch {
    return sinkJson(
      check.sink,
      { ok: false, error: "invalid_body" },
      { status: 400 },
    );
  }
  if (
    !body ||
    typeof body !== "object" ||
    !validBatchId(body.batchId) ||
    !["import", "skip", "resume"].includes(body.action)
  )
    return sinkJson(
      check.sink,
      { ok: false, error: "invalid_request" },
      { status: 400 },
    );
  let result = { duplicate: true, importedCount: 0, queued: false };
  try {
    if (body.action === "resume") {
      const batch = await captureBatches.read(body.batchId, check.context.tenantId);
      if (
        batch?.metadata.execution?.browser?.ownerAppUserId !== check.appUserId
      )
        throw new Error("browser_capture_forbidden");
      result.importedCount =
        batch.metadata.execution.browser.importedCount ?? 0;
      result.queued =
        batch.status === "running" &&
        batch.metadata.execution.phase === "queued";
    } else {
      let payload = null;
      if (body.action === "import") {
        try {
          payload = decodeBrowserCaptureBlock(String(body.block ?? ""));
        } catch {
          return sinkJson(
            check.sink,
            { ok: false, error: "invalid_capture_block" },
            { status: 400 },
          );
        }
      }
      result = await browserCaptures.complete(
        { appUserId: check.appUserId, tenantId: check.context.tenantId },
        body.batchId,
        payload,
      );
    }
  } catch (err) {
    const error =
      err instanceof Error && err.message.startsWith("browser_capture_")
        ? err.message
        : "browser_capture_failed";
    return sinkJson(
      check.sink,
      { ok: false, error },
      { status: error === "browser_capture_forbidden" ? 403 : 409 },
    );
  }
  let continuationPending = false;
  if (result.queued) {
    try {
      await dispatchCaptureBatch(body.batchId, check.context);
    } catch {
      continuationPending = true;
    }
  }
  return sinkJson(check.sink, {
    ok: true,
    ...result,
    continuationPending,
    batch: await captureBatches.publicStatus(body.batchId, check.context.tenantId),
  });
}
