import type postgres from 'postgres';
import { db } from './db.ts';
import { withAccountDb, type AccountContext } from './tenant-db.ts';
export type { AccountContext } from './tenant-db.ts';

/** Database-owned switch. No env/GUC fallback and no runtime permission to enable it. */
export async function commercialRolloutReady(sql: any): Promise<boolean> {
 const [installed]=await sql`select to_regprocedure('garimpa.commercial_rollout_ready()') is not null as ready`;
 if(installed?.ready!==true)return false;
 const [state]=await sql`select garimpa.commercial_rollout_ready() as ready`;
 return state?.ready===true;
}
export async function assertCommercialRolloutReady(sql: any) {
 if(!await commercialRolloutReady(sql))throw new Error('commercial_rollout_not_ready');
}
/** Guard the new commercial surfaces without restricting legacy capture, buyer or public paths. */
export function withCommercialDb<T>(context: AccountContext,work:(tx:postgres.TransactionSql)=>Promise<T>,factory:typeof db=db):Promise<T> {
 return withAccountDb(context,async tx=>{await assertCommercialRolloutReady(tx);return work(tx);},factory);
}
