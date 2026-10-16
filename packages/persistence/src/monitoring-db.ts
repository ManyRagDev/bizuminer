import type { Sql } from 'postgres';
import {randomUUID} from 'node:crypto';
/** Trusted backend worker scope; never impersonates a human owner.
 * The callback must contain only database work, never marketplace/network I/O. */
export async function withMonitoringDb<T>(sql:Sql,tenantId:string,work:(tx:Sql)=>Promise<T>):Promise<T> {
 if(!/^[a-z0-9._-]{1,64}$/.test(tenantId))throw new Error('invalid_monitoring_tenant');
 return await sql.begin(async tx=>{
  await tx`select set_config('garimpa.tenant_id',${tenantId},true),
    set_config('garimpa.actor_type','worker',true),
    set_config('garimpa.membership_role','',true),
    set_config('garimpa.actor_app_user_id','',true),
    set_config('garimpa.platform_role','',true),
    set_config('garimpa.request_id',${randomUUID()},true)`;
  return work(tx as unknown as Sql);
 }) as unknown as T;
}
