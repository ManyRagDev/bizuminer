"use server";

import { commercialActionError } from "../../../lib/commercial-messages.ts";
import { revalidatePath } from "next/cache";
import { getPageAuth, isAffiliate } from "../../../lib/auth.ts";
import { resolveAccountContext } from "../../../lib/account-context.ts";
import type { AccountContext } from "../../../lib/tenant-db.ts";
import type { KitArtifactFormat } from "../../../lib/kit-renderer.ts";
import { generateKitArtifact } from "../../../lib/kit-artifact-db.ts";
import { shareBaseUrl } from "../../../lib/site-url.ts";
import {
  createCampaignForAccount,createKitForAccount,validateKitForAccount,approveKitForAccount,
  preparePublicationExport,markPublicationExported,confirmPublication,reviseKitForAccount,
} from "../../../lib/commercial-workflow.ts";

async function run<T>(tenantId:string|undefined,work:(context:AccountContext)=>Promise<T>) {
  try {
    const user=await getPageAuth();
    if(!user || !await isAffiliate(user)) return {ok:false as const,error:"Acesso não autorizado."};
    const context=await resolveAccountContext({authUserId:user.id,requestedAccount:tenantId});
    if(!context) return {ok:false as const,error:"Conta não autorizada."};
    const result=await work(context);
    revalidatePath("/admin/campanhas");
    return {ok:true as const,data:result};
  } catch(error) {
    return {ok:false as const,error:commercialActionError(error)};
  }
}

export async function createCampaignAction(input:Parameters<typeof createCampaignForAccount>[1]&{tenantId?:string}) {
  return run(input.tenantId,ctx=>createCampaignForAccount(ctx,input));
}
export async function createCommercialKitDraftAction(input:Parameters<typeof createKitForAccount>[1]&{tenantId?:string}) {
  return run(input.tenantId,ctx=>createKitForAccount(ctx,input));
}
export async function validateCommercialKitRevisionAction(input:Parameters<typeof validateKitForAccount>[1]&{tenantId?:string}) {
  return run(input.tenantId,ctx=>validateKitForAccount(ctx,input));
}
export async function approveCommercialKitAction(input:Parameters<typeof approveKitForAccount>[1]&{tenantId?:string}) {
  return run(input.tenantId,ctx=>approveKitForAccount(ctx,input));
}
export async function revalidateKitBeforeExportAction(input:Parameters<typeof preparePublicationExport>[1]&{tenantId?:string}) {
  return run(input.tenantId,ctx=>preparePublicationExport(ctx,input));
}
export async function markPublicationExportedAction(input:Parameters<typeof markPublicationExported>[1]&{tenantId?:string}) {
  return run(input.tenantId,ctx=>markPublicationExported(ctx,input));
}
export async function confirmPublicationAction(input:Parameters<typeof confirmPublication>[1]&{tenantId?:string}) {
  return run(input.tenantId,ctx=>confirmPublication(ctx,input));
}
export async function reviseCommercialKitAction(input:Parameters<typeof reviseKitForAccount>[1]&{tenantId?:string}) {
  return run(input.tenantId,ctx=>reviseKitForAccount(ctx,input));
}
export async function generateKitArtifactAction(input:{tenantId:string;kitId:string;expectedVersion:number;format?:KitArtifactFormat}){return run(input.tenantId,c=>generateKitArtifact(c,{...input,origin:shareBaseUrl()}));}
