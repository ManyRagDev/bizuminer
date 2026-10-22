import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { AccountCredentialsError, resolveWorkerCredential } from "../../persistence/src/account-credentials.ts";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";
import { db } from "./db.ts";
import { withAccountDb, type AccountContext } from "./tenant-db.ts";

export function captureExecutor(): "local" | "github" {
  return process.env.NODE_ENV === "development" && !process.env.VERCEL
    ? "local"
    : "github";
}

/** Authorize the request before using worker resolution; never return credential material. */
export async function prepareAccountCapture(
  context: AccountContext,
  marketplaces: readonly string[],
  consent: boolean,
  factory: typeof db = db,
): Promise<{ enabled: string[]; skipped: Array<{ marketplace: string; reason: string }> }> {
  await withAccountDb(context, async () => {}, factory);
  const enabled: string[] = [];
  const skipped: Array<{ marketplace: string; reason: string }> = [];
  const client = factory();
  try {
    for (const marketplace of marketplaces) {
      if (marketplace === "mercadolivre") {
        skipped.push({ marketplace, reason: "manual_capture_only" });
        continue;
      }
      try {
        await resolveWorkerCredential(client, context.tenantId, marketplace);
        enabled.push(marketplace);
      } catch (error) {
        if (error instanceof AccountCredentialsError) {
          skipped.push({ marketplace, reason: error.code });
        } else if (error instanceof Error && /^(shopee|aliexpress)_capture_disabled$/.test(error.message)) {
          skipped.push({ marketplace, reason: "capture_disabled" });
        } else {
          throw error;
        }
      }
    }
  } finally {
    await client.end();
  }
  return { enabled, skipped };
}

/** Keep the local child alive after the request, but await spawn/error before returning HTTP 202. */
export async function dispatchCaptureBatch(id: string, context: AccountContext, factory: typeof db = db, transport?: (id:string, tenantId:string)=>Promise<void>): Promise<void> {
  const tenantId=context.tenantId;
  const marketplaces=await withAccountDb(context,async tx=>{
    const [batch]=await tx<{requested_marketplaces:string[]}[]>`select requested_marketplaces from garimpa.capture_batch where id=${id} and tenant_id=${tenantId} and status='running'`;
    if(!batch)throw new Error("capture_batch_not_found");
    return batch.requested_marketplaces;
  },factory);
  const client=factory();
  try {
    for(const marketplace of marketplaces) {
      if (marketplace !== "mercadolivre") {
        await resolveWorkerCredential(client,tenantId,marketplace);
      }
    }
  }
  finally {await client.end();}
  if (transport) {await transport(id,tenantId);return;}
  if (captureExecutor() === "local") {
    const script = [
      path.resolve(process.cwd(), "bin/run-capture-batch.ts"),
      path.resolve(process.cwd(), "packages/web/bin/run-capture-batch.ts"),
    ].find(existsSync);
    if (!script) throw new Error("local_worker_missing");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--experimental-strip-types", script, "--batch", id, "--tenant", tenantId],
        {
          env: process.env,
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        },
      );
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
    return;
  }
  const token = process.env.GITHUB_ACTIONS_WRITE_TOKEN;
  if (!token) throw new Error("github_token_not_configured");
  const response = await fetch(
    "https://api.github.com/repos/ManyRagDev/bizuminer/actions/workflows/capture-offers.yml/dispatches",
    {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2026-03-10",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: process.env.GITHUB_CAPTURE_REF || "main",
        inputs: { batch_id: id, account_tenant: tenantId },
      }),
    },
  );
  if (!response.ok) throw new Error(`github_dispatch_http_${response.status}`);
}

/** Continuation only, after the route authenticated a device and completed its owned batch. */
export async function dispatchCaptureBatchForDeviceMember(id:string,identity:{tenantId:string;appUserId:string},factory:typeof db=db) {
  const sql=factory();
  let affiliateId:string;
  try {affiliateId=await withMonitoringDb(sql,identity.tenantId,async tx=>{
    const [member]=await tx<{id:string}[]>`select a.id from garimpa.affiliate_account a join garimpa.affiliate_membership m on m.affiliate_id=a.id
      where a.tenant_id=${identity.tenantId} and a.status='active' and m.app_user_id=${identity.appUserId} and m.revoked_at is null`;
    if(!member)throw new Error("capture_member_unavailable");return member.id;
  });}finally{await sql.end();}
  return dispatchCaptureBatch(id,{tenantId:identity.tenantId,affiliateId,actor:"worker",actorAppUserId:identity.appUserId,authenticatedAuthUserId:null,membershipRole:null,requestId:crypto.randomUUID()},factory);
}
