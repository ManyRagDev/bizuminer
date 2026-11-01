"use server";
import { revalidatePath } from "next/cache";
import { accountOperation } from "../../../lib/page-account.ts";
import { configureRecommendationChannel, refreshRecommendationEditions, type ConfigureChannelInput } from "../../../lib/recommendation-db.ts";
import { confirmOfferOption } from "../../../lib/offer-option-db.ts";
import type { ConfirmOfferInput } from "../../../lib/offer-option.ts";
import { saveDiscoveryPolicy,type DiscoveryPolicyInput } from "../../../lib/discovery-policy-db.ts";

export async function configureDiscoveryAction(input:DiscoveryPolicyInput){
  return accountOperation(async()=>{
    const result=await saveDiscoveryPolicy(input);
    if(result.ok)revalidatePath("/admin/curadoria");
    return result;
  },input.expectedTenantId);
}

export async function configureChannelAction(input:ConfigureChannelInput) {
  return accountOperation(async account=>{
    if (account.membershipRole!=="owner") return {ok:false as const,error:"forbidden"};
    const result=await configureRecommendationChannel(input);
    if (result.ok) {
      try { await refreshRecommendationEditions(account.tenantId); }
      catch { revalidatePath("/admin/curadoria");return {ok:true as const,preparationFailed:true}; }
      revalidatePath("/admin/curadoria"); revalidatePath("/pauta"); revalidatePath("/");
    }
    return result;
  },input.expectedTenantId);
}
export async function previewChannelsAction(tenantId:string) {
  return accountOperation(async account=>refreshRecommendationEditions(account.tenantId,undefined,true),tenantId);
}
export async function confirmOfferAction(input:ConfirmOfferInput) {
  return accountOperation(async account=>{
    const result=await confirmOfferOption(input);
    if (result.ok) {
      try { await refreshRecommendationEditions(account.tenantId); }
      catch { revalidatePath("/admin/curadoria");return {...result,preparationFailed:true}; }
      revalidatePath("/admin/curadoria");revalidatePath("/pauta");revalidatePath("/");
    }
    return result;
  },input.expectedTenantId);
}
