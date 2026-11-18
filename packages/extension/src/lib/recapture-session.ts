import { getJson,postJson, type DeliveryResult } from "./api.ts";
import { chromeStorage } from "./storage.ts";
import { collectBrowserOffers } from "../content/page-extractor.ts";
import { collectMercadoLivreProduct } from "../content/ml-product-extractor.ts";
import type { collectMarketplacePage } from "../content/marketplace-page.ts";
import { ambiguousSourceIdentity, sourcePageUrl } from "../../../capture/src/source-page-url.ts";

export const RECAPTURE_KEY="bm_recapture_v2";
export const RECAPTURE_ALARM="bm_recapture_v2_next";
export type RecaptureStore="mercadolivre"|"amazon"|"aliexpress";
type Scope={origin:string;deviceId:string;token:string};
type Pace="normal"|"tranquilo"|"lento";
type Target={productId:string;externalId:string;optionKey:string};
type Task={id:string;marketplace:RecaptureStore;kind:"listing"|"pdp";url:string;revision:string;deadline:string;targets:Target[]};
type Phase="between"|"claiming"|"preparing_tab"|"navigating"|"awaiting_open"|"awaiting_page"|"reporting"|"paused"|"completed"|"cancelled";
type Report={version:2;requestId:string;taskId:string;sessionId:string;claimToken:string;marketplace:RecaptureStore;observedAt:string;
  page:{kind:"listing"|"product";url:string};products:unknown[];results:Array<Target & {status:string;evidence?:"explicit_product_unavailable"}>};
type State={origin:string;deviceId:string;sessionId:string;marketplace:RecaptureStore;phase:Phase;resumePhase?:Phase;task?:Task;
  pace?:Pace;
  mode?:"automatic"|"assisted";
  claimRequestId?:string;claimToken?:string;claimSupportsTargets?:boolean;leaseUntil?:string;tabId?:number;navigationStartedAt?:number;report?:Report;
  attempts:number;completed:number;observed:number;residual:number;nextAt:number;error?:string;controlSequence?:number;
  remaining?:{listing:number|null;pdp:number|null;asOf:string};
  lastReport?:{discovered:number;unavailable:number;reasons:Record<string,number>}};
const pauseMs=(state?:State)=>{
  const [min,max]=state?.pace==="lento" ? [30_000,60_000] : state?.pace==="tranquilo" ? [15_000,30_000] : [5_000,15_000];
  return min+Math.floor(Math.random()*(max-min+1));
};
const read=async()=>((await chromeStorage().get(RECAPTURE_KEY))[RECAPTURE_KEY] as State|undefined);
const write=async(state:State)=>chromeStorage().set({[RECAPTURE_KEY]:state});
const hexToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),value=>value.toString(16).padStart(2,"0")).join("");
const validId=(value:unknown):value is string=>typeof value==="string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const validStore=(value:unknown):value is RecaptureStore=>value==="mercadolivre"||value==="amazon"||value==="aliexpress";
function requireDeviceAuthorization(result:DeliveryResult) {
  if (result.status===401 || result.error==="unauthorized" || result.error==="device_revoked" || result.error==="affiliate_access_required")
    throw new Error("recapture_device_revoked");
}
function safeTask(value:unknown,store:RecaptureStore):Task|null {
  if (!value || typeof value!=="object") return null;
  const task=value as Record<string,unknown>;
  if (!validId(task.id) || task.marketplace!==store || (task.kind!=="listing" && task.kind!=="pdp")
    || typeof task.url!=="string" || typeof task.revision!=="string" || !/^[a-f0-9]{64}$/.test(task.revision)
    || typeof task.deadline!=="string" || !Number.isFinite(Date.parse(task.deadline)) || Date.parse(task.deadline)<=Date.now()
    || !Array.isArray(task.targets) || !task.targets.length || task.targets.length>500) return null;
  let url:URL; try {url=new URL(task.url);} catch {return null;}
  const host=store==="mercadolivre" ? /(^|\.)mercadolivre\.com\.br$/i : store==="amazon" ? /(^|\.)amazon\.com\.br$/i : /(^|\.)aliexpress\.com$/i;
  if (ambiguousSourceIdentity(url,store) || url.protocol!=="https:" || url.username || url.password || url.port || !host.test(url.hostname)
    || sourcePageUrl(url,store)!==task.url || /\/(?:login|checkout|ap\/signin|gp\/cart|p\/trade)(?:\/|$)/i.test(url.pathname)) return null;
  const targets:Target[]=[];
  for (const item of task.targets) {
    if (!item || typeof item!=="object") return null;
    const target=item as Record<string,unknown>;
    if (typeof target.productId!=="string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(target.productId)
      || typeof target.externalId!=="string" || target.externalId.length>64 || !target.externalId
      || typeof target.optionKey!=="string" || !/^(?:listing|[a-f0-9]{32})$/.test(target.optionKey)) return null;
    targets.push({productId:target.productId,externalId:target.externalId,optionKey:target.optionKey});
  }
  return {id:task.id,marketplace:store,kind:task.kind,url:task.url,revision:task.revision,deadline:task.deadline,targets};
}
async function schedule(state:State) {
  await write(state);
  if (["paused","completed","cancelled","awaiting_open","awaiting_page"].includes(state.phase)) await chrome.alarms.clear(RECAPTURE_ALARM);
  else await chrome.alarms.create(RECAPTURE_ALARM,{when:Math.max(Date.now()+1_000,state.nextAt)});
}
export async function recaptureStatus(scope:Scope|null) {
  const state=await read();
  if (!state || !scope || state.origin!==scope.origin || state.deviceId!==scope.deviceId) return {active:false};
  return {active:!["completed","cancelled"].includes(state.phase),phase:state.phase,marketplace:state.marketplace,pace:state.pace ?? "normal",
    completed:state.completed,observed:state.observed,residual:state.residual,error:state.error ?? null,lastReport:state.lastReport,remaining:state.remaining,
    mode:state.mode ?? "automatic",taskUrl:state.mode==="assisted" && ["awaiting_open","awaiting_page"].includes(state.phase) ? state.task?.url : undefined};
}
export async function startRecapture(scope:Scope,store:unknown,mode:"automatic"|"assisted"="automatic",pace:unknown="normal") {
  if (!validStore(store)) return {ok:false,error:"marketplace_invalid"};
  if (pace!=="normal" && pace!=="tranquilo" && pace!=="lento") return {ok:false,error:"recapture_pace_invalid"};
  const existing=await read();
  if (existing && !["completed","cancelled"].includes(existing.phase)) return {ok:false,error:"recapture_already_running"};
  await schedule({origin:scope.origin,deviceId:scope.deviceId,sessionId:crypto.randomUUID(),marketplace:store,mode,pace,phase:"between",
    attempts:0,completed:0,observed:0,residual:0,nextAt:Date.now()});
  return {ok:true};
}
export async function controlRecapture(scope:Scope,action:"pause"|"resume"|"cancel") {
  const state=await read();
  if (!state || state.origin!==scope.origin || state.deviceId!==scope.deviceId) return {ok:false,error:"session_changed"};
  // Stop local navigation before contacting the server. If its response is
  // lost, leave the session paused until the operator retries or resumes.
  const controlSequence=(state.controlSequence ?? 0)+1;
  if (!Number.isSafeInteger(controlSequence) || controlSequence>2147483647) return {ok:false,error:"recapture_session_invalid"};
  const stopped=action==="resume" ? {...state,controlSequence} : {...state,controlSequence,phase:"paused" as const,
    resumePhase:state.phase==="paused" ? state.resumePhase : state.phase,error:undefined};
  await schedule(stopped);
  const result=await postJson({baseUrl:scope.origin,token:scope.token},"/api/extension/recapture-plan/session",{sessionId:state.sessionId,action,controlSequence});
  requireDeviceAuthorization(result);
  if (!result.ok) {
    if (action!=="resume") await schedule({...stopped,error:result.error ?? "recapture_failed"});
    return result;
  }
  if (action==="pause") return {ok:true};
  if (action==="resume") await schedule({...stopped,phase:state.resumePhase && state.resumePhase!=="paused" ? state.resumePhase : "between",resumePhase:undefined,nextAt:Date.now()+pauseMs(state),error:undefined});
  if (action==="cancel") {
    await schedule({...stopped,phase:"cancelled",error:undefined});
    if (state.mode!=="assisted" && state.tabId!==undefined) await chrome.tabs.remove(state.tabId).catch(()=>{});
  }
  return {ok:true};
}
export async function stopRecapture() {
  const state=await read();
  if (state && !["completed","cancelled"].includes(state.phase)) await schedule({...state,phase:"cancelled",error:"session_changed"});
  if (state?.mode!=="assisted" && state?.tabId!==undefined) await chrome.tabs.remove(state.tabId).catch(()=>{});
  await chrome.alarms.clear(RECAPTURE_ALARM);
}

/** Executed inside the visited page; challenge screens are never stock evidence. */
export function detectRecaptureAccessChallenge() {
  if (document.querySelector('form[action*="validateCaptcha" i], #captchacharacters, iframe[src*="captcha/challenge" i], [data-testid="captcha-challenge"]'))
    return "blocked" as const;
  if (document.querySelector('form[action*="signin" i] input[type="password"], form[action*="login" i] input[type="password"]'))
    return "needs_login" as const;
  return null;
}

async function collectRecaptureTab(state:State, tab:chrome.tabs.Tab, timedOut=false) {
  if (!state.task || !state.claimToken || state.tabId===undefined) throw new Error("recapture_state_invalid");
  let failure:string|null=timedOut ? "timeout" : null, current:URL|null=null;
  if (!failure) try {current=new URL(tab.url ?? "");} catch {failure="timeout";}
  if (current && /\/(?:login|ap\/signin|account-verification|checkpoint)(?:\/|$)/i.test(current.pathname)) failure="needs_login";
  else if (current && (current.protocol!=="https:" || sourcePageUrl(current,state.marketplace)!==state.task.url)) failure="blocked";
  let products:Array<{externalId:string}> = [];
  if (!failure && tab.status==="complete") {
    try {
      const access=await chrome.scripting.executeScript({target:{tabId:state.tabId},func:detectRecaptureAccessChallenge});
      failure=access[0]?.result ?? null;
      const results=failure ? [] : state.marketplace==="mercadolivre" && state.task.kind==="pdp"
        ? await chrome.scripting.executeScript({target:{tabId:state.tabId},func:collectMercadoLivreProduct})
        : state.marketplace==="mercadolivre" ? await chrome.scripting.executeScript({target:{tabId:state.tabId},func:collectBrowserOffers})
        : await chrome.scripting.executeScript<[],ReturnType<typeof collectMarketplacePage>>({target:{tabId:state.tabId},files:["content/marketplace-page.js"]});
      const payload=results[0]?.result;
      if (!failure) {
        if (!payload) failure="parse_error";
        else if ("status" in payload && payload.status && payload.status!=="observed") failure=payload.status;
        else products=payload.products;
      }
    } catch {failure="parse_error";}
  } else if (!failure) failure="timeout";
  const report:Report={version:2,requestId:crypto.randomUUID(),taskId:state.task.id,sessionId:state.sessionId,claimToken:state.claimToken,
    marketplace:state.marketplace,observedAt:new Date().toISOString(),page:{kind:state.task.kind==="pdp" ? "product" : "listing",url:state.task.url},
    products:failure ? [] : products,results:state.task.targets.map(target=>({...target,status:failure ??
      (products.some(product=>product.externalId===target.externalId) ? "observed" : state!.task!.kind==="pdp" ? "configuration_mismatch" : "not_found_on_listing"),
      ...(failure==="unavailable_confirmed" ? {evidence:"explicit_product_unavailable" as const} : {})}))};
  await schedule({...state,phase:"reporting",report,attempts:0,nextAt:Date.now()});return;
}

/** Explicit popup action: reserve quota first, then open the indicated page. */
export async function openAssistedRecapture(scope:Scope) {
  let state=await read();
  if(!state || state.origin!==scope.origin || state.deviceId!==scope.deviceId || state.mode!=="assisted"
    || state.phase!=="awaiting_open" || !state.task || !state.claimRequestId || !state.claimToken)
    return {ok:false,error:"recapture_state_invalid"};
  if(state.nextAt>Date.now()) return {ok:false,error:"recapture_retry_wait"};
  if(Date.parse(state.task.deadline)<=Date.now()) {
    await schedule({...state,phase:"between",task:undefined,claimRequestId:undefined,claimToken:undefined,nextAt:Date.now()+pauseMs(state)});
    return {ok:false,error:"recapture_plan_changed"};
  }
  const result=await postJson({baseUrl:scope.origin,token:scope.token},"/api/extension/recapture-plan/claim",{
    requestId:state.claimRequestId,sessionId:state.sessionId,taskId:state.task.id,revision:state.task.revision,claimToken:state.claimToken,
    ...(state.claimSupportsTargets ? {supportsClaimTargets:true} : {})},state.claimRequestId);
  requireDeviceAuthorization(result);
  if(!result.ok) {
    if(result.error==="recapture_plan_changed" || result.error==="recapture_task_no_longer_needed" || result.error==="recapture_claim_expired") {
      await schedule({...state,phase:"between",task:undefined,claimRequestId:undefined,claimToken:undefined,
        error:undefined,nextAt:Date.now()+pauseMs(state)});
      return result;
    }
    await schedule({...state,error:result.error ?? "recapture_failed",
      nextAt:result.retryable ? Date.now()+Math.max(30_000,result.retryAfterMs ?? 0) : state.nextAt});
    return result;
  }
  if(result.skipped===true) {
    await schedule({...state,phase:"between",task:undefined,claimRequestId:undefined,claimToken:undefined,
      error:undefined,nextAt:Date.now()+pauseMs(state)});
    return {ok:true,skipped:true};
  }
  if(typeof result.leaseUntil!=="string" || !Number.isFinite(Date.parse(result.leaseUntil)) || Date.parse(result.leaseUntil)<=Date.now())
    return {ok:false,error:"recapture_claim_expired"};
  const claimedTask=safeTask({...state.task,targets:state.claimSupportsTargets ? result.targets : state.task.targets},state.marketplace);
  if(!claimedTask) return {ok:false,error:"invalid_response"};
  // Save the transition before opening: an interrupted worker never opens a
  // second page automatically. The popup can still show the validated URL.
  const task=claimedTask;
  state={...state,task,phase:"awaiting_page",leaseUntil:result.leaseUntil,error:undefined};
  await schedule(state);
  try {
    const existing=state.tabId===undefined ? null : await chrome.tabs.get(state.tabId).catch(()=>null);
    if(existing?.id!==undefined) await chrome.tabs.update(existing.id,{url:task.url,active:true});
    else {
      const tab=await chrome.tabs.create({url:task.url,active:true});
      if(tab.id!==undefined) await schedule({...state,tabId:tab.id});
    }
  } catch {return {ok:false,error:"navigation_unknown"};}
  return {ok:true};
}

/** Reads only the active tab after the operator opens the popup on that tab. */
export async function readAssistedRecapture(scope:Scope) {
  const state=await read();
  if(!state || state.origin!==scope.origin || state.deviceId!==scope.deviceId || state.mode!=="assisted"
    || state.phase!=="awaiting_page" || !state.task || !state.claimToken || !state.leaseUntil)
    return {ok:false,error:"recapture_state_invalid"};
  if(Date.parse(state.leaseUntil)<=Date.now()) {
    await schedule({...state,phase:"between",task:undefined,claimRequestId:undefined,claimToken:undefined,leaseUntil:undefined,
      error:"recapture_claim_expired",nextAt:Date.now()+pauseMs(state)});
    return {ok:false,error:"recapture_claim_expired"};
  }
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(tab?.id===undefined || tab.status!=="complete" || !tab.url) return {ok:false,error:"active_page_not_ready"};
  let current:URL;
  try {current=new URL(tab.url);} catch {return {ok:false,error:"active_page_mismatch"};}
  const expected=new URL(state.task.url);
  const login=/\/(?:login|ap\/signin|account-verification|checkpoint)(?:\/|$)/i.test(current.pathname);
  if(current.protocol!=="https:" || current.username || current.password || current.port
    || (sourcePageUrl(current,state.marketplace)!==state.task.url && !(login && current.hostname===expected.hostname)))
    return {ok:false,error:"active_page_mismatch"};
  await collectRecaptureTab({...state,tabId:tab.id},tab);
  return {ok:true};
}

/** One transition per alarm; a navigation or report is never repeated on an uncertain response. */
export async function stepRecapture(scope:Scope|null) {
  let state=await read();
  if (!state || ["completed","cancelled"].includes(state.phase)) return;
  if (!scope || state.origin!==scope.origin || state.deviceId!==scope.deviceId) {await stopRecapture();return;}
  if (["paused","awaiting_open","awaiting_page"].includes(state.phase)) return;
  if (state.nextAt>Date.now()) {await schedule(state);return;}
  const pause=async(error:string)=>schedule({...state!,resumePhase:state!.phase,phase:"paused",error});
  const retry=async(result:DeliveryResult)=>{
    const attempts=state!.attempts+1;
    if (!result.retryable || attempts>=6) return pause(result.error ?? "recapture_failed");
    await schedule({...state!,attempts,nextAt:Date.now()+Math.max(30_000,result.retryAfterMs ?? 0)});
  };
  const abandonExpired=async(error:string)=>schedule({...state!,phase:"between",task:undefined,claimRequestId:undefined,
    claimToken:undefined,leaseUntil:undefined,report:undefined,attempts:0,error,nextAt:Date.now()+pauseMs(state)});
  if (state.phase==="between") {
    const result=await getJson({baseUrl:scope.origin,token:scope.token},"/api/extension/recapture-plan");
    requireDeviceAuthorization(result);
    if (!result.ok) return retry(result);
    if (!Array.isArray(result.tasks) || result.tasks.some(value=>!value || typeof value!=='object' || Array.isArray(value)
      || !validStore((value as Record<string,unknown>).marketplace)))
      return retry({ok:false,error:"invalid_response",retryable:true});
    if(result.remaining && typeof result.remaining==='object' && !Array.isArray(result.remaining)) {
      const raw=result.remaining as Record<string,unknown>;
      const amount=(value:unknown)=>typeof value==='number' && Number.isSafeInteger(value) && value>=0 && value<=500 ? value : null;
      state={...state,remaining:{listing:amount(raw.listing),pdp:amount(raw.pdp),asOf:new Date().toISOString()}};
    }
    const relevant=result.tasks.filter(value=>value && typeof value==='object' && !Array.isArray(value)
      && (value as Record<string,unknown>).marketplace===state!.marketplace);
    const parsed=relevant.map(value=>safeTask(value,state!.marketplace));
    if(parsed.some(task=>task===null)) return retry({ok:false,error:"invalid_response",retryable:true});
    const task=parsed.find(Boolean) ?? null;
    if (!task) {
      if (Array.isArray(result.busyMarketplaces) && result.busyMarketplaces.includes(state.marketplace))
        return pause("recapture_target_busy");
      if (result.planUpdating===true) return pause("recapture_plan_updating");
      await schedule({...state,phase:"completed",error:undefined});
      if (state.mode!=="assisted" && state.tabId!==undefined) await chrome.tabs.remove(state.tabId).catch(()=>{});
      return;
    }
    state={...state,task,phase:state.mode==="assisted" ? "awaiting_open" : "claiming",claimRequestId:crypto.randomUUID(),claimToken:hexToken(),
      claimSupportsTargets:Array.isArray(result.capabilities) && result.capabilities.includes("claim-targets-v1"),attempts:0,nextAt:Date.now()};
    await schedule(state);return;
  }
  if (!state.task || !state.claimRequestId || !state.claimToken) return pause("recapture_state_invalid");
  if (state.phase==="claiming") {
    const origins:Record<RecaptureStore,string>={mercadolivre:"https://*.mercadolivre.com.br/*",amazon:"https://*.amazon.com.br/*",aliexpress:"https://*.aliexpress.com/*"};
    if(!await chrome.permissions.contains({origins:[origins[state.marketplace]]})) return pause("permission_required");
    const result=await postJson({baseUrl:scope.origin,token:scope.token},"/api/extension/recapture-plan/claim",{
      requestId:state.claimRequestId,sessionId:state.sessionId,taskId:state.task.id,revision:state.task.revision,claimToken:state.claimToken,
      ...(state.claimSupportsTargets ? {supportsClaimTargets:true} : {})},state.claimRequestId);
    requireDeviceAuthorization(result);
    if (!result.ok) {
      if (result.error==="recapture_plan_changed" || result.error==="recapture_claim_expired"
        || result.error==="recapture_target_busy" || result.error==="recapture_task_no_longer_needed") return abandonExpired(result.error);
      return retry(result);
    }
    if(result.skipped===true) {
      await schedule({...state,phase:"between",task:undefined,claimRequestId:undefined,claimToken:undefined,
        attempts:0,error:undefined,nextAt:Date.now()+pauseMs(state)});return;
    }
    if (typeof result.leaseUntil!=="string" || !Number.isFinite(Date.parse(result.leaseUntil)) || Date.parse(result.leaseUntil)<=Date.now()) return pause("recapture_claim_expired");
    const claimedTask=safeTask({...state.task,targets:state.claimSupportsTargets ? result.targets : state.task.targets},state.marketplace);
    if(!claimedTask) return pause("invalid_response");
    await schedule({...state,task:claimedTask,phase:"preparing_tab",leaseUntil:result.leaseUntil,attempts:0,nextAt:Date.now()+pauseMs(state)});return;
  }
  if (state.phase==="preparing_tab") {
    if (!state.leaseUntil || Date.parse(state.leaseUntil)<=Date.now()) return abandonExpired("recapture_claim_expired");
    const origins:Record<RecaptureStore,string>={mercadolivre:"https://*.mercadolivre.com.br/*",amazon:"https://*.amazon.com.br/*",aliexpress:"https://*.aliexpress.com/*"};
    if(!await chrome.permissions.contains({origins:[origins[state.marketplace]]})) return pause("permission_required");
    let tabId=state.tabId;
    if (tabId===undefined) { const tab=await chrome.tabs.create({url:"about:blank",active:false}); if (tab.id===undefined) return pause("tab_unavailable");tabId=tab.id; }
    // Persist before navigation: a crash never repeats an uncertain page load.
    state={...state,tabId,phase:"navigating",navigationStartedAt:Date.now(),nextAt:Date.now()+10_000};
    await schedule(state);
    try { await chrome.tabs.update(tabId,{url:state.task!.url}); }
    catch { await schedule({...state,phase:"paused",resumePhase:"navigating",error:"navigation_unknown"}); }
    return;
  }
  if (state.phase==="navigating") {
    if (!state.leaseUntil || Date.parse(state.leaseUntil)<=Date.now()) return abandonExpired("recapture_claim_expired");
    if (state.tabId===undefined) return pause("tab_unavailable");
    let tab:chrome.tabs.Tab; try {tab=await chrome.tabs.get(state.tabId);} catch {return pause("tab_unavailable");}
    const loading=tab.status!=="complete" || Boolean(tab.pendingUrl);
    if (loading && Date.now()-(state.navigationStartedAt ?? Date.now())<120_000) {
      await schedule({...state,nextAt:Date.now()+15_000});return;
    }
    // A completed previous document can coexist with a pending navigation.
    // On timeout, report failure instead of reading that stale document.
    await collectRecaptureTab(state,tab,loading);return;
  }
  if (state.phase==="reporting") {
    if (!state.report) return pause("recapture_state_invalid");
    const result=await postJson({baseUrl:scope.origin,token:scope.token},"/api/extension/observations",state.report,state.report.requestId);
    requireDeviceAuthorization(result);
    if (!result.ok) {
      if (result.error==="recapture_claim_expired") {
        return abandonExpired(result.error);
      }
      return retry(result);
    }
    const validCount=(value:unknown,max:number)=>typeof value==='number' && Number.isSafeInteger(value) && value>=0 && value<=max;
    if (!validCount(result.observed,500) || !validCount(result.residual,500) || !validCount(result.unreported,500)
      || !validCount(result.unavailable,500) || !validCount(result.discovered,200)
      || !Array.isArray(result.results) || result.results.length>500)
      return retry({ok:false,error:"invalid_response",retryable:true});
    const resultKeys=new Set<string>();
    for(const item of result.results) {
      if(!item || typeof item!=='object' || Array.isArray(item)) return retry({ok:false,error:"invalid_response",retryable:true});
      const row=item as Record<string,unknown>;
      if(typeof row.productId!=='string' || typeof row.optionKey!=='string'
        || !['observed','unavailable_confirmed','residual','unreported'].includes(String(row.status)))
        return retry({ok:false,error:"invalid_response",retryable:true});
      const key=JSON.stringify([row.productId,row.optionKey]);
      if(resultKeys.has(key)) return retry({ok:false,error:"invalid_response",retryable:true});
      resultKeys.add(key);
    }
    if(state.claimSupportsTargets && (resultKeys.size!==state.task.targets.length
      || state.task.targets.some(target=>!resultKeys.has(JSON.stringify([target.productId,target.optionKey])))))
      return retry({ok:false,error:"invalid_response",retryable:true});
    const blocking=state.report.results.some(item=>item.status==="needs_login") ? "needs_login"
      : state.report.results.some(item=>item.status==="blocked") ? "blocked" : undefined;
    const allowedReasons=new Set(["price_conflict","no_price","not_found_on_listing","configuration_mismatch",
      "needs_login","blocked","parse_error","timeout","superseded_observation","unreported"]);
    const reasons:Record<string,number>={};
    if (Array.isArray(result.results) && result.results.length<=500) for (const raw of result.results) {
      if (!raw || typeof raw!=="object" || Array.isArray(raw)) continue;
      const item=raw as Record<string,unknown>;
      const reason=item.status==="unreported" ? "unreported" : item.status==="residual" ? item.reason : null;
      if (typeof reason==="string" && allowedReasons.has(reason)) reasons[reason]=(reasons[reason] ?? 0)+1;
    }
    const count=(value:unknown,max:number)=>typeof value==="number" && Number.isSafeInteger(value) && value>=0 && value<=max ? value : 0;
    const lastReport={discovered:count(result.discovered,200),unavailable:count(result.unavailable,500),reasons};
    await schedule({...state,phase:blocking ? "paused" : "between",resumePhase:blocking ? "between" : undefined,error:blocking,
      task:undefined,claimRequestId:undefined,claimToken:undefined,leaseUntil:undefined,report:undefined,
      completed:state.completed+1,observed:state.observed+(typeof result.observed==="number" ? result.observed : 0),
      residual:state.residual+(typeof result.residual==="number" ? result.residual : 0)
        +(typeof result.unreported==="number" ? result.unreported : 0),lastReport,attempts:0,nextAt:Date.now()+pauseMs(state)});
  }
}
