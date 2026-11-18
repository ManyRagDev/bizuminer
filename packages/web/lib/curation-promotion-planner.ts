import type { Sql } from "postgres";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";
import { composeCurationSelection, DEFAULT_SELECTION_POLICY_V2, type OccupantSnapshot, type SelectionCandidate, type SelectionPolicyV2 } from "./curation-selection-v2.ts";
import { requestPromotionChecks } from "./curation-promotion-db.ts";
import { DEFAULT_SCORE_WEIGHTS, type ScoreWeights } from "./curation-score-v2.ts";
import { scoreWeightsRevision } from "./curation-score-revision.ts";
import { createHash } from "node:crypto";
import type { CohortEntrySnapshot } from "./curation-cohort-v2.ts";

type Row = { id:string; marketplace:SelectionCandidate['marketplace']; category:string|null; family_key:string|null; option_key:string;
  price_type:SelectionCandidate['priceType']; currency:string; price_cents:number; observation_id:string; source_revision:string;
  verified_at:Date|string|null; verification_method:SelectionCandidate['verificationMethod']; availability:SelectionCandidate['available']|null;
  affiliate_ready:boolean; curation_status:string|null; assessment_id:string|null; attributes:{flags?:string[]}|null;
  score_vitrine:string|number;potential_score:string|number;policy_version:string;normalization_revision:string|null;equivalence_key:string|null;equivalent_human_veto:boolean;
  entry_snapshot:CohortEntrySnapshot|null;normalized_entry_score:string|number|null;normalized_entry_fingerprint:string|null };

/** Reads the contest in the caller's account-scoped database transaction. */
export async function readCurationCompetition(tx: Sql, tenantId: string) {
    const [schema] = await tx<{ ready: boolean }[]>`
      select to_regclass('garimpa.curation_policy_v2') is not null
        and to_regclass('garimpa.curation_equivalence_member') is not null as ready`;
    if (!schema?.ready) return null;
    const [configuration] = await tx<{version:number;enabled:boolean;config:Partial<SelectionPolicyV2> & {scoreWeights?:ScoreWeights}}[]>`
      select version,enabled,config from garimpa.curation_policy_v2 where tenant_id=${tenantId}`;
    if (!configuration?.enabled) return null;
    const rows = await tx<Row[]>`select p.id,p.marketplace,p.category,p.family_key,s.option_key,
      o.offer_evidence->>'priceType' as price_type,o.offer_evidence->>'currency' as currency,o.price_cents,o.id as observation_id,
      s.source_revision,v.verified_at,o.offer_evidence->>'observationMethod' as verification_method,v.availability,
      c.status as curation_status,eq.id::text as equivalence_key,
      exists(select 1 from garimpa.curation_equivalence_member other
        join garimpa.product_curation blocked on blocked.tenant_id=other.tenant_id and blocked.product_id=other.product_id and blocked.status='rejected'
        join lateral (select e.to_status from garimpa.curation_event e where e.tenant_id=other.tenant_id and e.product_id=other.product_id
          and e.actor_type='human' order by e.id desc limit 1) decision on decision.to_status='rejected'
        where eq.id is not null and other.tenant_id=p.tenant_id and other.group_id=eq.id and other.active) as equivalent_human_veto,
      case when garimpa.has_current_curation_assessment(p.tenant_id,p.id,o.id)
        and a.last_curation_event_id is not distinct from
        (select event.id::text from garimpa.curation_event event where event.tenant_id=p.tenant_id and event.product_id=p.id order by event.id desc limit 1)
        then a.id::text else null end as assessment_id,a.attributes,s.score_vitrine,s.potential_score,s.policy_version,
      s.components->>'normalizationRevision' as normalization_revision,
      s.components->'entrySnapshot' as entry_snapshot,s.components->>'normalizedEntryScore' as normalized_entry_score,
      s.components->>'normalizedEntryFingerprint' as normalized_entry_fingerprint,
      exists(select 1 from garimpa.publication pub join garimpa.affiliate_account account on account.id=pub.affiliate_id and account.tenant_id=pub.tenant_id and account.status='active'
        left join garimpa.affiliate_marketplace_config cfg on cfg.affiliate_id=account.id and cfg.marketplace=p.marketplace and cfg.status='active'
        where pub.tenant_id=p.tenant_id and pub.product_id=p.id and pub.channel='web' and pub.status='active'
          and (p.marketplace in ('shopee','aliexpress') and pub.affiliate_url ~ '^https://'
            or p.marketplace='amazon' and cfg.tracking_id ~ '^[A-Za-z0-9_-]{1,80}$'
            or p.marketplace='mercadolivre' and coalesce(cfg.tracking_id,'')<>'' and coalesce(cfg.tool_id,'')<>'')) as affiliate_ready
      from garimpa.curation_score_projection s join garimpa.product p on p.id=s.product_id and p.tenant_id=s.tenant_id
      join garimpa.price_observation o on o.id=s.observation_id and o.product_id=p.id and o.tenant_id=p.tenant_id
      left join garimpa.offer_verification v on v.tenant_id=p.tenant_id and v.product_id=p.id and v.option_key=s.option_key
        and v.price_type=o.offer_evidence->>'priceType' and v.observation_id=o.id
      left join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id
      left join garimpa.curation_equivalence_member em on em.tenant_id=s.tenant_id and em.product_id=s.product_id and em.option_key=s.option_key and em.active
      left join garimpa.curation_equivalence_group eq on eq.tenant_id=em.tenant_id and eq.id=em.group_id and eq.revoked_at is null
      left join garimpa.curation_attribute_assessment a on a.tenant_id=p.tenant_id and a.product_id=p.id and a.id=s.assessment_id
      where s.tenant_id=${tenantId} and s.option_key=coalesce(
        (select choice.option_key from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id),
        (select newest.option_key from garimpa.price_observation newest where newest.tenant_id=p.tenant_id and newest.product_id=p.id
          order by newest.observed_at desc,newest.id desc limit 1))
        and o.id=(select latest.id from garimpa.price_observation latest where latest.tenant_id=p.tenant_id and latest.product_id=p.id
          and latest.option_key=s.option_key order by latest.observed_at desc,latest.id desc limit 1)`;
    const [edition] = await tx<{inputs:Array<{productId:string;entryScore?:number;scoreVersion?:string;normalizationRevision?:string;
      originalEntryScore?:number;originalScoreVersion?:string;originalNormalizationRevision?:string|null;entrySnapshot?:CohortEntrySnapshot}>}[]>`
      select inputs from garimpa.recommendation_edition where tenant_id=${tenantId} and channel='home'`;
    return { configuration, rows, inputs: edition?.inputs ?? [] };
}

export function composeCurationCompetition(state:NonNullable<Awaited<ReturnType<typeof readCurationCompetition>>>, now:Date,
  usable?: ReadonlySet<string>) {
  const policy = { ...DEFAULT_SELECTION_POLICY_V2, ...state.configuration.config };
  const expectedScoreVersion=scoreWeightsRevision(state.configuration.config.scoreWeights ?? DEFAULT_SCORE_WEIGHTS);
  const candidates:SelectionCandidate[] = state.rows.map(row => ({ id:row.id,marketplace:row.marketplace,category:row.category,
    familyKey:row.family_key ?? `product:${row.id}`,equivalenceKey:row.equivalence_key,optionKey:row.option_key,priceType:row.price_type,
    currency:row.currency,priceCents:row.price_cents,observationId:row.observation_id,revision:row.source_revision,
    verifiedAt:row.verified_at ? new Date(row.verified_at).toISOString() : null,verificationMethod:row.verification_method,
    available:row.availability ?? 'unknown',affiliateReady:row.affiliate_ready,
    blocked:row.curation_status!=='approved' || row.equivalent_human_veto || (row.attributes?.flags ?? []).some(flag => ['unsafe','restricted','misleading_claim','ambiguous_configuration','insufficient_evidence'].includes(flag)),
    assessmentCurrent:!!row.assessment_id && row.policy_version===expectedScoreVersion,score:Number(row.score_vitrine),potentialScore:Number(row.potential_score),scoreVersion:row.policy_version,
    normalizationRevision:row.normalization_revision,entrySnapshot:row.entry_snapshot ?? undefined,
    normalizedEntryScore:row.normalized_entry_score===null ? null : Number(row.normalized_entry_score),
    normalizedEntryFingerprint:row.normalized_entry_fingerprint }));
  const byId=new Map(candidates.map(candidate=>[candidate.id,candidate]));
  const occupants:OccupantSnapshot[] = state.inputs.map(input => {
    const candidate=byId.get(input.productId);
    const fingerprint=input.entrySnapshot ? createHash('sha256').update(JSON.stringify(input.entrySnapshot)).digest('hex') : null;
    const recalculated=!!fingerprint && candidate?.normalizedEntryFingerprint===fingerprint
      && typeof candidate.normalizedEntryScore==='number' && Number.isFinite(candidate.normalizedEntryScore);
    return {id:input.productId,entryScore:recalculated ? candidate!.normalizedEntryScore! : typeof input.entryScore==='number' ? input.entryScore : 0,
      scoreVersion:recalculated ? candidate!.scoreVersion : input.scoreVersion ?? 'legacy',
      normalizationRevision:recalculated ? candidate!.normalizationRevision : input.normalizationRevision ?? null};
  });
  const result = composeCurationSelection(usable ? candidates.filter(c=>usable.has(`${c.id}\0${c.observationId}`)) : candidates,occupants,now,policy);
  return { ...result,policy };
}

/** Reads only committed facts and queues checks; it does not expose an edition. */
export async function planCurationPromotions(sql: Sql, tenantId: string, now = new Date(),projectionOwner?:string) {
  const state = await withMonitoringDb(sql, tenantId, tx => readCurationCompetition(tx,tenantId));
  if (!state) return { enabled:false, pending:0, selected:0, openSlots:0, nextIntervalMs:600_000 };
  const result=composeCurationCompetition(state,now);
  const pending = await requestPromotionChecks(sql,tenantId,result.pending,state.configuration.version,now,projectionOwner);
  return { enabled:true,pending,selected:result.selected.length,openSlots:result.openSlots,exits:result.exits,exceptions:result.exceptions,
    nextIntervalMs:Math.max(1_000,Math.min(600_000,result.policy.shopeeHours*3_600_000*0.2)) };
}
