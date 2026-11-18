import { withTenantDb } from "./tenant-db.ts";
import { DEFAULT_SCORE_WEIGHTS, validScoreWeights, type ScoreWeights } from "./curation-score-v2.ts";
import { scoreWeightsRevision } from "./curation-score-revision.ts";

export type ScoreComparison = { productId: string; scoreVitrine: number; scorePauta: number; potentialScore: number;
  calculatedAt: string; sourceRevision: string; cohort: { fallback?: string; size?: number }; components: Record<string, unknown> };

/** Backward compatible with installations where the additive migration is not applied. */
export async function readScoreComparison(tenantId: string, productIds: string[]): Promise<ScoreComparison[]> {
  if (!productIds.length) return [];
  return withTenantDb(tenantId, async sql => {
    const [schema] = await sql<{ready:boolean}[]>`select to_regclass('garimpa.curation_score_projection') is not null
      and to_regclass('garimpa.curation_policy_v2') is not null as ready`;
    if (!schema?.ready) return [];
    const [policy]=await sql<{config:{scoreWeights?:ScoreWeights}}[]>`select config from garimpa.curation_policy_v2 where tenant_id=${tenantId}`;
    const weights=policy?.config?.scoreWeights ?? DEFAULT_SCORE_WEIGHTS;
    if(!validScoreWeights(weights)) return [];
    const scoreVersion=scoreWeightsRevision(weights);
    const rows = await sql<Array<{product_id:string;score_vitrine:string;score_pauta:string;potential_score:string;
      calculated_at:Date|string;source_revision:string;cohort:ScoreComparison['cohort'];components:Record<string,unknown>}>>`
      select s.product_id,s.score_vitrine,s.score_pauta,s.potential_score,s.calculated_at,s.source_revision,s.cohort,s.components
      from garimpa.curation_score_projection s
      where s.tenant_id=${tenantId} and s.product_id=any(${productIds})
        and s.policy_version=${scoreVersion}
        and s.option_key=coalesce((select choice.option_key from garimpa.editorial_offer_choice choice
          where choice.tenant_id=s.tenant_id and choice.product_id=s.product_id),
          (select newest.option_key from garimpa.price_observation newest where newest.tenant_id=s.tenant_id and newest.product_id=s.product_id
            order by newest.observed_at desc,newest.id desc limit 1))
        and s.observation_id=(select o.id from garimpa.price_observation o where o.tenant_id=s.tenant_id
          and o.product_id=s.product_id and o.option_key=s.option_key order by o.observed_at desc,o.id desc limit 1)
      order by s.score_vitrine desc,s.product_id`;
    return rows.map(row => ({ productId:row.product_id,scoreVitrine:Number(row.score_vitrine),scorePauta:Number(row.score_pauta),
      potentialScore:Number(row.potential_score),calculatedAt:new Date(row.calculated_at).toISOString(),
      sourceRevision:row.source_revision,cohort:row.cohort,components:row.components }));
  });
}
