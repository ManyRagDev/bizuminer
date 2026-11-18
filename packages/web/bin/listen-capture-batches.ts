/** Opt-in VPS process. No polling with an empty queue and no automation creation. */
import postgres from "postgres";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { CaptureLeaseMonitor } from "../lib/capture-lease.ts";
import { CaptureBatchStore } from "../lib/capture-batch-db.ts";
import { runBoundedCaptureProcess } from "../lib/capture-process.ts";
import { db } from "../lib/db.ts";
import { aiCurationProvider } from "../lib/ai-curation-provider.ts";
import { runCurationProjectionJob } from "../lib/curation-scheduler.ts";
import { runShopeeVerification } from "../lib/shopee-verification-worker.ts";
import { planShopeeWatches } from "../lib/shopee-watch-planner.ts";
import { refreshPautaSlots } from "../lib/pauta-slots-db.ts";
import { runAttributeWorker } from "../lib/curation-attribute-worker.ts";
import { shopeeVerificationTenantEnabled } from "../lib/flags.ts";

if (process.env.CAPTURE_EXECUTOR !== "durable") throw new Error("durable_capture_executor_not_enabled");
const connectionString = process.env.CAPTURE_LISTEN_DATABASE_URL;
if (!connectionString) throw new Error("capture_session_connection_required");
const tenants = (process.env.CAPTURE_WORKER_TENANTS ?? "").split(",").map(x => x.trim()).filter(Boolean);
if (!tenants.length || tenants.some(x => !/^[a-z0-9._-]{1,64}$/.test(x))) throw new Error("capture_tenant_allowlist_required");
const comparisonTenants = process.env.CURATION_COMPARISON_ENABLED === "true"
  ? (process.env.CURATION_COMPARISON_TENANTS ?? "").split(",").map(x => x.trim()).filter(Boolean) : [];
if (comparisonTenants.some(tenant => !tenants.includes(tenant))) throw new Error("curation_tenant_allowlist_invalid");
if (process.env.CURATION_COMPARISON_ENABLED === "true" && !comparisonTenants.length) throw new Error("curation_tenant_allowlist_required");
const attributeTenants=process.env.CURATION_ATTRIBUTE_WORKER_ENABLED==='true'
  ? (process.env.CURATION_ATTRIBUTE_TENANTS ?? '').split(',').map(x=>x.trim()).filter(Boolean) : [];
if(process.env.CURATION_ATTRIBUTE_WORKER_ENABLED==='true' && (!attributeTenants.length || attributeTenants.some(tenant=>!comparisonTenants.includes(tenant))))
  throw new Error('attributes_tenant_allowlist_required');
const shopeeTenants=process.env.SHOPEE_VERIFICATION_ENABLED==='true'
  ? (process.env.SHOPEE_VERIFICATION_TENANTS ?? '').split(',').map(value=>value.trim()).filter(Boolean) : [];
if(process.env.SHOPEE_VERIFICATION_ENABLED==='true' && (!shopeeTenants.length || shopeeTenants.some(tenant=>!shopeeVerificationTenantEnabled(tenant))))
  throw new Error('shopee_verification_tenant_allowlist_required');
let connected = false;
const initialized = new Set<string>();
const healthPort = process.env.CAPTURE_HEALTH_PORT ? Number(process.env.CAPTURE_HEALTH_PORT) : null;
if (healthPort !== null && (!Number.isInteger(healthPort) || healthPort < 1 || healthPort > 65535)) throw new Error("invalid_capture_health_port");
// A dedicated session is mandatory; never point this at a transaction pooler.
const listener = postgres(connectionString, {prepare:false,max:1,idle_timeout:0,max_lifetime:null,
  connect_timeout:10,onclose:()=>{connected=false;initialized.clear();},connection:{application_name:"bizuminer-capture-listener"}});
const store = new CaptureBatchStore();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const drains = new Map<string, Promise<void>>();
const dirty = new Set<string>();
const active = new Map<string,{tenantId:string;lease:CaptureLeaseMonitor}>();
const comparisonTimers = new Map<string, ReturnType<typeof setTimeout>>();
const comparisonDrains = new Map<string, Promise<void>>();
const comparisonDirty = new Set<string>();
const shopeeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const shopeeDrains = new Map<string, Promise<void>>();
const shopeeDirty = new Set<string>();
const slotTimers = new Map<string, ReturnType<typeof setTimeout>>();
const slotDrains = new Map<string, Promise<void>>();
const slotDirty = new Set<string>();
const attributeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const attributeDrains = new Map<string, Promise<void>>();
const attributeDirty = new Set<string>();
let stopping = false;
const script = fileURLToPath(new URL("./run-capture-batch.ts", import.meta.url));

function wake(tenantId:string) {
  if (stopping || !tenants.includes(tenantId)) return;
  dirty.add(tenantId);
  if (drains.has(tenantId)) return;
  const drain = (async () => {
    while (dirty.delete(tenantId) && !stopping) {
      clearTimeout(timers.get(tenantId)); timers.delete(tenantId);
      try {
        await store.recover(tenantId);
        const pending = await store.scheduled(tenantId);
        initialized.add(tenantId);
        let dueAt = Infinity;
        const pendingIds = new Set(pending.map(job=>job.id));
        for(const [id,process] of active) if(process.tenantId===tenantId && !pendingIds.has(id)) process.lease.update(null);
        for (const job of pending) {
          const due = +new Date(job.dueAt);
          const running = active.get(job.id);
          if(running) {running.lease.update(job);continue;}
          if (job.phase === "queued" && due <= Date.now()) {
            const lease=new CaptureLeaseMonitor(()=>wake(tenantId));
            lease.update(job);
            active.set(job.id,{tenantId,lease});
            // Database claim fences duplicate signals and multiple listener processes.
            void runBoundedCaptureProcess(process.execPath,
              ["--experimental-strip-types",script,"--batch",job.id,"--tenant",tenantId],
              {env:process.env,signal:lease.controller.signal}).then(async result => {
                if (!result.ok && result.error!=="step_aborted") await store.deferDispatch(job.id,tenantId);
              }).catch(() => { /* Recovery scan below handles transport loss. */ }).finally(() => {lease.stop();active.delete(job.id);wake(tenantId);});
          } else dueAt = Math.min(dueAt,due);
        }
        if (Number.isFinite(dueAt)) timers.set(tenantId,setTimeout(() => wake(tenantId),Math.max(1000,dueAt-Date.now())));
      } catch {
        // Transport recovery only, with bounded rate; no rapid supervisor restart loop.
        initialized.delete(tenantId);
        console.error(JSON.stringify({event:"capture_queue_unavailable",tenantId}));
        timers.set(tenantId,setTimeout(() => wake(tenantId),60_000));
      }
    }
  })().finally(() => {drains.delete(tenantId);if(dirty.has(tenantId))wake(tenantId);});
  drains.set(tenantId,drain);
}
function wakeComparison(tenantId:string) {
  if (stopping || !comparisonTenants.includes(tenantId)) return;
  comparisonDirty.add(tenantId);
  if (comparisonDrains.has(tenantId)) return;
  const drain = (async () => {
    while (comparisonDirty.delete(tenantId) && !stopping) {
      clearTimeout(comparisonTimers.get(tenantId)); comparisonTimers.delete(tenantId);
      const sql = db();
      try {
        const provider = aiCurationProvider();
        const model = provider === "openrouter" ? process.env.AI_CURATION_MODEL : process.env.GEMINI_MODEL || "gemini-2.5-flash";
        if (!model) throw new Error("curation_model_missing");
        const due = await runCurationProjectionJob(sql,tenantId,`${provider}:${model}`);
        wakeShopee(tenantId);
        wakeAttributes(tenantId);
        // A slot signal can arrive before its scores are recalculated. Re-read
        // the forecast once the projection has actually completed.
        wakeSlots(tenantId);
        comparisonTimers.set(tenantId,setTimeout(() => wakeComparison(tenantId),Math.max(1000,due.getTime()-Date.now())));
      } catch {
        console.error(JSON.stringify({event:"curation_projection_unavailable",tenantId}));
        comparisonTimers.set(tenantId,setTimeout(() => wakeComparison(tenantId),60_000));
      } finally { await sql.end(); }
    }
  })().finally(() => {comparisonDrains.delete(tenantId);if(comparisonDirty.has(tenantId))wakeComparison(tenantId);});
  comparisonDrains.set(tenantId,drain);
}
function wakeAttributes(tenantId:string) {
  if(stopping || !attributeTenants.includes(tenantId)) return;
  attributeDirty.add(tenantId);
  if(attributeDrains.has(tenantId)) return;
  const drain=(async()=>{
    while(attributeDirty.delete(tenantId) && !stopping) {
      clearTimeout(attributeTimers.get(tenantId));attributeTimers.delete(tenantId);
      const sql=db();
      try {
        const result=await runAttributeWorker(sql,tenantId);
        if(result.changed) wakeComparison(tenantId);
        if(result.due) attributeTimers.set(tenantId,setTimeout(()=>wakeAttributes(tenantId),Math.max(1000,result.due.getTime()-Date.now())));
      } catch {
        console.error(JSON.stringify({event:'curation_attributes_unavailable',tenantId}));
        attributeTimers.set(tenantId,setTimeout(()=>wakeAttributes(tenantId),300_000));
      } finally {await sql.end();}
    }
  })().finally(()=>{attributeDrains.delete(tenantId);if(attributeDirty.has(tenantId))wakeAttributes(tenantId);});
  attributeDrains.set(tenantId,drain);
}
function wakeShopee(tenantId:string) {
  if (stopping || !shopeeVerificationTenantEnabled(tenantId)) return;
  shopeeDirty.add(tenantId);
  if(shopeeDrains.has(tenantId)) return;
  const drain=(async()=>{
    while(shopeeDirty.delete(tenantId) && !stopping) {
      clearTimeout(shopeeTimers.get(tenantId));shopeeTimers.delete(tenantId);
      const sql=db();
      try {
        await planShopeeWatches(sql,tenantId);
        const due=await runShopeeVerification(sql,tenantId);
        if(due) shopeeTimers.set(tenantId,setTimeout(()=>wakeShopee(tenantId),Math.max(1000,due.getTime()-Date.now())));
      } catch {
        console.error(JSON.stringify({event:"shopee_verification_unavailable",tenantId}));
        shopeeTimers.set(tenantId,setTimeout(()=>wakeShopee(tenantId),300_000));
      } finally {await sql.end();}
    }
  })().finally(()=>{shopeeDrains.delete(tenantId);if(shopeeDirty.has(tenantId))wakeShopee(tenantId);});
  shopeeDrains.set(tenantId,drain);
}
function wakeSlots(tenantId:string) {
  if(stopping || !tenants.includes(tenantId)) return;
  slotDirty.add(tenantId);
  if(slotDrains.has(tenantId)) return;
  const drain=(async()=>{
    while(slotDirty.delete(tenantId) && !stopping) {
      clearTimeout(slotTimers.get(tenantId));slotTimers.delete(tenantId);
      const sql=db();
      try {
        const due=await refreshPautaSlots(sql,tenantId);
        if(due) slotTimers.set(tenantId,setTimeout(()=>wakeSlots(tenantId),Math.max(1000,due.getTime()-Date.now())));
      } catch {
        console.error(JSON.stringify({event:"pauta_slots_unavailable",tenantId}));
        slotTimers.set(tenantId,setTimeout(()=>wakeSlots(tenantId),60_000));
      } finally {await sql.end();}
    }
  })().finally(()=>{slotDrains.delete(tenantId);if(slotDirty.has(tenantId))wakeSlots(tenantId);});
  slotDrains.set(tenantId,drain);
}
// onlisten also runs after reconnect. Register the subscription before scanning.
await listener.listen("garimpa_capture_ready", payload => {
  try {const signal=JSON.parse(payload);if(typeof signal.tenantId === "string")wake(signal.tenantId);} catch { /* A signal never carries authority. */ }
}, () => {connected=true;initialized.clear();for(const tenant of tenants)wake(tenant);});
await listener.listen("garimpa_curation_ready", payload => {
  try { const signal=JSON.parse(payload); if(typeof signal.tenantId === "string"){wakeComparison(signal.tenantId);wakeShopee(signal.tenantId);wakeSlots(signal.tenantId);wakeAttributes(signal.tenantId);} } catch { /* Signals carry no authority. */ }
}, () => {for(const tenant of tenants){wakeComparison(tenant);wakeShopee(tenant);wakeSlots(tenant);wakeAttributes(tenant);}});
const health = healthPort === null ? null : createServer((request,response) => {
  if(request.url !== "/health") {response.writeHead(404);response.end();return;}
  const ready = connected && !stopping && initialized.size === tenants.length;
  response.writeHead(ready ? 200 : 503,{"Content-Type":"application/json","Cache-Control":"no-store"});
  response.end(JSON.stringify({ready,connected,accounts:tenants.length,active:active.size,scheduled:timers.size}));
});
if(health && healthPort) await new Promise<void>((resolve,reject)=>{health.once("error",reject);health.listen(healthPort,"127.0.0.1",resolve);});
console.log(JSON.stringify({event:"capture_listener_ready",accounts:tenants.length,healthPort}));
async function stop() {
  if(stopping)return;stopping=true;
  for(const timer of timers.values())clearTimeout(timer);
  for(const timer of comparisonTimers.values())clearTimeout(timer);
  for(const timer of shopeeTimers.values())clearTimeout(timer);
  for(const timer of slotTimers.values())clearTimeout(timer);
  for(const timer of attributeTimers.values())clearTimeout(timer);
  for(const process of active.values())process.lease.stop();
  if(health) await new Promise<void>(resolve=>health.close(()=>resolve()));
  await listener.end({timeout:5});
  await Promise.allSettled(drains.values());
  await Promise.allSettled(comparisonDrains.values());
  await Promise.allSettled(shopeeDrains.values());
  await Promise.allSettled(slotDrains.values());
  await Promise.allSettled(attributeDrains.values());
  // Each provider/AI stage has its own bound. Active children finish; a forced supervisor stop is recovered from their persisted lease.
}
process.once("SIGTERM",() => void stop());
process.once("SIGINT",() => void stop());
