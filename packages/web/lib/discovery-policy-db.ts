import { db } from "./db.ts";
import { currentAccount,scopedTenantId } from "./account-scope.ts";
import { withAccountDb,withTenantDb } from "./tenant-db.ts";
export async function discoveryPolicies(tenantId=scopedTenantId(),sqlFactory:typeof db=db){
 return withTenantDb(tenantId,async tx=>{
  const [schema]=await tx`select to_regclass('garimpa.editorial_discovery_policy') is not null as ready`;
  return schema?.ready ? tx<any[]>`select * from garimpa.editorial_discovery_policy where tenant_id=${tenantId}`:[];
 },sqlFactory);
}
export interface DiscoveryPolicyInput{expectedTenantId:string;marketplace:'shopee'|'aliexpress';expectedVersion:number|null;enabled:boolean;itemsPerRun:number;keywords:string[]}
export async function saveDiscoveryPolicy(input:DiscoveryPolicyInput,sqlFactory:typeof db=db){
 const account=currentAccount();
 if(!account || account.actor!=="human" || account.membershipRole!=="owner" || input.expectedTenantId!==account.tenantId)return {ok:false as const,error:"forbidden"};
 if(!['shopee','aliexpress'].includes(input.marketplace) || typeof input.enabled!=="boolean"
  || !Number.isInteger(input.itemsPerRun) || input.itemsPerRun<1 || input.itemsPerRun>20
  || !Array.isArray(input.keywords) || !input.keywords.length || input.keywords.length>12
  || input.keywords.some(k=>typeof k!=="string" || k.trim().length<2 || k.length>120))return {ok:false as const,error:"invalid_discovery_policy"};
 return withAccountDb(account,async tx=>{
  await tx`select pg_advisory_xact_lock(hashtextextended(${`discovery:${account.tenantId}:${input.marketplace}`},0))`;
  const [current]=await tx<any[]>`select version from garimpa.editorial_discovery_policy where tenant_id=${account.tenantId} and marketplace=${input.marketplace}`;
  if((current?.version ?? null)!==input.expectedVersion)return {ok:false as const,error:"policy_conflict"};
  await tx`insert into garimpa.editorial_discovery_policy(tenant_id,marketplace,version,enabled,items_per_run,keywords)
    values(${account.tenantId},${input.marketplace},${(current?.version ?? 0)+1},${input.enabled},${input.itemsPerRun},${tx.json(input.keywords.map(k=>k.trim()))})
    on conflict(tenant_id,marketplace) do update set version=excluded.version,enabled=excluded.enabled,items_per_run=excluded.items_per_run,keywords=excluded.keywords,updated_at=now()`;
  return {ok:true as const};
 },sqlFactory);
}
