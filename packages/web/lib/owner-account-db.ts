import { currentAccount } from './account-scope.ts';
import { withAccountDb } from './tenant-db.ts';
import { db } from './db.ts';
import type postgres from 'postgres';
/** Owner authority comes from the authenticated account context and is revalidated in DB. */
export function withOwnerAccountDb<T>(appUserId: string | null, work: (tx: postgres.TransactionSql,affiliateId:string)=>Promise<T>, factory:typeof db=db) {
 const context=currentAccount();
 if(!context || context.actor!=='human' || context.membershipRole!=='owner' || (appUserId && context.actorAppUserId!==appUserId))throw new Error('affiliate_owner_required');
 return withAccountDb(context,tx=>work(tx,context.affiliateId),factory);
}
