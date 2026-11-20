import {db} from './db.ts';
import type {AccountContext} from './tenant-db.ts';
import {readProcessingProgress} from './operation-progress-db.ts';
export type CurationAutomation={queued:number;running:number;uncertain:number;assessed:number;eligible:number;exceptions:number;checks:number};

const requestAutomationCache = new WeakMap<object, Promise<CurationAutomation | null>>();

/** The sidebar, initial summary and live status share the same current-work rules. */
export async function readCurationAutomation(account:AccountContext,factory:typeof db=db):Promise<CurationAutomation|null>{
  if (factory === db && account && typeof account === 'object') {
    const cached = requestAutomationCache.get(account);
    if (cached) return cached;
    const promise = computeCurationAutomation(account, factory).catch((err) => {
      requestAutomationCache.delete(account);
      throw err;
    });
    requestAutomationCache.set(account, promise);
    return promise;
  }
  return computeCurationAutomation(account, factory);
}

async function computeCurationAutomation(account:AccountContext,factory:typeof db=db):Promise<CurationAutomation|null>{
  const state=await readProcessingProgress(account,undefined,factory);
  if(!state.evaluation)return null;
  const e=state.evaluation;
  return {queued:e.queued,running:e.running,uncertain:e.uncertain,assessed:e.recorded,eligible:e.eligible,exceptions:e.exceptions,checks:state.preparation?.products??0};
}
