import type { Sql } from "postgres";
export function discoveryBudget(total:number,watchesDue:number,requested:number,enabled:boolean) {
  const budget=Math.max(0,Math.floor(total));
  const discovery=enabled ? Math.max(0,Math.min(Math.floor(requested),budget-Math.min(budget,watchesDue))) : 0;
  return {monitoring:budget-discovery,discovery};
}
export async function loadDiscoveryPolicy(sql:Sql,tenantId:string,marketplace:string) {
  const [schema]=await sql<{ready:boolean}[]>`select to_regclass('garimpa.editorial_discovery_policy') is not null as ready`;
  if(!schema?.ready)return null;
  const [row]=await sql<{enabled:boolean;items_per_run:number;keywords:string[];version:number}[]>`select enabled,items_per_run,keywords,version
    from garimpa.editorial_discovery_policy where tenant_id=${tenantId} and marketplace=${marketplace}`;
  return row ?? null;
}
/** One keyword per cycle, rotating without issuing every search on every run. */
export function discoveryKeyword(keywords:string[],now=new Date()) {
  if(!keywords.length)throw new Error("discovery_keywords_required");
  return keywords[Math.floor(now.getTime()/(6*3600000))%keywords.length]!;
}
