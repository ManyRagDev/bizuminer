import type { CaptureAdapter,CaptureContext,Credential } from "../../capture/src/types.ts";
import type { OfferStore } from "./store.ts";
import { categoryForTitle } from "./category.ts";
import { familyInfoForTitle } from "./product-family.ts";

/** Discovery is a separate audit run and cannot change an editorial decision. */
export async function runEditorialDiscovery(adapter:CaptureAdapter,credential:Credential,store:OfferStore,
  input:{tenantId:string;keyword:string;budget:number;policyVersion:number;monitoringRunId:string},ctx:CaptureContext) {
  const budget=Math.min(20,Math.max(0,Math.floor(input.budget)));
  if(!budget)return {seen:0,captured:0,discovered:0,priceChanges:0};
  const runId=await store.startCaptureRun({tenantId:input.tenantId,marketplace:adapter.marketplace,startedAt:new Date(),collectorRunId:`${ctx.runId}-discovery`,
    parameters:{captureMode:"exploratory",capturePlanId:"editorial-discovery-v1",keyword:input.keyword,budget,discoveryPolicyVersion:input.policyVersion,monitoringRunId:input.monitoringRunId}});
  let seen=0,captured=0,discovered=0,priceChanges=0,failed=false;
  try{
    const page=await adapter.fetchOffers(credential,{keyword:input.keyword,pageSize:budget,maxPages:1},ctx);
    seen=page.offers.length;
    for(const offer of page.offers.slice(0,budget)){
      if(offer.marketplace!==adapter.marketplace || !Number.isSafeInteger(offer.priceCents) || offer.priceCents<=0 || !offer.externalId)continue;
      const result=await store.upsertProductWithObservation({captureRunId:runId,tenantId:input.tenantId,marketplace:adapter.marketplace,
        externalId:offer.externalId,title:offer.title,productUrl:offer.productUrl,imageUrl:offer.imageUrl,category:categoryForTitle(offer.title),family:familyInfoForTitle(offer.title),
        priceCents:offer.priceCents,originalPriceCents:offer.originalPriceCents,claimedDiscountRate:offer.claimedDiscountRate,ratingStar:offer.ratingStar,
        salesLabel:offer.salesLabel,salesCount:offer.salesCount,observedAt:offer.capturedAt,offerEvidence:offer.offerEvidence});
      captured++;if(result.isNew)discovered++;
      else if(result.previousPriceCents!==undefined && result.previousPriceCents!==offer.priceCents)priceChanges++;
    }
    return {seen,captured,discovered,priceChanges};
  }catch(error){failed=true;throw error;}
  finally{await store.finishCaptureRun(runId,{tenantId:input.tenantId,finishedAt:new Date(),status:failed?'error':'ok',itemsCaptured:captured,itemsNew:discovered,priceChanges,
    error:failed?'Falha na descoberta editorial':undefined,parameterPatch:{itemsSeen:seen}});}
}
