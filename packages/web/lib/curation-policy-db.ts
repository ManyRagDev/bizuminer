import type { AccountContext } from "./account-context.ts";
import { withAccountDb } from "./tenant-db.ts";
import { DEFAULT_SELECTION_POLICY_V2, isValidSelectionPolicyV2, type SelectionPolicyV2 } from "./curation-selection-v2.ts";
import { DEFAULT_SCORE_WEIGHTS, validScoreWeights, type ScoreWeights } from "./curation-score-v2.ts";

export type CurationPolicyView = {version:number;enabled:boolean;autoEligibility:boolean;autoPublishConfigured:boolean;policy:SelectionPolicyV2;weights:ScoreWeights;available:boolean};

export async function readCurationPolicy(account:AccountContext):Promise<CurationPolicyView> {
  const fallback={version:0,enabled:false,autoEligibility:false,autoPublishConfigured:false,policy:DEFAULT_SELECTION_POLICY_V2,weights:DEFAULT_SCORE_WEIGHTS,available:false};
  try {
    return await withAccountDb(account,async tx=>{
      const [row]=await tx<{version:number;enabled:boolean;config:Record<string,unknown>}[]>`
        select version,enabled,config from garimpa.curation_policy_v2 where tenant_id=${account.tenantId}`;
      const config=row?.config ?? {};
      const weights=config.scoreWeights ?? DEFAULT_SCORE_WEIGHTS;
      const [guideline]=await tx<{auto_publish:boolean}[]>`select auto_publish from garimpa.editorial_guideline where tenant_id=${account.tenantId}`;
      const policy={...DEFAULT_SELECTION_POLICY_V2};
      for(const key of Object.keys(policy) as Array<keyof SelectionPolicyV2>) {
        if(Object.hasOwn(config,key)) Object.assign(policy,{[key]:config[key]});
      }
      if(!isValidSelectionPolicyV2(policy) || !validScoreWeights(weights as ScoreWeights)) return fallback;
      return {version:row?.version ?? 0,enabled:row?.enabled ?? false,autoEligibility:config.autoEligibility===true,
        autoPublishConfigured:guideline?.auto_publish===true,policy,weights:weights as ScoreWeights,available:true};
    });
  } catch {return fallback;}
}
