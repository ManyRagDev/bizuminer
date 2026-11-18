import {db} from './db.ts';
import type {AccountContext} from './tenant-db.ts';
import {readProcessingProgress} from './operation-progress-db.ts';
export type CurationAutomation={queued:number;running:number;uncertain:number;assessed:number;eligible:number;exceptions:number;checks:number};
/** The sidebar, initial summary and live status share the same current-work rules. */
export async function readCurationAutomation(account:AccountContext,factory:typeof db=db):Promise<CurationAutomation|null>{
  const state=await readProcessingProgress(account,undefined,factory);
  if(!state.evaluation)return null;
  const e=state.evaluation;
  return {queued:e.queued,running:e.running,uncertain:e.uncertain,assessed:e.recorded,eligible:e.eligible,exceptions:e.exceptions,checks:state.preparation?.products??0};
}
