import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import { withMonitoringDb } from "../../persistence/src/monitoring-db.ts";
import { editorialEvidenceFingerprint } from "./editorial-selection.ts";
import { ATTRIBUTE_POLICY_VERSION } from "./curation-attributes-db.ts";
import { ATTRIBUTE_PROMPT_VERSION } from "./ai-curation-v2-service.ts";
import { assessmentNeedsRefresh, parseAttributeAssessments, type AttributeAssessment } from "./ai-curation-v2-contract.ts";
import { calculateCohortScores, type CohortCandidate, type CohortEntrySnapshot } from "./curation-cohort-v2.ts";
import { DEFAULT_SCORE_WEIGHTS, validScoreWeights, type ScoreWeights } from "./curation-score-v2.ts";
import { scoreWeightsRevision } from "./curation-score-revision.ts";

type ScoreRow = {
  product_id: string; title: string; product_url: string; image_url: string | null; category: string | null; marketplace: string;
  observation_id: string; option_key: string; price_cents: number; observed_at: Date | string; rating_star: number | null;
  sales_count: string | number | null; claimed_discount_rate: number | null; offer_evidence: Record<string, unknown> | null;
  assessment_id: string | null; attributes: unknown; material_fingerprint: string | null; assessment_price: number | null;
  assessment_policy: string | null; assessment_prompt: string | null; assessment_model: string | null; latest_event_id: string | null;
  assessment_has_material:boolean;
  reference_cents: number | null; reference_days: number; reference_span: number; reference_last_observed_at:Date|string|null;
  category_p95:string|number|null;category_sample:number|null;category_week:string|null;
  category_days:number|null;category_span:number|null;category_earliest:Date|string|null;category_latest:Date|string|null;
};
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Recompute a shadow projection over the same current rolling pool, never a public selection. */
export async function recomputeCurationScores(sql: Sql, tenantId: string, expectedModel: string, now = new Date(),projectionOwner?:string) {
  if (!expectedModel || expectedModel.length > 200 || !Number.isFinite(now.getTime())) throw new Error("score_input_invalid");
  const state = await withMonitoringDb(sql, tenantId, async tx => {
    const [policy]=await tx<{version:number;config:Record<string,unknown>}[]>`select version,config from garimpa.curation_policy_v2 where tenant_id=${tenantId}`;
    const configured=policy?.config?.scoreWeights ?? DEFAULT_SCORE_WEIGHTS;
    if(!validScoreWeights(configured as ScoreWeights)) throw new Error('score_weights_invalid');
    const weights=configured as ScoreWeights;
    const rows=await tx<ScoreRow[]>`
    select p.id as product_id,p.title,p.product_url,p.image_url,p.category,p.marketplace,
      o.id as observation_id,o.option_key,o.price_cents,o.observed_at,o.rating_star,o.sales_count,o.claimed_discount_rate,o.offer_evidence,
      a.id::text as assessment_id,a.attributes,a.material_fingerprint,a.price_cents as assessment_price,
      a.policy_version as assessment_policy,a.prompt_version as assessment_prompt,a.model as assessment_model,
      coalesce(jsonb_typeof(a.input_snapshot->'materialSnapshot')='object',false) as assessment_has_material,
      (select e.id::text from garimpa.curation_event e where e.tenant_id=p.tenant_id and e.product_id=p.id order by e.id desc limit 1) as latest_event_id,
      h.reference_cents,h.reference_days,h.reference_span,h.reference_last_observed_at,reference.percentile_95 as category_p95,reference.sample_size as category_sample,
      reference.week_start::text as category_week,reference.min_history_days as category_days,reference.min_history_span_days as category_span,
      reference.earliest_evidence as category_earliest,reference.latest_evidence as category_latest
    from garimpa.product p
    join lateral (select distinct on (o.option_key) o.* from garimpa.price_observation o
      where o.tenant_id=p.tenant_id and o.product_id=p.id and o.observed_at<=${now}
      order by o.option_key,o.observed_at desc,o.id desc) o on true
    left join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id
    left join lateral (select a.* from garimpa.curation_attribute_assessment a
      join garimpa.price_observation assessed on assessed.tenant_id=a.tenant_id and assessed.product_id=a.product_id and assessed.id=a.observation_id
      where a.tenant_id=p.tenant_id and a.product_id=p.id and assessed.option_key=o.option_key
      order by a.created_at desc,a.id desc limit 1) a on true
    left join garimpa.curation_category_reference reference on reference.tenant_id=p.tenant_id
      and reference.week_start=date_trunc('week',${now}::timestamptz at time zone 'America/Sao_Paulo')::date
      and reference.marketplace=p.marketplace and reference.category=p.category
      and reference.price_band=case when o.price_cents<5000 then 'ate_50' when o.price_cents<20000 then '50_a_200' else 'acima_200' end
    left join lateral (
      select case when count(*)>=3 and max(day)-min(day)>=7 then percentile_cont(0.5) within group(order by day_median) else null end as reference_cents,
        count(*)::int as reference_days,coalesce(max(day)-min(day),0)::int as reference_span,
        max(last_observed_at) as reference_last_observed_at
      from (select (prior.observed_at at time zone 'America/Sao_Paulo')::date as day,
          percentile_cont(0.5) within group(order by prior.price_cents) as day_median,max(prior.observed_at) as last_observed_at
        from garimpa.price_observation prior
        where prior.tenant_id=p.tenant_id and prior.product_id=p.id and prior.option_key=o.option_key and o.option_key<>'listing'
          and prior.offer_evidence->>'currency'='BRL' and prior.offer_evidence->>'priceType'='exact'
          and o.offer_evidence->>'currency'='BRL' and o.offer_evidence->>'priceType'='exact'
          and garimpa.offer_configuration_key(o.offer_evidence) is not null
          and garimpa.offer_configuration_key(prior.offer_evidence)=garimpa.offer_configuration_key(o.offer_evidence)
          and prior.observed_at<o.observed_at and prior.observed_at>=o.observed_at-interval '60 days'
        group by (prior.observed_at at time zone 'America/Sao_Paulo')::date) days
    ) h on true
    where p.tenant_id=${tenantId} and coalesce(c.status,'pending')<>'rejected' and o.price_cents>0
      and o.offer_evidence->>'currency'='BRL' and o.offer_evidence->>'priceType' in ('exact','range','from')
      and o.observed_at<=${now}::timestamptz and o.observed_at>=${now}::timestamptz-case when p.marketplace='shopee' then interval '72 hours' else interval '48 hours' end`;
    const [edition]=await tx<{inputs:Array<{productId:string;entrySnapshot?:CohortEntrySnapshot}>}[]>`
      select inputs from garimpa.recommendation_edition where tenant_id=${tenantId} and channel='home'`;
    return {rows,weights,policyVersion:policy?.version ?? 0,entries:edition?.inputs ?? []};
  });
  const {rows,weights,policyVersion}=state;
  const scoreVersion=scoreWeightsRevision(weights);
  const prepared = rows.map(row => {
    const evidence = row.offer_evidence ?? {};
    const material = editorialEvidenceFingerprint({ title: row.title, productUrl: row.product_url, imageUrl: row.image_url,
      category: row.category, ratingStar: row.rating_star, offerEvidence: evidence });
    const prior = row.assessment_has_material && row.assessment_id && row.material_fingerprint && row.assessment_price && row.assessment_policy && row.assessment_prompt && row.assessment_model
      ? { materialFingerprint: row.material_fingerprint, priceCents: row.assessment_price, policyVersion: row.assessment_policy,
        promptVersion: row.assessment_prompt, model: row.assessment_model } : null;
    const next = { materialFingerprint: sha(material), priceCents: row.price_cents, policyVersion: ATTRIBUTE_POLICY_VERSION,
      promptVersion: ATTRIBUTE_PROMPT_VERSION, model: expectedModel };
    let assessment: AttributeAssessment | null = null;
    if (!assessmentNeedsRefresh(prior, next)) {
      try { assessment = parseAttributeAssessments([row.attributes], [row.product_id])[0] ?? null; } catch { /* Historical malformed output is not an attribute. */ }
    }
    const ratingCount = typeof evidence.reviewCount === "number" && Number.isSafeInteger(evidence.reviewCount) && evidence.reviewCount >= 0
      ? evidence.reviewCount : null;
    const sales = row.sales_count === null ? null : Number(row.sales_count);
    const declared=typeof row.claimed_discount_rate==='number' && Number.isFinite(row.claimed_discount_rate)
      && row.claimed_discount_rate>=0 && row.claimed_discount_rate<=1 ? row.claimed_discount_rate*100 : null;
    const p95=row.category_p95===null ? null : Number(row.category_p95);
    const unusual=declared!==null && p95!==null && Number.isFinite(p95) && declared>p95;
    const categoryReference={week:row.category_week,marketplace:row.marketplace,category:row.category,
      priceBand:row.price_cents<5000 ? 'ate_50' : row.price_cents<20000 ? '50_a_200' : 'acima_200',
      p95:p95!==null && Number.isFinite(p95) ? p95 : null,sampleSize:row.category_sample,minHistoryDays:row.category_days,minHistorySpanDays:row.category_span,
      earliestEvidence:row.category_earliest ? new Date(row.category_earliest).toISOString() : null,
      latestEvidence:row.category_latest ? new Date(row.category_latest).toISOString() : null,
      declaredPercent:declared,unusual,penalty:unusual ? 5 : 0};
    const lastHistoricalAt=row.reference_last_observed_at ? new Date(row.reference_last_observed_at).getTime() : NaN;
    const historicalAgeDays=Number.isFinite(lastHistoricalAt) ? Math.max(0,(now.getTime()-lastHistoricalAt)/86_400_000) : null;
    const candidate: CohortCandidate = { id: `${row.product_id}\0${row.option_key}`, category: row.category, priceCents: row.price_cents,
      observedAt: new Date(row.observed_at).toISOString(), assessment, salesCount: Number.isSafeInteger(sales) ? sales : null,
      ratingStar: row.rating_star, ratingCount, historicalReferenceCents: row.reference_cents,
      historicalConfidence: row.reference_cents === null || historicalAgeDays === null ? 0
        : Math.min(1, row.reference_days / 20) * Math.min(1, row.reference_span / 60) * Math.pow(0.5,historicalAgeDays/30),
      declaredDiscount: row.claimed_discount_rate, storeSignal: null, storeConfidence: 0,penalties:categoryReference.penalty };
    return { row, candidate, categoryReference, historicalAgeDays, assessmentId: assessment ? row.assessment_id : null };
  });
  const revision = sha([scoreVersion,prepared.map(({ row,categoryReference }) => [row.product_id,row.option_key,row.observation_id,row.assessment_id,row.latest_event_id,row.category,categoryReference.week,categoryReference.p95]).sort((a,b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])))]);
  // The projection is refreshed at most hourly for age alone. A stable hour
  // keeps repeated signals within that window from inventing a new score
  // revision and repeatedly reopening the same slot verification request.
  // Admission still checks the precise factual deadline separately.
  const freshnessTime = new Date(Math.floor(now.getTime()/3_600_000)*3_600_000);
  const entries=new Map<string,CohortEntrySnapshot>();
  const entryFingerprints=new Map<string,string>();
  const currentById=new Map(prepared.map(item=>[item.candidate.id,item]));
  for(const input of state.entries) {
    const snapshot=input.entrySnapshot;
    if(snapshot?.candidate?.id && typeof snapshot.calculatedAt==='string') {
      let id:string; try {id=decodeURIComponent(snapshot.candidate.id);} catch {continue;}
      if(!id.startsWith(`${input.productId}\0`)) continue;
      const current=currentById.get(id);
      if(!current) continue;
      // Re-evaluate the entry's declared discount against the same weekly
      // category reference as the current score, without changing its facts.
      const declared=snapshot.candidate.declaredDiscount;
      const p95=current.categoryReference.p95;
      const penalty=typeof declared==='number' && Number.isFinite(declared) && declared>=0 && declared<=1
        && p95!==null && declared*100>p95 ? 5 : 0;
      entries.set(id,{...snapshot,candidate:{...snapshot.candidate,id,penalties:penalty}});
      entryFingerprints.set(id,sha(snapshot));
    }
  }
  const scores = calculateCohortScores(prepared.map(item => item.candidate), freshnessTime,weights,entries);
  const byId = new Map(prepared.map(item => [item.candidate.id, item]));
  const groupMembers=new Map<string,string[]>();
  const ownSignatures=new Map<string,string>();
  const addMember=(group:string,signature:string)=>{const members=groupMembers.get(group) ?? [];members.push(signature);groupMembers.set(group,members);};
  for(const item of prepared) {
    const {row,candidate,categoryReference}=item;
    const signature=sha([row.product_id,row.option_key,row.observation_id,row.assessment_id,row.latest_event_id,
      row.category,categoryReference.week,categoryReference.p95]);
    ownSignatures.set(candidate.id,signature);
    addMember('all',signature);
    if(candidate.category && candidate.category!=='Geral') {
      addMember(`category\0${candidate.category}`,signature);
      const band=candidate.priceCents<5000 ? 'ate_50' : candidate.priceCents<20000 ? '50_a_200' : 'acima_200';
      addMember(`band\0${candidate.category}\0${band}`,signature);
    }
  }
  const groupRevisions=new Map([...groupMembers].map(([group,members])=>[group,sha([scoreVersion,members.sort()])]));
  // XOR of independently hashed members allows the candidate's own changing
  // evidence to be removed without rebuilding an O(n²) list for every score.
  const groupXors=new Map<string,bigint>([...groupMembers].map(([group,members])=>
    [group,members.reduce((value,member)=>value^BigInt(`0x${member}`),0n)] as const));
  const records = scores.map(result => {
    const item = byId.get(result.productId)!;
    const group=result.cohort.fallback==='categoria_faixa' ? `band\0${result.cohort.category}\0${result.cohort.priceBand}`
      : result.cohort.fallback==='categoria' ? `category\0${result.cohort.category}` : 'all';
    const peers=(groupXors.get(group) ?? 0n)^BigInt(`0x${ownSignatures.get(item.candidate.id)!}`);
    const normalizationRevision=sha([scoreVersion,group,(groupMembers.get(group)?.length ?? 1)-1,peers.toString(16).padStart(64,'0')]);
    const sourceRevision=sha([groupRevisions.get(group),result.score.scoreVitrine,result.score.scorePauta,result.score.potentialScore,
      result.entryScore,entryFingerprints.get(result.productId) ?? null]);
    return { product_id: item.row.product_id, option_key: item.row.option_key, observation_id: item.row.observation_id,
      assessment_id: item.assessmentId, latest_assessment_id: item.row.assessment_id, event_id: item.row.latest_event_id, policy_version: scoreVersion,
      source_revision: sourceRevision, cohort: result.cohort, components: { ...result.score.components, normalizationRevision,
        entrySnapshot:{candidate:{...item.candidate,id:encodeURIComponent(item.candidate.id)},calculatedAt:freshnessTime.toISOString()},
        normalizedEntryScore:result.entryScore, normalizedEntryFingerprint:entryFingerprints.get(result.productId) ?? null,
        raw: {...result.raw,categoryReference:item.categoryReference,
        historyCoverage:{days:item.row.reference_days,spanDays:item.row.reference_span,
          lastObservedAt:item.row.reference_last_observed_at ? new Date(item.row.reference_last_observed_at).toISOString() : null,
          ageDays:item.historicalAgeDays}}, penalties: result.score.penalties,
        whatsapp: result.score.whatsapp }, score_vitrine: result.score.scoreVitrine, score_pauta: result.score.scorePauta,
      potential_score: result.score.potentialScore, calculated_at: now.toISOString(), next_recalculation_at: new Date(now.getTime()+3_600_000).toISOString() };
  });
  if (!records.length) return { candidates: 0, written: 0, revision };
  const written = await withMonitoringDb(sql, tenantId, async tx => {
    await tx`select pg_advisory_xact_lock_shared(hashtextextended(${`curation-policy:${tenantId}`},0))`;
    const [lockedPolicy]=await tx<{version:number}[]>`select version from garimpa.curation_policy_v2 where tenant_id=${tenantId}`;
    if((lockedPolicy?.version ?? 0)!==policyVersion) return 0;
    const result = await tx<{product_id:string}[]>`insert into garimpa.curation_score_projection
      (tenant_id,product_id,option_key,observation_id,assessment_id,policy_version,source_revision,cohort,components,
       score_vitrine,score_pauta,potential_score,calculated_at,next_recalculation_at)
      select ${tenantId},x.product_id,x.option_key,x.observation_id,x.assessment_id::uuid,x.policy_version,x.source_revision,x.cohort,x.components,
       x.score_vitrine,x.score_pauta,x.potential_score,x.calculated_at,x.next_recalculation_at
      from jsonb_to_recordset(${tx.json(records as any)}::jsonb) as x(product_id text,option_key text,observation_id text,assessment_id text,latest_assessment_id text,
       event_id text,policy_version text,source_revision text,cohort jsonb,components jsonb,score_vitrine numeric,score_pauta numeric,
       potential_score numeric,calculated_at timestamptz,next_recalculation_at timestamptz)
      where x.observation_id=(select o.id from garimpa.price_observation o where o.tenant_id=${tenantId} and o.product_id=x.product_id
          and o.option_key=x.option_key order by o.observed_at desc,o.id desc limit 1)
        and coalesce((select version from garimpa.curation_policy_v2 where tenant_id=${tenantId}),0)=${policyVersion}
        and x.latest_assessment_id is not distinct from (select a.id::text from garimpa.curation_attribute_assessment a
          join garimpa.price_observation assessed on assessed.tenant_id=a.tenant_id and assessed.product_id=a.product_id and assessed.id=a.observation_id
          where a.tenant_id=${tenantId} and a.product_id=x.product_id and assessed.option_key=x.option_key order by a.created_at desc,a.id desc limit 1)
        and x.event_id is not distinct from (select e.id::text from garimpa.curation_event e where e.tenant_id=${tenantId} and e.product_id=x.product_id order by e.id desc limit 1)
        and not exists(select 1 from garimpa.product_curation c where c.tenant_id=${tenantId} and c.product_id=x.product_id and c.status='rejected')
      on conflict(tenant_id,product_id,option_key) do update set observation_id=excluded.observation_id,assessment_id=excluded.assessment_id,
       policy_version=excluded.policy_version,source_revision=excluded.source_revision,cohort=excluded.cohort,components=excluded.components,
       score_vitrine=excluded.score_vitrine,score_pauta=excluded.score_pauta,potential_score=excluded.potential_score,
       calculated_at=excluded.calculated_at,next_recalculation_at=excluded.next_recalculation_at returning product_id`;
    if(projectionOwner) {
      const [lease]=await tx<{valid:boolean}[]>`select lease_until>clock_timestamp() as valid from garimpa.curation_projection_job
        where tenant_id=${tenantId} and lease_owner=${projectionOwner}::uuid for update`;
      if(!lease?.valid) throw new Error('curation_projection_lease_lost');
    }
    return result.length;
  });
  return { candidates: records.length, written, revision };
}
