import type { OfferEvidenceV2 } from "../../capture/src/types.ts";

export interface ConfirmOfferInput {
  expectedTenantId:string;productId: string; expectedObservationId: string; variantKey: string; variantLabel: string;
  priceCents: number; quantity: number; contents: string; dimensions: string; sellerId: string;
  payment: string; coupon: string; region: string; shipping: string; confirmation: string;
}
export function validateOfferConfirmation(raw: unknown): ConfirmOfferInput | null {
  if (!raw || typeof raw !== "object") return null;
  const p=raw as ConfirmOfferInput;
  if(typeof p.expectedTenantId!=="string" || !/^[a-z0-9._-]{1,64}$/.test(p.expectedTenantId))return null;
  if (![p.productId,p.expectedObservationId,p.variantKey].every(v => typeof v === "string" && /^[a-zA-Z0-9_.:-]{1,120}$/.test(v))) return null;
  if (![p.variantLabel,p.contents,p.dimensions,p.sellerId,p.payment,p.coupon,p.region,p.shipping,p.confirmation]
    .every(v => typeof v === "string" && v.trim().length >= 2 && v.length <= 1000)) return null;
  if (!Number.isSafeInteger(p.priceCents) || p.priceCents <= 0 || p.priceCents > 100_000_000
    || !Number.isSafeInteger(p.quantity) || p.quantity < 1 || p.quantity > 10000) return null;
  return p;
}
/** NA is an explicit human assertion in this form; missing values never become NA. */
export function confirmedOfferEvidence(input: ConfirmOfferInput, marketplace: string, url: string, now = new Date()): OfferEvidenceV2 {
  const na=(v:string)=>v.trim().toUpperCase()==="NA";
  const fieldStates: Record<string,"observed"|"not_applicable">={packageQuantity:"observed",packageContents:"observed"};
  const facts: Record<string,unknown>={};
  for (const key of ["sellerId","dimensions"] as const) {
    fieldStates[key]=na(input[key]) ? "not_applicable" : "observed";
    if (!na(input[key])) facts[key]=input[key].trim();
  }
  const conditions: Record<string,string|number>={quantity:input.quantity};
  for (const key of ["payment","coupon","region","shipping"] as const) {
    fieldStates[key]=na(input[key]) ? "not_applicable" : "observed";
    if (!na(input[key])) conditions[key]=input[key].trim();
  }
  return { version:2, source:{ marketplace,method:"browser",url,capturedAt:now.toISOString() },currency:"BRL",priceType:"exact",
    variantKey:input.variantKey,variantLabel:input.variantLabel.trim(),
    variantIdentity:{state:"human_verified",key:input.variantKey,methodVersion:"editorial-confirmation-v1",sourceRefs:[url]},
    verification:{method:"editorial_confirmation",checkedAt:now.toISOString(),note:input.confirmation.trim()},
    packageQuantity:input.quantity,packageContents:[input.contents.trim()],conditions,fieldStates,...facts };
}
export function optionDetailPath(slug: string, key?: string) {
  return key ? `/oferta/${encodeURIComponent(slug)}/${encodeURIComponent(key)}` : `/bizu/${encodeURIComponent(slug)}`;
}
