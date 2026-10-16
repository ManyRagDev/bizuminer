/** Explicit operator entrypoint. Inspect is read-only; execution needs a reviewed adapter module and matching approval. */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { db } = require("../lib/db.ts");
const { resolveAccountContext } = require("../lib/account-context.ts");
const { withCommercialDb: withAccountDb } = require("../lib/commercial-rollout.ts");
const { executeDispatchCycle } = require("../lib/dispatch-worker.ts");
const { resolveAffiliateSecret } = require("../lib/affiliate-secret.ts");
const args = process.argv.slice(2),
  value = (key: string) => {
    const i = args.indexOf("--" + key);
    return i >= 0 ? args[i + 1] : undefined;
  };
if (args.includes("--help")) {
  console.log(
    "run-dispatch --account CONTA --auth-user AUTH_USER --inspect | --execute; execute requires an approved provider module, persisted channel approval, origin and credential resolver.",
  );
  process.exit(0);
}
const account = value("account"),
  authUserId = value("auth-user");
if (
  !account ||
  !authUserId ||
  (!args.includes("--inspect") && !args.includes("--execute"))
)
  throw new Error(
    "Use --account CONTA --auth-user AUTH_USER --inspect (ou --execute com G-CHANNEL homologado).",
  );
const context = await resolveAccountContext({
  authUserId,
  requestedAccount: account,
});
if (!context || context.membershipRole !== "owner")
  throw new Error("authorized_owner_required");
const control = await withAccountDb(context, async (tx: any) => ({
  jobs: await tx`select id,status,scheduled_at::text,failure_code from garimpa.dispatch_job where tenant_id=${context.tenantId} order by scheduled_at limit 100`,
  settings: (
    await tx`select kill_switch,configuration from garimpa.dispatch_control where tenant_id=${context.tenantId}`
  )[0],
}));
if (args.includes("--inspect")) console.log(JSON.stringify(control, null, 2));
else {
  const modulePath = process.env.DISPATCH_ADAPTER_MODULE,
    approval = process.env.DISPATCH_CHANNEL_APPROVAL_REF,
    origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (
    !modulePath ||
    !approval ||
    !origin ||
    control.settings?.configuration?.channelApprovalRef !== approval
  )
    throw new Error(
      "G_CHANNEL_PENDING: reviewed provider module, origin and persisted channel approval required; no job was claimed",
    );
  const provider = await import(pathToFileURL(modulePath).href);
  if (typeof provider.createApprovedAdapter !== "function")
    throw new Error("invalid_provider_module");
  const adapter = await provider.createApprovedAdapter({
    resolveSecret: (ref: string) =>
      withAccountDb(context, (tx: any) =>
        resolveAffiliateSecret(context.tenantId, provider.channel, ref, tx),
      ),
  });
  const result = await executeDispatchCycle(
    {
      factory: db,
      origin,
      validateCredential: (ref: string, tenant: string) =>
        withAccountDb(context, async (tx: any) =>
          Boolean(
            await resolveAffiliateSecret(tenant, adapter.channel, ref, tx),
          ),
        ),
    },
    context,
    adapter,
    { workerToken: crypto.randomUUID() },
  );
  console.log(JSON.stringify(result));
}
