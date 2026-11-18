import { isExtensionMarketplace, type SupportedExtensionMarketplace } from "./extension-contract.ts";
import { validBatchId, validateBrowserCaptureWithDiagnostics, type BrowserCaptureProduct } from "./browser-capture-contract.ts";
import { ambiguousSourceIdentity, pageObservationMethod, sourcePageUrl } from "../../capture/src/source-page-url.ts";

export const RECAPTURE_RESULT_STATES = ["observed","unavailable_confirmed","not_found_on_listing","no_price","needs_login","blocked","parse_error","timeout","configuration_mismatch"] as const;
type State = typeof RECAPTURE_RESULT_STATES[number];
export type RecaptureObservation = { version:2; requestId:string; taskId:string; sessionId:string; claimToken:string;
  marketplace:SupportedExtensionMarketplace; observedAt:string; page:{kind:"listing"|"product";url:string};
  products:BrowserCaptureProduct[]; results:Array<{productId:string;externalId:string;optionKey:string;status:State;evidence?:"explicit_product_unavailable"}> };

export function validateRecaptureObservation(raw:unknown):RecaptureObservation {
  if (!raw || typeof raw!=="object" || Array.isArray(raw)) throw new Error("recapture_observation_invalid");
  const body=raw as Record<string,unknown>;
  if (Object.keys(body).sort().join(',')!=="claimToken,marketplace,observedAt,page,products,requestId,results,sessionId,taskId,version"
    || body.version!==2 || !validBatchId(body.requestId) || !validBatchId(body.taskId) || !validBatchId(body.sessionId)
    || typeof body.claimToken!=="string" || !/^[a-f0-9]{64}$/i.test(body.claimToken) || !isExtensionMarketplace(body.marketplace)
    || typeof body.observedAt!=="string" || !Number.isFinite(Date.parse(body.observedAt))
    || Date.parse(body.observedAt)>Date.now()+60_000 || Date.parse(body.observedAt)<Date.now()-30*60_000
    || !Array.isArray(body.products) || body.products.length>200 || !Array.isArray(body.results) || body.results.length>500)
    throw new Error("recapture_observation_invalid");
  const marketplace = body.marketplace;
  const page=body.page as Record<string,unknown>|undefined;
  if (!page || Object.keys(page).sort().join(',')!=="kind,url" || (page.kind!=="listing" && page.kind!=="product") || typeof page.url!=="string" || page.url.length>2048)
    throw new Error("recapture_observation_invalid");
  let pageUrl:URL;
  try { pageUrl=new URL(page.url); } catch { throw new Error("recapture_observation_invalid"); }
  const host=marketplace==='mercadolivre' ? /(^|\.)mercadolivre\.com\.br$/i
    : marketplace==='amazon' ? /(^|\.)amazon\.com\.br$/i : /(^|\.)aliexpress\.com$/i;
  if (ambiguousSourceIdentity(pageUrl,marketplace) || pageUrl.protocol!=="https:" || pageUrl.username || pageUrl.password || pageUrl.port || !host.test(pageUrl.hostname)
    || /\/(?:login|checkout|ap\/signin|gp\/cart|p\/trade)(?:\/|$)/i.test(pageUrl.pathname)) throw new Error("recapture_observation_invalid");
  const normalizedPage={kind:page.kind,url:sourcePageUrl(pageUrl,marketplace)} as const;
  const validation=body.products.length ? validateBrowserCaptureWithDiagnostics({ version:1,requestId:body.requestId,
    marketplace,clientCapturedAt:body.observedAt,page:normalizedPage,products:body.products }) : null;
  if (validation && (validation.diagnostics.rejected>0 || validation.diagnostics.duplicates>0)) throw new Error("recapture_observation_invalid");
  const products=validation?.payload.products ?? [];
  // A directed PDP is evidence only for the product identified by its URL.
  // Listing pages can still report newly discovered neighboring products.
  if (normalizedPage.kind==="product" && (products.length>1 || products.some(product=>
    pageObservationMethod(marketplace,normalizedPage,product.externalId)!=="product_page")))
    throw new Error("recapture_observation_invalid");
  const results:RecaptureObservation['results']=[], seen=new Set<string>();
  for (const item of body.results) {
    if (!item || typeof item!=="object" || Array.isArray(item)) throw new Error("recapture_observation_invalid");
    const result=item as Record<string,unknown>;
    const expectedKeys=result.status==="unavailable_confirmed" ? "evidence,externalId,optionKey,productId,status" : "externalId,optionKey,productId,status";
    if (Object.keys(result).sort().join(',')!==expectedKeys
      || typeof result.productId!=="string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(result.productId)
      || typeof result.externalId!=="string" || result.externalId.length>64 || !result.externalId
      || typeof result.optionKey!=="string" || !/^(?:listing|[a-f0-9]{32})$/.test(result.optionKey)
      || typeof result.status!=="string" || !(RECAPTURE_RESULT_STATES as readonly string[]).includes(result.status)
      || result.status==="unavailable_confirmed" && (result.evidence!=="explicit_product_unavailable" || normalizedPage.kind!=="product"))
      throw new Error("recapture_observation_invalid");
    if (result.status==="no_price" && normalizedPage.kind!=="product") throw new Error("recapture_observation_invalid");
    if (result.status==="not_found_on_listing" && (normalizedPage.kind!=="listing"
      || products.some(product=>product.externalId===result.externalId))) throw new Error("recapture_observation_invalid");
    const key=`${result.productId}\0${result.optionKey}`;
    if (seen.has(key)) throw new Error("recapture_observation_invalid");
    seen.add(key); results.push({productId:result.productId,externalId:result.externalId,optionKey:result.optionKey,status:result.status as State,
      ...(result.status==="unavailable_confirmed" ? {evidence:"explicit_product_unavailable" as const} : {})});
  }
  if (products.length && results.some(result => ["needs_login","blocked","parse_error","timeout","unavailable_confirmed","no_price"].includes(result.status)))
    throw new Error("recapture_observation_invalid");
  return {version:2,requestId:body.requestId,taskId:body.taskId,sessionId:body.sessionId,claimToken:body.claimToken.toLowerCase(),
    marketplace:body.marketplace,observedAt:new Date(body.observedAt).toISOString(),page:normalizedPage,products,results};
}
