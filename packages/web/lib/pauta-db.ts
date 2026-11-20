import { createHash, randomUUID } from "node:crypto";
import type postgres from "postgres";
import { authorizeAccountTransaction, releaseAccountTransaction, currentAccount } from "./account-scope.ts";
import { HOLD_REASONS, REJECTION_REASONS } from "./curation-contract.ts";
import { db } from "./db.ts";
import { candidateRows, latestAssessments, toCandidate, validateSuperiorityClaimsInBatch } from "./editorial-selection-db.ts";
import { editorialEvidenceFingerprint, hasSuperiorityClaim } from "./editorial-selection.ts";
import { getProductPresentations } from "./product-presentation-db.ts";
import { sourceProductPresentation } from "./product-presentation.ts";
import { buildPautaMlTarget, httpsShopUrl, issuePautaLink, type MlPautaConfig } from "./pauta-link.ts";
import { composeLivePauta, PAUTA_PRICE_WINDOW_MS, PAUTA_CATALOG_WINDOW_MS, type PautaCandidate, type PautaChannel, type PautaV2Policy } from "./pauta-policy.ts";
import { RECOMMENDATION_POLICY_VERSION, validateChannelPolicy, type ConfirmedExposure, type ChannelPolicy } from "./recommendation-policy.ts";
import { withAccountDb, type AccountContext } from "./tenant-db.ts";
import { PRODUCT_EVIDENCE_TTL_DAYS } from "./catalog-policy.ts";
import { DEFAULT_SCORE_WEIGHTS, type ScoreWeights } from "./curation-score-v2.ts";
import { scoreWeightsRevision } from "./curation-score-revision.ts";
import {readProcessingProgress} from './operation-processing-db.ts';

type Tx = postgres.TransactionSql;
type ChannelConfig = {
  enabled: boolean;
  policy: unknown;
  policy_version: string;
  version: number;
  manual_order: string[] | null;
  valid_until: Date | null;
};
type LinkFacts = {
  id: string;
  external_id: string;
  slug: string | null;
  publication_status: string | null;
  affiliate_url: string | null;
  triage_score: number | null;
  public_benefit: string | null;
  amazon_tag_active: boolean;
};
function shareTarget(tenantId: string, candidate: Pick<PautaCandidate,"id"|"marketplace"|"productUrl"|"offerOptionKey">, facts: LinkFacts, ml: MlPautaConfig | undefined): PautaCandidate["shareTarget"] {
  if (facts.publication_status && facts.publication_status !== "active") return null;
  if (candidate.marketplace === "amazon") {
    return facts.slug && facts.publication_status === "active" && facts.amazon_tag_active
      ? { kind: "site", slug: facts.slug } : null;
  }
  if (candidate.marketplace !== "mercadolivre") {
    const hosts = candidate.marketplace === "shopee" ? ["shopee.com.br", "shopee.ee"] : ["s.click.aliexpress.com"];
    return facts.slug && httpsShopUrl(facts.affiliate_url, hosts) ? { kind: "site", slug: facts.slug } : null;
  }
  if (!ml || !httpsShopUrl(candidate.productUrl, ["mercadolivre.com.br"])) return null;
  if (facts.slug) return { kind: "site", slug: facts.slug };
  // Keep the option page and the existing publication rules for confirmed options.
  if (candidate.offerOptionKey || !buildPautaMlTarget(candidate.productUrl, facts.external_id, ml)) return null;
  const token = issuePautaLink(tenantId, candidate.id);
  return token ? { kind: "pauta", token } : null;
}

async function pautaLinkFacts(tx:Tx,tenantId:string,affiliateId:string,ids:string[]){
  const [ml] = await tx<MlPautaConfig[]>`select c.tracking_id,c.tool_id
    from garimpa.affiliate_marketplace_config c
    join garimpa.affiliate_account a on a.id=c.affiliate_id and a.status='active'
    where a.tenant_id=${tenantId} and c.affiliate_id=${affiliateId}
      and c.marketplace='mercadolivre' and c.status='active'
      and nullif(c.tracking_id,'') is not null and nullif(c.tool_id,'') is not null`;
  const links = await tx<LinkFacts[]>`select p.id,p.external_id,pub.slug,pub.status as publication_status,pub.affiliate_url,
      (p.marketplace='amazon' and exists(select 1 from garimpa.affiliate_marketplace_config cfg
        where cfg.affiliate_id=pub.affiliate_id and cfg.marketplace='amazon' and cfg.status='active'
          and btrim(cfg.tracking_id) ~ '^[A-Za-z0-9_-]{1,80}$')) as amazon_tag_active,
      case when jsonb_typeof(event.score)='number' then (event.score #>> '{}')::float8 end as triage_score,
      event.public_benefit
    from garimpa.product p
    left join garimpa.publication pub on pub.product_id=p.id and pub.tenant_id=p.tenant_id
      and pub.affiliate_id=${affiliateId} and pub.channel='web'
    left join lateral (
      select e.metadata->'automation'->'aiScore' as score,
        coalesce(
          nullif(btrim(e.metadata#>>'{automation,publicBenefit}'),''),
          nullif(btrim(e.metadata#>>'{automation,aiJustification}'),'')
        ) as public_benefit
      from garimpa.curation_event e
      where e.tenant_id=p.tenant_id and e.product_id=p.id order by e.id desc limit 1
    ) event on true
    where p.tenant_id=${tenantId} and p.id=any(${ids})`;
  const linkFacts = new Map(links.map(facts => [facts.id, facts]));
  return {ml,linkFacts};
}

async function selectOffers(tx: Tx, context: AccountContext, channel: PautaChannel, now: Date, productIds?: string[]): Promise<PautaSelection> {
  const { tenantId, affiliateId } = context;
  const [channelTable] = await tx<{ ready: boolean }[]>`select to_regclass('garimpa.recommendation_channel') is not null as ready`;
  if (!channelTable?.ready) {
    return { config: null, selected: [], reasonsById: new Map<string, string[]>() };
  }
  const [config] = await tx<ChannelConfig[]>`select * from garimpa.recommendation_channel
    where tenant_id=${tenantId} and channel=${channel}`;
  if (!config?.enabled || config.valid_until && +config.valid_until <= +now) {
    return { config: null, selected: [], reasonsById: new Map<string, string[]>() };
  }
  const rawPolicy = validateChannelPolicy(config.policy);
  if (!rawPolicy || config.policy_version !== RECOMMENDATION_POLICY_VERSION) throw new Error("invalid_pauta_policy");
  const policy: ChannelPolicy = {
    ...rawPolicy,
    limit: channel === "whatsapp" ? Math.max(rawPolicy.limit, 30) : Math.max(rawPolicy.limit, 16),
    familyLimit: channel === "whatsapp" ? Math.max(rawPolicy.familyLimit, 2) : rawPolicy.familyLimit,
  };

  const rows = await candidateRows(tx, tenantId, productIds, false, new Date(+now - PAUTA_CATALOG_WINDOW_MS), true);
  const ids = rows.map(row => row.id);
  if (!ids.length) return { config, selected: [], reasonsById: new Map<string, string[]>() };
  const assessments = await latestAssessments(tx, tenantId);
  const {ml,linkFacts}=await pautaLinkFacts(tx,tenantId,affiliateId,ids);
  const watcherRows = await tx<{ product_id: string; cnt: number }[]>`
    select product_id, count(*)::int as cnt from (
      select product_id from garimpa.price_watch where product_id = any(${ids})
      union all
      select product_id from garimpa.favorite where product_id = any(${ids})
    ) w group by product_id
  `;
  const watchersById = new Map(watcherRows.map(r => [r.product_id, Number(r.cnt) || 0]));
  const candidates: PautaCandidate[] = rows.map(row => {
    const facts = linkFacts.get(row.id);
    const score = facts?.triage_score;
    const candidate: PautaCandidate = {
      ...toCandidate(row, assessments.get(row.id) ?? null, now),
      triageScore: typeof score === "number" && score >= 1 && score <= 5 ? score : null,
      aiBenefit: facts?.public_benefit ?? undefined,
      shareTarget: null,
      watchersCount: watchersById.get(row.id) ?? 0,
    };
    // An assessment from a different price/condition is not portable to a
    // new browser observation. Keep the catalogue approval, drop the old copy.
    const source = (candidate.offerEvidence as { source?: { method?: string } } | null)?.source;
    if ((candidate.marketplace === "aliexpress" || candidate.marketplace === "amazon") && source?.method === "browser"
      && candidate.assessment && candidate.assessment.evidenceFingerprint !== candidate.evidenceFingerprint
      && candidate.assessment.presentation?.status !== "withdrawn") candidate.assessment = null;
    candidate.shareTarget = facts ? shareTarget(tenantId, candidate, facts, ml) : null;
    return candidate;
  });
  const [v2Schema] = await tx<{ policy_ready: boolean; equivalence_ready: boolean; slots_ready: boolean }[]>`
    select to_regclass('garimpa.curation_policy_v2') is not null as policy_ready,
      to_regclass('garimpa.curation_equivalence_member') is not null as equivalence_ready,
      to_regclass('garimpa.pauta_slot_config') is not null as slots_ready`;
  const [v2] = v2Schema?.policy_ready ? await tx<{ enabled: boolean; factual_gate_required:boolean; version:number;config:{scoreWeights?:ScoreWeights} }[]>`
    select enabled,factual_gate_required,version,config from garimpa.curation_policy_v2 where tenant_id=${tenantId}` : [];
  let pautaV2:PautaV2Policy|undefined;
  if (v2?.enabled) {
    const expectedScoreVersion=scoreWeightsRevision(v2.config.scoreWeights ?? DEFAULT_SCORE_WEIGHTS);
    const [v2Config]=v2Schema?.slots_ready ? await tx<Array<{version:number;repeat_hours:number;impulse_limit_cents:number|null;allow_price_improvement:boolean;
      improvement_percent:number;dom_window_hours:number}>>`select version,repeat_hours,impulse_limit_cents,allow_price_improvement,
        improvement_percent,dom_window_hours from garimpa.pauta_slot_config where tenant_id=${tenantId} and channel=${channel}` : [];
    const recentCategories=await tx<{category:string;count:number}[]>`select coalesce(nullif(product->>'category',''),p.category,'sem_categoria') as category,count(*)::int as count
      from garimpa.recommendation_exposure e join garimpa.product p on p.tenant_id=e.tenant_id and p.id=e.product_id
      left join garimpa.recommendation_edition_archive archive on archive.tenant_id=e.tenant_id and archive.channel=e.channel and archive.id=e.edition_id
      left join lateral(select value as product from jsonb_array_elements(coalesce(archive.selection->'products','[]'::jsonb))
        where value->>'id'=e.product_id limit 1) actual on true
      where e.tenant_id=${tenantId} and e.channel=${channel} and e.confirmed_at>=${new Date(+now - 240*3_600_000)}
      group by 1`;
    pautaV2={repeatHours:v2Config?.repeat_hours ?? 240,impulseLimitCents:v2Config ? v2Config.impulse_limit_cents : 20000,
      allowPriceImprovement:v2Config?.allow_price_improvement ?? false,improvementPercent:v2Config?.improvement_percent ?? 5,
      categoryExposureCounts:new Map(recentCategories.map(row=>[row.category,row.count]))};
    const observationIds = candidates.flatMap(candidate => candidate.evidenceObservationId ? [candidate.evidenceObservationId] : []);
    const deadlines = observationIds.length ? await tx<{ id: string; deadline: Date | null;score:string|null;score_version:string|null;
      assessment_material:string|null;assessment_price:number|null }[]>`
      select o.id, case when factual.deadline is null then null
        when p.marketplace='shopee' then factual.deadline
        else least(factual.deadline, v.verified_at + make_interval(hours=>${v2Config?.dom_window_hours ?? 12})) end as deadline,
        case when a.last_curation_event_id is not distinct from (select event.id::text from garimpa.curation_event event
          where event.tenant_id=p.tenant_id and event.product_id=p.id order by event.id desc limit 1)
          and not (coalesce(a.attributes->'flags','[]'::jsonb) ?| array['unsafe','restricted','misleading_claim','ambiguous_configuration','insufficient_evidence'])
          then score.score_pauta::text end as score,score.policy_version as score_version,a.material_fingerprint as assessment_material,a.price_cents as assessment_price
      from garimpa.price_observation o join garimpa.product p on p.tenant_id=o.tenant_id and p.id=o.product_id
      left join garimpa.offer_verification v on v.tenant_id=o.tenant_id and v.product_id=o.product_id
        and v.observation_id=o.id and v.option_key=o.option_key and v.price_type=o.offer_evidence->>'priceType'
      left join garimpa.curation_score_projection score on score.tenant_id=o.tenant_id and score.product_id=o.product_id
        and score.option_key=o.option_key and score.observation_id=o.id
      left join garimpa.curation_attribute_assessment a on a.tenant_id=score.tenant_id and a.product_id=score.product_id and a.id=score.assessment_id
      cross join lateral (select garimpa.current_offer_valid_until(o.tenant_id,o.product_id,o.id) as deadline) factual
      where o.tenant_id=${tenantId} and o.id=any(${observationIds})` : [];
    const byObservation = new Map(deadlines.map(row => [row.id,row]));
    for (const candidate of candidates) {
      const fact=candidate.evidenceObservationId ? byObservation.get(candidate.evidenceObservationId) : undefined;
      candidate.factualValidUntil=fact?.deadline?.toISOString() ?? null;
      candidate.pautaPolicyVersion=v2Config?.version ?? null;
      candidate.curationPolicyVersion=v2.version;
      const material=createHash('sha256').update(JSON.stringify(editorialEvidenceFingerprint({title:candidate.title,productUrl:candidate.productUrl,
        imageUrl:candidate.imageUrl,category:candidate.category,ratingStar:candidate.ratingStar,offerEvidence:candidate.offerEvidence}))).digest('hex');
      const currentAssessment=fact?.assessment_material===material && typeof fact.assessment_price==='number' && fact.assessment_price>0
        && Math.abs(candidate.priceCents-fact.assessment_price)/fact.assessment_price<0.1;
      candidate.pautaScore=currentAssessment && fact?.score_version===expectedScoreVersion && fact?.score!==null && fact?.score!==undefined && Number.isFinite(Number(fact.score)) ? Number(fact.score) : null;
    }
  } else if (v2?.factual_gate_required) {
    // A return to the legacy ranking does not make a stale offer current.
    const observationIds=candidates.flatMap(candidate=>candidate.evidenceObservationId ? [candidate.evidenceObservationId] : []);
    const facts=observationIds.length ? await tx<{id:string;deadline:Date|null}[]>`
      select o.id,garimpa.current_offer_valid_until(o.tenant_id,o.product_id,o.id) as deadline
      from garimpa.price_observation o where o.tenant_id=${tenantId} and o.id=any(${observationIds})` : [];
    const deadlines=new Map(facts.map(fact=>[fact.id,fact.deadline]));
    for(const candidate of candidates) {
      const deadline=candidate.evidenceObservationId ? deadlines.get(candidate.evidenceObservationId) : null;
      candidate.factualValidUntil=deadline ? new Date(deadline).toISOString() : null;
    }
  }
  const claimAssessments = candidates.flatMap(c =>
    c.assessment && hasSuperiorityClaim(c.assessment.publicRationale) ? [c.assessment] : []);
  const claims = await validateSuperiorityClaimsInBatch(tx, tenantId, claimAssessments, now);
  const invalidClaims = new Set(claimAssessments.filter(a => claims.get(a.id) !== true).map(a => a.productId));
  const exposureTargets=candidates.map(candidate=>({id:candidate.id,option_key:candidate.offerOptionKey ?? 'listing'}));
  if (v2Schema?.equivalence_ready) {
    const equivalents=await tx<{id:string;group_id:string}[]>`select target.id,g.id::text as group_id
      from jsonb_to_recordset(${tx.json(exposureTargets)}::jsonb) target(id text,option_key text)
      join garimpa.curation_equivalence_member member on member.tenant_id=${tenantId} and member.product_id=target.id
        and member.option_key=target.option_key and member.active
      join garimpa.curation_equivalence_group g on g.tenant_id=member.tenant_id and g.id=member.group_id and g.revoked_at is null`;
    const equivalenceById=new Map(equivalents.map(row=>[row.id,row.group_id]));
    for(const candidate of candidates) candidate.equivalenceKey=equivalenceById.get(candidate.id) ?? null;
    const vetoes=await tx<{id:string}[]>`select distinct target.id
      from jsonb_to_recordset(${tx.json(exposureTargets)}::jsonb) target(id text,option_key text)
      join garimpa.curation_equivalence_member member on member.tenant_id=${tenantId} and member.product_id=target.id
        and member.option_key=target.option_key and member.active
      join garimpa.curation_equivalence_group g on g.tenant_id=member.tenant_id and g.id=member.group_id and g.revoked_at is null
      join garimpa.curation_equivalence_member other on other.tenant_id=g.tenant_id and other.group_id=g.id and other.active
      join garimpa.product_curation c on c.tenant_id=other.tenant_id and c.product_id=other.product_id and c.status='rejected'
      join lateral (select e.to_status from garimpa.curation_event e where e.tenant_id=other.tenant_id and e.product_id=other.product_id
        and e.actor_type='human' order by e.id desc limit 1) decision on decision.to_status='rejected'`;
    const vetoIds=new Set(vetoes.map(row=>row.id));
    for(const candidate of candidates) candidate.equivalentHumanVeto=vetoIds.has(candidate.id);
  }
  const exposureRows = v2Schema?.equivalence_ready ? await tx<(Omit<ConfirmedExposure, "confirmedAt"> & { targetId:string;confirmedAt: Date;priceType:string|null })[]>`
    select distinct on (target.id) target.id as "targetId",e.product_id as "productId",e.option_key as "optionKey",
      e.price_cents as "priceCents",e.confirmed_at as "confirmedAt",entry.value->>'priceType' as "priceType"
    from jsonb_to_recordset(${tx.json(exposureTargets)}::jsonb) target(id text,option_key text)
    left join garimpa.curation_equivalence_member target_member on target_member.tenant_id=${tenantId}
      and target_member.product_id=target.id and target_member.option_key=target.option_key and target_member.active
    left join garimpa.curation_equivalence_group equivalence on equivalence.tenant_id=target_member.tenant_id
      and equivalence.id=target_member.group_id and equivalence.revoked_at is null
    join garimpa.recommendation_exposure e on e.tenant_id=${tenantId} and e.channel=${channel}
      and (e.product_id=target.id or exists(select 1 from garimpa.curation_equivalence_member exposed_member
        where equivalence.id is not null and exposed_member.tenant_id=${tenantId} and exposed_member.group_id=equivalence.id
          and exposed_member.product_id=e.product_id and exposed_member.option_key=e.option_key and exposed_member.active))
    left join garimpa.recommendation_edition_archive archive on archive.tenant_id=e.tenant_id and archive.channel=e.channel and archive.id=e.edition_id
    left join lateral(select value from jsonb_array_elements(coalesce(archive.selection->'products','[]'::jsonb))
      where value->>'id'=e.product_id limit 1) entry on true
    where e.confirmed_at>=${new Date(+now - (pautaV2?.repeatHours ?? policy.repeatHours) * 3_600_000)}
    order by target.id,e.confirmed_at desc,e.id desc` : await tx<(Omit<ConfirmedExposure, "confirmedAt"> & { targetId:string;confirmedAt: Date;priceType:string|null })[]>`
    select distinct on (e.product_id) e.product_id as "targetId",e.product_id as "productId",e.option_key as "optionKey",
      e.price_cents as "priceCents",e.confirmed_at as "confirmedAt",entry.value->>'priceType' as "priceType"
    from garimpa.recommendation_exposure e
    left join garimpa.recommendation_edition_archive archive on archive.tenant_id=e.tenant_id and archive.channel=e.channel and archive.id=e.edition_id
    left join lateral(select value from jsonb_array_elements(coalesce(archive.selection->'products','[]'::jsonb))
      where value->>'id'=e.product_id limit 1) entry on true
    where e.tenant_id=${tenantId} and e.channel=${channel} and e.product_id=any(${ids})
      and e.confirmed_at>=${new Date(+now - (pautaV2?.repeatHours ?? policy.repeatHours) * 3_600_000)}
    order by e.product_id,e.confirmed_at desc,e.id desc`;
  const exposures = new Map(exposureRows.map(row => [row.targetId, { ...row, confirmedAt: row.confirmedAt.toISOString() }]));
  return { config, ...composeLivePauta(candidates, policy, exposures, now, config.manual_order, invalidClaims, pautaV2, { allowCatalogWindow: true }) };
}

type CaptureRow = {
  id: string;
  title: string;
  marketplace: string;
  price_cents: number;
  price_type: string | null;
  currency: string | null;
  observed_at: Date;
  stage: Exclude<PautaCapture["status"], "ready" | "blocked"> | "approved";
  reason_code: string | null;
  reason_detail: string | null;
  ai_justification: string | null;
  total: number;
  review_total: number;
  triage_total: number;
  retry_total: number;
};

export type PautaCaptureActions = { review: number; triage: number; retry: number };

export type PautaCapture = {
  id: string;
  title: string;
  marketplace: string;
  priceCents: number;
  priceType: string | null;
  currency: string | null;
  capturedAt: string;
  status: "ready" | "pending" | "review" | "retry" | "processing" | "deferred" | "rejected" | "held" | "blocked" | "failed";
  reasons: string[];
};

const curationReasons = new Map<string, string>([...REJECTION_REASONS, ...HOLD_REASONS]);

function captureStatus(row: CaptureRow, selection: Awaited<ReturnType<typeof selectOffers>>): Pick<PautaCapture, "status" | "reasons"> {
  if (selection.selected.some(p => p.id === row.id)) return { status: "ready", reasons: ["Pronta neste canal."] };
  const reviewReason = row.reason_detail || curationReasons.get(row.reason_code ?? "");
  switch (row.stage) {
    case "approved": return { status: "blocked", reasons: selection.reasonsById.get(row.id) ??
      [selection.config ? "Falta uma observação válida para divulgação." : "Este canal está desativado ou venceu."] };
    case "review": return { status: "review", reasons: [row.ai_justification || "A Curadoria precisa decidir se a oferta entra no catálogo."] };
    case "retry": return { status: "retry", reasons: ["Retida pelo antigo piso de R$ 20. A triagem geral pode reavaliar a oferta."] };
    case "processing": return { status: "processing", reasons: ["O lote de captura ainda está em andamento."] };
    case "deferred": return { status: "deferred", reasons: ["A revisão foi adiada na Curadoria."] };
    case "rejected": return { status: "rejected", reasons: [reviewReason || "A oferta foi rejeitada na curadoria."] };
    case "held": return { status: "held", reasons: [reviewReason || "Em espera na curadoria."] };
    case "failed": return { status: "failed", reasons: ["A captura foi salva. Execute a triagem geral para avaliar a oferta."] };
    case "pending": return { status: "pending", reasons: ["A captura foi salva e pode ser avaliada na triagem geral."] };
  }
}

async function recentCaptures(tx: Tx, tenantId: string, now: Date, marketplace: string | null) {
  return tx<CaptureRow[]>`with latest as materialized (
      select distinct on (o.product_id) o.product_id,o.price_cents,o.observed_at,o.capture_run_id,
        o.offer_evidence->>'priceType' as price_type,coalesce(o.offer_evidence->>'currency', 'BRL') as currency
      from garimpa.price_observation o
      join garimpa.product listing on listing.id=o.product_id and listing.tenant_id=o.tenant_id
      where o.tenant_id=${tenantId} and o.observed_at>=${new Date(+now - PAUTA_PRICE_WINDOW_MS)}
        and o.observed_at<=${new Date(+now + 60_000)}
      order by o.product_id,case when listing.marketplace='aliexpress' and o.capture_source='extension'
        and o.offer_evidence#>>'{source,method}'='browser' then 0 else 1 end,o.observed_at desc,o.id desc
    ), classified as (
      select p.id,p.title,p.marketplace,p.family_key,p.category,o.price_cents,o.price_type,o.currency,o.observed_at,
        c.reason_code,c.reason_detail,
        case when event.actor_type='llm' and event.to_status='pending'
          then nullif(event.metadata#>>'{automation,aiJustification}','') end as ai_justification,
        case
          when c.status in ('approved','rejected') then c.status
          when c.deferred_until>${now} then 'deferred'
          when c.status='held' and event.actor_type='rule' and event.to_status='held'
            and c.reason_code=event.reason_code and c.reason_code in ('insufficient_evidence','weak_offer')
            and event.metadata#>>'{automation,pricePolicy,version}'='triage-value-v1'
            and event.metadata#>>'{automation,pricePolicy,outcome}' in ('unverified_value','low_value')
            and o.price_cents>0 and p.last_seen_at>=${new Date(+now - PRODUCT_EVIDENCE_TTL_DAYS * 86_400_000)} then 'retry'
          when c.status='held' then 'held'
          when c.status is distinct from 'pending' or exists (
            select 1 from garimpa.curation_event decision where decision.tenant_id=p.tenant_id and decision.product_id=p.id
              and (decision.actor_type='llm' or (decision.actor_type='rule' and decision.to_status in ('rejected','held')))
          ) then 'review'
          when b.status='running' and (b.metadata#>>'{execution,deadline}')::timestamptz>${now} then 'processing'
          when (b.status in ('error','partial') and b.metadata#>'{execution,triage}' is null)
            or (b.status='running' and (b.metadata#>>'{execution,deadline}')::timestamptz<=${now}) then 'failed'
          else 'pending'
        end as stage
      from latest o join garimpa.product p on p.tenant_id=${tenantId} and p.id=o.product_id
      left join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id
      left join lateral (
        select e.actor_type,e.to_status,e.reason_code,e.metadata
        from garimpa.curation_event e where e.tenant_id=p.tenant_id and e.product_id=p.id
        order by e.id desc limit 1
      ) event on true
      left join garimpa.capture_run r on r.tenant_id=p.tenant_id and r.id=o.capture_run_id
      left join garimpa.capture_batch b on b.tenant_id=r.tenant_id
        and b.id::text=r.parameters->>'operationBatchId'
      where (${marketplace}::text is null or p.marketplace=${marketplace})
    )
    select classified.*,count(*) over ()::int as total,
      count(*) filter (where stage='review') over ()::int as review_total,
      count(*) filter (where stage in ('pending','failed')) over ()::int as triage_total,
      count(*) filter (where stage='retry') over ()::int as retry_total
    from classified
    order by date_trunc('hour', observed_at) desc,
      row_number() over (
        partition by date_trunc('hour', observed_at), coalesce(family_key, category, marketplace)
        order by observed_at desc, id
      ),
      observed_at desc, id
    limit 200`;
}

function offerConfirmationId(tenantId: string, affiliateId: string, channel: PautaChannel, version: number,
  candidate: PautaCandidate, displayed: unknown, validUntil: string) {
  const key = createHash("sha256").update(JSON.stringify([
    tenantId, affiliateId, channel, version, candidate.id, candidate.evidenceObservationId, candidate.evidenceFingerprint,
    candidate.assessment?.id, candidate.offerOptionKey, candidate.priceCents, candidate.shareTarget,
    candidate, displayed, validUntil,
  ])).digest("hex");
  return `${key.slice(0, 8)}-${key.slice(8, 12)}-${key.slice(12, 16)}-${key.slice(16, 20)}-${key.slice(20, 32)}`;
}

async function readSnapshot<T>(context: AccountContext, read: (tx: Tx, now: Date) => Promise<T>, sqlFactory: typeof db) {
  const sql = sqlFactory();
  try {
    return await sql.begin("isolation level repeatable read read only", async tx => {
      try {
        await authorizeAccountTransaction(tx, context);
        const [{ now }] = await tx<{ now: Date }[]>`select now()`;
        return await read(tx, now);
      } finally { releaseAccountTransaction(tx); }
    }) as T;
  } finally { await sql.end(); }
}

export async function previewLivePauta(context: AccountContext, channel: PautaChannel, sqlFactory: typeof db = db) {
  return readSnapshot(context, async (tx, now) => {
    const { selected, reasonsById } = await selectOffers(tx, context, channel, now);
    return {
      channel, count: selected.length,
      products: selected.map(({ id, title }) => ({ id, title })),
      excluded: Array.from(reasonsById, ([productId, reasons]) => ({ productId, reasons })),
    };
  }, sqlFactory);
}

/** An operational detail is a read-only snapshot, independent of commercial rollout.
 * Reuse the channel selectors for reasons; never mint links or prepare an edition here. */
export async function readOperationalOffer(context: AccountContext, productId: string, sqlFactory: typeof db = db) {
  if (currentAccount() && currentAccount()!.tenantId !== context.tenantId) throw new Error("forbidden_account_scope");
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(productId)) return null;
  const facts=await readSnapshot(context, async (tx, now) => {
    const [row] = await candidateRows(tx, context.tenantId, [productId], true);
    if (!row) return null;
    const candidate = toCandidate(row, null, now);
    const [connection] = await tx<{ configured: boolean }[]>`select exists(
      select 1 from garimpa.affiliate_marketplace_config c
      join garimpa.affiliate_account account on account.id=c.affiliate_id
      where account.tenant_id=${context.tenantId} and c.affiliate_id=${context.affiliateId}
        and c.marketplace=${candidate.marketplace} and c.status='active'
    ) as configured`;
    return {candidate,configured:connection?.configured===true,consultedAt:now.toISOString()};
  }, sqlFactory);
  if(!facts)return null;
  const [processing,whatsapp,stories]=await Promise.allSettled([readProcessingProgress(context,[productId],sqlFactory),
    readPautaProgress(context,'whatsapp',[productId],sqlFactory),readPautaProgress(context,'stories',[productId],sqlFactory)]);
  const e=processing.status==='fulfilled'?processing.value.evaluation:null;
  const channels=([whatsapp,stories] as const).map((result,index)=>{
    const channel=index===0?'whatsapp' as const:'stories' as const;
    if(result.status!=='fulfilled'||!result.value)return {channel,active:null,selected:null,reasons:['Consulta deste canal indisponível.']};
    const product=result.value.products?.find(p=>p.id===productId);
    return {channel,active:result.value.active,selected:product?.selected??false,reasons:product?.reasons??['Produto fora da seleção atual deste canal.']};
  });
  return {...facts,channels,processingAvailable:processing.status==='fulfilled',uncertain:e?.uncertain??null,evaluationQueued:e?e.queued>0:null,evaluationRunning:e?e.running>0:null};
}

function pautaOfferValidUntil(candidate: PautaCandidate, config: ChannelConfig | null) {
  const comparisonAt = candidate.assessment && hasSuperiorityClaim(candidate.assessment.publicRationale)
    ? Date.parse(candidate.assessment.comparativeBasis?.checkedAt ?? "") : NaN;
  const promoEnds = candidate.promotionEndsAt ? Date.parse(candidate.promotionEndsAt) : NaN;
  return new Date(Math.min(
    new Date(candidate.evidenceObservedAt!).getTime() + PAUTA_CATALOG_WINDOW_MS,
    Date.parse(candidate.lastSeenAt) + 7 * 86_400_000,
    config?.valid_until ? +config.valid_until : Infinity,
    Number.isFinite(comparisonAt) ? comparisonAt + PAUTA_PRICE_WINDOW_MS : Infinity,
    candidate.factualValidUntil ? Date.parse(candidate.factualValidUntil) : Infinity,
    Number.isFinite(promoEnds) ? promoEnds : Infinity,
  )).toISOString();
}

// Bump when the selection contract changes. Time alone does not reshuffle an
// edition; copied preparations preserve their original facts for confirmation.
const PAUTA_CACHE_FORMAT = 5;
type PautaSelection = { config: ChannelConfig | null; selected: PautaCandidate[]; reasonsById: Map<string, string[]> };
type CachedPauta = { active: boolean; count: number; revision: string; viewRevision: string; preparedAt: Date };

async function cachedPauta(tx: Tx, context: AccountContext, channel: PautaChannel): Promise<CachedPauta> {
  const read = async () => {
    const [cached] = await tx<CachedPauta[]>`select
      c.active and (c.config_valid_until is null or c.config_valid_until>statement_timestamp()) as active,
      case when c.config_valid_until is null or c.config_valid_until>statement_timestamp() then (select count(*)::int from unnest(c.offer_valid_until) deadline where deadline>statement_timestamp()) else 0 end as count,
      c.source_revision::text as revision,v.view_revision::text as "viewRevision",c.prepared_at as "preparedAt"
      from garimpa.pauta_selection_cache c join garimpa.pauta_source_version v
        on v.tenant_id=c.tenant_id and v.channel=c.channel and v.revision=c.source_revision
      where c.tenant_id=${context.tenantId} and c.affiliate_id=${context.affiliateId}
        and c.channel=${channel} and c.format_version=${PAUTA_CACHE_FORMAT} for share of c`;
    return cached;
  };
  const cached = await read();
  if (cached) return cached;
  // Writers must advance this row before committing. Hold it only during the
  // DB-only composition, so mixed facts and stale publication cannot escape.
  await tx`insert into garimpa.pauta_source_version(tenant_id,channel)
    values(${context.tenantId},${channel}) on conflict do nothing`;
  const [version] = await tx<{ revision: string; viewRevision: string }[]>`select revision::text as revision,view_revision::text as "viewRevision"
    from garimpa.pauta_source_version where tenant_id=${context.tenantId} and channel=${channel} for update`;
  const winner = await read();
  if (winner) return winner;
  const [{ now }] = await tx<{ now: Date }[]>`select statement_timestamp() as now`;
  const selection = await selectOffers(tx, context, channel, now);
  const deadlines = selection.selected.map(candidate => pautaOfferValidUntil(candidate, selection.config));
  await tx`insert into garimpa.pauta_selection_cache(tenant_id,affiliate_id,channel,source_revision,format_version,
      active,offer_count,config_valid_until,offer_valid_until,selection,prepared_at)
    values(${context.tenantId},${context.affiliateId},${channel},${version.revision},${PAUTA_CACHE_FORMAT},
      ${selection.config !== null},${selection.selected.length},${selection.config?.valid_until ?? null},${deadlines},
      ${tx.json(JSON.parse(JSON.stringify({ ...selection, reasonsById: Array.from(selection.reasonsById) })))},${now})
    on conflict(tenant_id,affiliate_id,channel) do update set
      source_revision=excluded.source_revision,format_version=excluded.format_version,active=excluded.active,
      offer_count=excluded.offer_count,config_valid_until=excluded.config_valid_until,offer_valid_until=excluded.offer_valid_until,
      selection=excluded.selection,prepared_at=excluded.prepared_at`;
  return { active: selection.config !== null, count: selection.selected.length, revision: version.revision, viewRevision: version.viewRevision, preparedAt: now };
}

async function cachedSelection(tx: Tx, context: AccountContext, channel: PautaChannel) {
  const state = await cachedPauta(tx, context, channel);
  const [row] = await tx<{ selection: Omit<PautaSelection, "reasonsById"> & { reasonsById: Array<[string, string[]]> } }[]>`
    select selection from garimpa.pauta_selection_cache where tenant_id=${context.tenantId}
      and affiliate_id=${context.affiliateId} and channel=${channel} and source_revision=${state.revision}`;
  const selection: PautaSelection = {
    ...row.selection,
    config: state.active && row.selection.config ? { ...row.selection.config,
      valid_until: row.selection.config.valid_until ? new Date(row.selection.config.valid_until) : null } : null,
    selected: state.active ? row.selection.selected.map(candidate => ({ ...candidate,
      shareTarget: candidate.shareTarget?.kind === "pauta"
        ? { kind: "pauta" as const, token: issuePautaLink(context.tenantId, candidate.id)! } : candidate.shareTarget,
    })) : [],
    reasonsById: new Map(row.selection.reasonsById),
  };
  return { selection, state };
}

const pautaRevision = (state: CachedPauta) => `${PAUTA_CACHE_FORMAT}:${state.revision}:${state.viewRevision}:${state.active}:${state.count}`;

export async function readPautaVersion(context: AccountContext, channel: PautaChannel, sqlFactory: typeof db = db) {
  return withAccountDb(context, async tx => {
    const [schema] = await tx<{ ready: boolean }[]>`select to_regclass('garimpa.pauta_selection_cache') is not null
      and to_regclass('garimpa.pauta_source_version') is not null as ready`;
    if (!schema?.ready) return null;
    return pautaRevision(await cachedPauta(tx, context, channel));
  }, sqlFactory);
}

export async function readPautaAvailability(context: AccountContext, channel: PautaChannel, sqlFactory: typeof db = db) {
  return withAccountDb(context, async tx => {
    const [schema] = await tx<{ ready: boolean }[]>`select to_regclass('garimpa.pauta_selection_cache') is not null
      and to_regclass('garimpa.pauta_source_version') is not null as ready`;
    if (!schema?.ready) return { active: false, count: 0 };
    const { active, count } = await cachedPauta(tx, context, channel);
    return { active, count };
  }, sqlFactory);
}

/** Status visits never rebuild a cache or prepare an edition. Explicit product
 * diagnosis reuses the existing read-only selector, as the operational detail does. */
export async function readPautaProgress(context:AccountContext,channel:PautaChannel,ids?:string[],factory:typeof db=db):Promise<{
  active:boolean;count:number;byStore?:Record<string,number>;products?:Array<{id:string;title:string;selected:boolean;reasons:string[]}>;
}|null> {
  if(currentAccount() && currentAccount()!.tenantId!==context.tenantId) throw new Error('forbidden_account_scope');
  return readSnapshot(context,async(tx,now)=>{
    if(ids){
      const selection=await selectOffers(tx,context,channel,now);
      const titles=await tx<{id:string;title:string}[]>`select id,title from garimpa.product where tenant_id=${context.tenantId} and id=any(${ids}::text[])`;
      const products=titles.map(({id,title})=>({id,title,selected:selection.selected.some(p=>p.id===id),reasons:selection.reasonsById.get(id)
        ?? (selection.selected.some(p=>p.id===id)?[]:[selection.config?'Não está na seleção atual deste canal.':'Canal inativo.'])}));
      return {active:selection.config!==null,count:selection.selected.filter(p=>ids.includes(p.id)).length,products};
    }
    const [ready]=await tx<{ready:boolean}[]>`select to_regclass('garimpa.pauta_selection_cache') is not null
      and to_regclass('garimpa.pauta_source_version') is not null as ready`;
    if(!ready?.ready)return null;
    const [row]=await tx<{active:boolean;count:number;by_store:Record<string,number>}[]>`select c.active and (c.config_valid_until is null or c.config_valid_until>${now}) as active,
      case when c.config_valid_until is null or c.config_valid_until>${now}
        then (select count(*)::int from unnest(c.offer_valid_until) deadline where deadline>${now}) else 0 end as count,
      coalesce((select jsonb_object_agg(store,n) from (
        select item.value->>'marketplace' as store,count(*)::int as n
        from jsonb_array_elements(coalesce(c.selection->'selected','[]'::jsonb)) with ordinality item(value,position)
        where c.offer_valid_until[item.position::int]>${now} and (c.config_valid_until is null or c.config_valid_until>${now})
        group by item.value->>'marketplace') counts where store is not null),'{}'::jsonb) as by_store
      from garimpa.pauta_selection_cache c join garimpa.pauta_source_version v on v.tenant_id=c.tenant_id and v.channel=c.channel and v.revision=c.source_revision
      where c.tenant_id=${context.tenantId} and c.affiliate_id=${context.affiliateId} and c.channel=${channel} and c.format_version=${PAUTA_CACHE_FORMAT}`;
    return row?{active:row.active,count:row.count,byStore:row.by_store}:null;
  },factory);
}

/** Link readiness shares selection's actual target gates, without preparing an edition. */
export async function readPautaLinkProgress(context:AccountContext,ids?:string[],factory:typeof db=db){
  if(currentAccount()&&currentAccount()!.tenantId!==context.tenantId)throw new Error('forbidden_account_scope');
  return readSnapshot(context,async(tx,now)=>{
    const rows=await tx<Array<{id:string;title:string;marketplace:string;product_url:string;option_key:string;chosen_option:string|null}>>`
      select p.id,p.title,p.marketplace,p.product_url,o.option_key,
        (select c.option_key from garimpa.editorial_offer_choice c where c.tenant_id=p.tenant_id and c.product_id=p.id) as chosen_option from garimpa.product p
      join lateral(select option_key,observed_at from garimpa.price_observation o where o.tenant_id=p.tenant_id and o.product_id=p.id
        and (not exists(select 1 from garimpa.editorial_offer_choice c where c.tenant_id=p.tenant_id and c.product_id=p.id)
          or o.option_key=(select c.option_key from garimpa.editorial_offer_choice c where c.tenant_id=p.tenant_id and c.product_id=p.id))
        order by observed_at desc,id desc limit 1) o on true
      where p.tenant_id=${context.tenantId} and (${ids??null}::text[] is null or p.id=any(${ids??[]}::text[]))
        and o.observed_at<=${now} and o.observed_at>=${new Date(+now-PAUTA_PRICE_WINDOW_MS)}
        and not exists(select 1 from garimpa.product_curation c where c.tenant_id=p.tenant_id and c.product_id=p.id and c.status='rejected')`;
    if(!rows.length)return {missing:0,items:[] as Array<{id:string;title:string;optionKey:string}>};
    const {ml,linkFacts}=await pautaLinkFacts(tx,context.tenantId,context.affiliateId,rows.map(p=>p.id));
    const items=rows.filter(p=>{const facts=linkFacts.get(p.id);return !facts||!shareTarget(context.tenantId,{id:p.id,marketplace:p.marketplace,productUrl:p.product_url,
      offerOptionKey:p.chosen_option??undefined},facts,ml);}).map(p=>({id:p.id,title:p.title,optionKey:p.chosen_option??'listing'}));
    return {missing:items.length,items};
  },factory);
}

async function pendingPautaPreparations(tx: Tx, context: AccountContext, channel: PautaChannel) {
  const [schema] = await tx<{ ready: boolean }[]>`select to_regclass('garimpa.recommendation_edition_archive') is not null as ready`;
  if (!schema?.ready) return [];
  const rows = await tx<{ id: string; selection: { sourceId: string; text: string;
    products: Array<Record<string, unknown>> } }[]>`select a.id,a.selection
    from garimpa.recommendation_edition_archive a
    where a.tenant_id=${context.tenantId} and a.channel=${channel}
      and a.selection->>'kind'='pauta-copied-v1' and a.selection->>'affiliateId'=${context.affiliateId}
      and not exists(select 1 from garimpa.recommendation_exposure e
        where e.tenant_id=a.tenant_id and e.channel=a.channel
          and (e.edition_id=a.id or e.edition_id::text=a.selection->>'sourceId'))
      and not exists(select 1 from garimpa.recommendation_edition_archive d
        where d.tenant_id=a.tenant_id and d.channel=a.channel
          and d.selection->>'kind'='pauta-discarded-v1'
          and (d.selection->>'sourceId'=a.id::text or d.selection->>'sourceId'=a.selection->>'sourceId'))
    order by a.prepared_at desc,a.id desc`;
  return rows.flatMap(row => row.selection.products?.[0]
    ? [{ product: { ...row.selection.products[0], confirmationId: row.id }, text: row.selection.text,
      sourceConfirmationId: row.selection.sourceId }] : []);
}

export async function readPendingPautaPreparations(context: AccountContext, channel: PautaChannel, sqlFactory: typeof db = db) {
  return withAccountDb(context, tx => pendingPautaPreparations(tx, context, channel), sqlFactory);
}

export async function readLivePauta(context: AccountContext, channel: PautaChannel, marketplace: string | null = null,
  sqlFactory: typeof db = db) {
  return withAccountDb(context, async tx => {
    const [{ now }] = await tx<{ now: Date }[]>`select statement_timestamp() as now`;
    const [schema] = await tx<{ cache_ready: boolean; archive_ready: boolean }[]>`select
      to_regclass('garimpa.pauta_selection_cache') is not null and to_regclass('garimpa.pauta_source_version') is not null as cache_ready,
      to_regclass('garimpa.recommendation_edition_archive') is not null as archive_ready`;
    const { selection, state } = schema?.cache_ready
      ? await cachedSelection(tx, context, channel)
      : await (async () => {
          const fallback = await selectOffers(tx, context, channel, now);
          return {
            selection: fallback,
            state: {
              active: fallback.config !== null,
              count: fallback.selected.length,
              revision: "0",
              viewRevision: "0",
              preparedAt: now,
            },
          };
        })();
    // Expiry only removes stale entries from this edition; it never re-ranks or
    // fills vacancies before the next source change.
    selection.selected = selection.selected.filter(candidate => Date.parse(pautaOfferValidUntil(candidate, selection.config)) > +now);
    const captures = await recentCaptures(tx, context.tenantId, now, marketplace);
    const slugs = selection.selected.flatMap(p => p.shareTarget?.kind === "site" ? [p.shareTarget.slug] : []);
    const codes = slugs.length ? await tx<{ code: string; slug: string }[]>`select code,slug from garimpa.short_link
      where tenant_id=${context.tenantId} and slug=any(${slugs})` : [];
    const codesBySlug = new Map(codes.map(row => [row.slug, row.code]));
    const presentationFactory = (() => Object.assign((...args: unknown[]) =>
      (tx as unknown as (...values: unknown[]) => unknown)(...args), { end: async () => {} })) as typeof db;
    const presentations = await getProductPresentations(selection.selected.map(p => p.id), context.tenantId, presentationFactory);
    const products = selection.selected.map(candidate => {
      const { productUrl: _url, lastSeenAt: _seen, curationStatus: _status, evidenceFingerprint: _fingerprint,
        offerEvidence: _evidence, tenantId: _tenant, assessment, selectionBlockers: _blockers, offerMaterialInvalid: _invalid,
        latestObservationId: _latest, evidenceObservationId: _observation, triageScore: _score, cooldownException:_exception,
        pautaScore:_pautaScore,pautaPolicyVersion:_pautaPolicyVersion,curationPolicyVersion:_curationPolicyVersion,equivalenceKey:_equivalenceKey,
        factualValidUntil:_factualValidUntil,aiBenefit, shareTarget, ...product } = candidate;
      const presentation = presentations.get(product.id) ?? sourceProductPresentation(product.title);
      const safeAiBenefit = aiBenefit && !hasSuperiorityClaim(aiBenefit) && !/R\$|\b\d+[.,]?\d*\s*%/u.test(aiBenefit)
        ? aiBenefit : undefined;
      return {
        ...presentation, ...product,
        ...(product.promotionType ?? presentation.promotionType ? { promotionType: product.promotionType ?? presentation.promotionType } : {}),
        ...(product.promotionEndsAt ?? presentation.promotionEndsAt ? { promotionEndsAt: product.promotionEndsAt ?? presentation.promotionEndsAt } : {}),
        ...(product.priceType === "range" || product.priceType === "from" || product.offerConditions && !product.offerOptionKey
          ? { discountPercent: null, originalPriceCents: null, lowestVerified: false } : {}),
        benefit: presentation.benefit || (assessment?.benefit && !hasSuperiorityClaim(assessment.benefit) ? assessment.benefit : safeAiBenefit),
        purchaseContents: presentation.purchaseContents ?? assessment?.purchaseContents,
        editorialRationale: product.priceType === "range" ? "" : assessment?.publicRationale ?? "",
        offerValidUntil: pautaOfferValidUntil(candidate, selection.config),
        shareTarget: shareTarget!,
        shortCode: shareTarget?.kind === "site" ? codesBySlug.get(shareTarget.slug) : undefined,
        confirmationId: offerConfirmationId(context.tenantId, context.affiliateId, channel, selection.config!.version,
          candidate, { presentation, aiBenefit: safeAiBenefit, sourceRevision: pautaRevision(state) }, pautaOfferValidUntil(candidate, selection.config)),
      };
    });
    // Archive the facts presented to the operator before they can be copied.
    // Confirmation refers to this immutable record, even if a later observation
    // replaces the live edition. Merely viewing or copying creates no exposure.
    if (schema?.archive_ready) {
      for (const [index, product] of products.entries()) {
        const candidate = selection.selected[index];
        const version = selection.config!.version;
        await tx`insert into garimpa.recommendation_edition_archive(id,tenant_id,channel,version,config_version,prepared_at,selection,inputs)
          values(${product.confirmationId},${context.tenantId},${channel},${version},${version},${now},
            ${tx.json(JSON.parse(JSON.stringify({ kind: "pauta-preparation-v1", affiliateId: context.affiliateId,
              sourceRevision: pautaRevision(state), products: [product] })))},
            ${tx.json([{ productId: product.id, observationId: candidate.evidenceObservationId ?? null,
              evidenceFingerprint: candidate.evidenceFingerprint ?? null, validUntil: product.offerValidUntil,
              ...(candidate.curationPolicyVersion!==undefined ? {curationPolicyVersion:candidate.curationPolicyVersion,
                pautaPolicyVersion:candidate.pautaPolicyVersion,pautaScore:candidate.pautaScore} : {}),
              ...(candidate.cooldownException ? {cooldownException:candidate.cooldownException} : {}) }])})
          on conflict(id) do nothing`;
      }
    }
    const preparations = schema?.archive_ready ? await pendingPautaPreparations(tx, context, channel) : [];
    const recent: PautaCapture[] = captures.map(row => ({
      id: row.id, title: row.title, marketplace: row.marketplace, priceCents: row.price_cents,
      priceType: row.price_type, currency: row.currency,
      capturedAt: row.observed_at.toISOString(), ...captureStatus(row, selection),
    }));
    const first = captures[0];
    const captureActions: PautaCaptureActions = { review: first?.review_total ?? 0, triage: first?.triage_total ?? 0, retry: first?.retry_total ?? 0 };
    return { products, preparations,
      recent, recentTotal: first?.total ?? 0, captureActions, active: selection.config !== null, updatedAt: state.preparedAt.toISOString(), revision: pautaRevision(state) };
  }, sqlFactory);
}

export async function preparePautaCopy(context: AccountContext, channel: PautaChannel, sourceId: string,
  productId: string, text: string, sqlFactory: typeof db = db, slotId?: string, requestId?: string): Promise<string | null> {
  if (context.actor !== "human" || !context.actorAppUserId || !text.trim() || text.length > 12000) return null;
  return withAccountDb(context, async tx => {
    const id=requestId ?? randomUUID();
    await tx`select pg_advisory_xact_lock(hashtextextended(${`pauta-copy:${context.tenantId}:${id}`},0))`;
    const [existing]=await tx<{selection:{kind?:string;affiliateId?:string;sourceId?:string;text?:string;preparedBy?:string;
      slotId?:string|null;products?:Array<{id:string}>}}[]>`select selection from garimpa.recommendation_edition_archive
      where tenant_id=${context.tenantId} and channel=${channel} and id=${id}::uuid`;
    if(existing) return existing.selection.kind==='pauta-copied-v1' && existing.selection.affiliateId===context.affiliateId
      && existing.selection.sourceId===sourceId && existing.selection.text===text && existing.selection.preparedBy===context.actorAppUserId
      && (existing.selection.slotId ?? null)===(slotId ?? null) && existing.selection.products?.length===1
      && existing.selection.products?.[0]?.id===productId ? id : null;
    const [source] = await tx<{ version: number; config_version: number; inputs: unknown;
      selection: { kind?: string; affiliateId?: string; sourceRevision?: string; products?: Array<{
        id: string; offerValidUntil?: string;
      }> } }[]>`select version,config_version,inputs,selection from garimpa.recommendation_edition_archive
      where tenant_id=${context.tenantId} and channel=${channel} and id=${sourceId}::uuid`;
    const product = source?.selection.products?.find(item => item.id === productId);
    if (source?.selection.kind !== "pauta-preparation-v1" || source.selection.affiliateId !== context.affiliateId
      || !product) return null;
    // Lock the source version while verifying that the displayed facts are
    // still the edition presented to the operator; no external calls occur here.
    await tx`select revision from garimpa.pauta_source_version
      where tenant_id=${context.tenantId} and channel=${channel} for update`;
    const current = await cachedPauta(tx, context, channel);
    const [{ now }] = await tx<{ now: Date }[]>`select statement_timestamp() as now`;
    if (source.selection.sourceRevision !== pautaRevision(current)
      || !(Date.parse(product.offerValidUntil ?? "") > +now)) return null;
    if(slotId) {
      const [slot]=await tx<{items_per_slot:number}[]>`select c.items_per_slot from garimpa.pauta_slot_occurrence o
        join garimpa.pauta_slot_config c on c.tenant_id=o.tenant_id and c.channel=o.channel and c.version=o.config_version
        join garimpa.recommendation_channel ch on ch.tenant_id=o.tenant_id and ch.channel=o.channel
        where o.tenant_id=${context.tenantId} and o.channel=${channel} and o.id=${slotId}::uuid
          and o.status='pending' and o.scheduled_at>statement_timestamp()-interval '30 minutes'
          and c.enabled and ch.enabled and (ch.valid_until is null or ch.valid_until>statement_timestamp()) for update of o`;
      if(!slot) return null;
      // A copied draft stays in the archive for a later declaration of what
      // was sent, but an obsolete unconfirmed draft must not occupy a slot
      // forever. Confirmed disclosures continue to count even after expiry.
      const [usage]=await tx<{count:number;already:boolean}[]>`select count(distinct prep.product_id)::int as count,
        coalesce(bool_or(prep.product_id=${productId}),false) as already
        from garimpa.pauta_slot_preparation prep
        join garimpa.recommendation_edition_archive archive on archive.tenant_id=prep.tenant_id
          and archive.channel=prep.channel and archive.id=prep.preparation_id
        where prep.tenant_id=${context.tenantId} and prep.channel=${channel} and prep.slot_id=${slotId}::uuid
          and (exists(select 1 from garimpa.recommendation_exposure exposure where exposure.tenant_id=prep.tenant_id
            and exposure.channel=prep.channel and exposure.edition_id=prep.preparation_id and exposure.product_id=prep.product_id)
            or (archive.selection->>'sourceRevision'=${pautaRevision(current)}
              and (archive.selection->'products'->0->>'offerValidUntil')::timestamptz>statement_timestamp()))`;
      if(!usage.already && usage.count>=slot.items_per_slot) return null;
    }
    await tx`insert into garimpa.recommendation_edition_archive(id,tenant_id,channel,version,config_version,prepared_at,selection,inputs)
      values(${id},${context.tenantId},${channel},${source.version},${source.config_version},statement_timestamp(),
        ${tx.json(JSON.parse(JSON.stringify({ ...source.selection, kind: "pauta-copied-v1", sourceId,
          text, preparedBy: context.actorAppUserId,slotId:slotId ?? null })))},${tx.json(source.inputs as never)})`;
    if(slotId) await tx`insert into garimpa.pauta_slot_preparation(tenant_id,channel,slot_id,preparation_id,product_id)
      values(${context.tenantId},${channel},${slotId}::uuid,${id}::uuid,${productId})`;
    return id;
  }, sqlFactory);
}

export async function confirmPautaExposure(context: AccountContext, channel: PautaChannel, confirmationId: string,
  productId: string, sqlFactory: typeof db = db) {
  if (context.actor !== "human" || !context.actorAppUserId) return false;
  const { tenantId, actorAppUserId } = context;
  return withAccountDb(context, async tx => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${`recommendations:${tenantId}`},0))`;
    const [archive] = await tx<{ selection: { kind?: string; affiliateId?: string; products?: Array<{
      id: string; offerOptionKey?: string | null; priceCents: number; offerValidUntil?: string;
    }> } }[]>`select selection from garimpa.recommendation_edition_archive
      where tenant_id=${tenantId} and channel=${channel} and id=${confirmationId}::uuid`;
    const offer = (archive?.selection.kind === "pauta-copied-v1" || archive?.selection.kind === "pauta-preparation-v1")
      && archive.selection.affiliateId === context.affiliateId
      ? archive.selection.products?.find(product => product.id === productId) : undefined;
    if (!offer || !Number.isSafeInteger(offer.priceCents) || offer.priceCents <= 0) return false;
    const validUntil = Date.parse(offer.offerValidUntil ?? "");
    const [{ hasPrepExpired } = { hasPrepExpired: false }] = await tx<{ hasPrepExpired: boolean }[]>`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'garimpa' and table_name = 'recommendation_exposure' and column_name = 'preparation_expired'
      ) as "hasPrepExpired"`;
    const [{ hasIsSkip } = { hasIsSkip: false }] = await tx<{ hasIsSkip: boolean }[]>`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'garimpa' and table_name = 'recommendation_exposure' and column_name = 'is_skip'
      ) as "hasIsSkip"`;
    if (hasIsSkip && hasPrepExpired) {
      await tx`insert into garimpa.recommendation_exposure(tenant_id,channel,edition_id,product_id,option_key,price_cents,confirmed_by,preparation_expired,is_skip)
        values(${tenantId},${channel},${confirmationId},${productId},${offer.offerOptionKey ?? null},${offer.priceCents},${actorAppUserId},
          ${Number.isFinite(validUntil) ? new Date(validUntil) : null}::timestamptz is null or statement_timestamp() >= ${Number.isFinite(validUntil) ? new Date(validUntil) : null}::timestamptz,false)
        on conflict(tenant_id,channel,edition_id,product_id) do nothing`;
    } else if (hasPrepExpired) {
      await tx`insert into garimpa.recommendation_exposure(tenant_id,channel,edition_id,product_id,option_key,price_cents,confirmed_by,preparation_expired)
        values(${tenantId},${channel},${confirmationId},${productId},${offer.offerOptionKey ?? null},${offer.priceCents},${actorAppUserId},
          ${Number.isFinite(validUntil) ? new Date(validUntil) : null}::timestamptz is null or statement_timestamp() >= ${Number.isFinite(validUntil) ? new Date(validUntil) : null}::timestamptz)
        on conflict(tenant_id,channel,edition_id,product_id) do nothing`;
    } else {
      await tx`insert into garimpa.recommendation_exposure(tenant_id,channel,edition_id,product_id,option_key,price_cents,confirmed_by)
        values(${tenantId},${channel},${confirmationId},${productId},${offer.offerOptionKey ?? null},${offer.priceCents},${actorAppUserId})
        on conflict(tenant_id,channel,edition_id,product_id) do nothing`;
    }
    return true;
  }, sqlFactory);
}

export async function discardPautaPreparation(context: AccountContext, channel: PautaChannel, confirmationId: string,
  productId: string, sqlFactory: typeof db = db) {
  if (context.actor !== "human" || !context.actorAppUserId) return false;
  const { tenantId } = context;
  return withAccountDb(context, async tx => {
    const id = randomUUID();
    await tx`insert into garimpa.recommendation_edition_archive(id,tenant_id,channel,version,config_version,prepared_at,selection,inputs)
      values(${id}::uuid,${tenantId},${channel},1,1,now(),
        ${tx.json({ kind: "pauta-discarded-v1", affiliateId: context.affiliateId, sourceId: confirmationId, productId, discardedBy: context.actorAppUserId })},
        ${tx.json([{ productId }])})
      on conflict(id) do nothing`;
    return true;
  }, sqlFactory);
}

export async function skipPautaOffer(context: AccountContext, channel: PautaChannel, confirmationId: string,
  productId: string, sqlFactory: typeof db = db) {
  if (context.actor !== "human" || !context.actorAppUserId) return false;
  const { tenantId, actorAppUserId } = context;
  return withAccountDb(context, async tx => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${`recommendations:${tenantId}`},0))`;
    const [archive] = await tx<{ selection: { kind?: string; affiliateId?: string; products?: Array<{
      id: string; offerOptionKey?: string | null; priceCents: number; offerValidUntil?: string;
    }> } }[]>`select selection from garimpa.recommendation_edition_archive
      where tenant_id=${tenantId} and channel=${channel} and id=${confirmationId}::uuid`;
    let offer = (archive?.selection.kind === "pauta-copied-v1" || archive?.selection.kind === "pauta-preparation-v1")
      && archive.selection.affiliateId === context.affiliateId
      ? archive.selection.products?.find(product => product.id === productId) : undefined;
    let priceCents = offer?.priceCents;
    let optionKey = offer?.offerOptionKey ?? null;
    if (!priceCents || priceCents <= 0) {
      const [latest] = await tx<{ price_cents: number; option_key: string | null }[]>`
        select price_cents, option_key from garimpa.price_observation
        where tenant_id=${tenantId} and product_id=${productId} and price_cents > 0
        order by observed_at desc limit 1`;
      priceCents = latest?.price_cents ?? 100;
      optionKey = latest?.option_key ?? null;
    }

    if (!archive) {
      await tx`insert into garimpa.recommendation_edition_archive(id,tenant_id,channel,version,config_version,prepared_at,selection,inputs)
        values(${confirmationId}::uuid,${tenantId},${channel},1,1,now(),
          ${tx.json({ kind: "pauta-preparation-v1", affiliateId: context.affiliateId, products: [{ id: productId, offerOptionKey: optionKey, priceCents }] })},
          ${tx.json([{ productId }])})
        on conflict(id) do nothing`;
    }

    const [{ hasPrepExpired } = { hasPrepExpired: false }] = await tx<{ hasPrepExpired: boolean }[]>`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'garimpa' and table_name = 'recommendation_exposure' and column_name = 'preparation_expired'
      ) as "hasPrepExpired"`;
    const [{ hasIsSkip } = { hasIsSkip: false }] = await tx<{ hasIsSkip: boolean }[]>`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'garimpa' and table_name = 'recommendation_exposure' and column_name = 'is_skip'
      ) as "hasIsSkip"`;

    if (hasIsSkip && hasPrepExpired) {
      await tx`insert into garimpa.recommendation_exposure(tenant_id,channel,edition_id,product_id,option_key,price_cents,confirmed_by,preparation_expired,is_skip)
        values(${tenantId},${channel},${confirmationId},${productId},${optionKey},${priceCents},${actorAppUserId},false,true)
        on conflict(tenant_id,channel,edition_id,product_id) do nothing`;
    } else if (hasPrepExpired) {
      await tx`insert into garimpa.recommendation_exposure(tenant_id,channel,edition_id,product_id,option_key,price_cents,confirmed_by,preparation_expired)
        values(${tenantId},${channel},${confirmationId},${productId},${optionKey},${priceCents},${actorAppUserId},false)
        on conflict(tenant_id,channel,edition_id,product_id) do nothing`;
    } else {
      await tx`insert into garimpa.recommendation_exposure(tenant_id,channel,edition_id,product_id,option_key,price_cents,confirmed_by)
        values(${tenantId},${channel},${confirmationId},${productId},${optionKey},${priceCents},${actorAppUserId})
        on conflict(tenant_id,channel,edition_id,product_id) do nothing`;
    }

    return true;
  }, sqlFactory);
}

export async function skipPautaOffersBatch(context: AccountContext, channel: PautaChannel,
  items: Array<{ confirmationId: string; productId: string }>, sqlFactory: typeof db = db) {
  if (context.actor !== "human" || !context.actorAppUserId || !items.length) return false;
  const { tenantId, actorAppUserId } = context;
  return withAccountDb(context, async tx => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${`recommendations:${tenantId}`},0))`;
    const [{ hasPrepExpired } = { hasPrepExpired: false }] = await tx<{ hasPrepExpired: boolean }[]>`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'garimpa' and table_name = 'recommendation_exposure' and column_name = 'preparation_expired'
      ) as "hasPrepExpired"`;
    const [{ hasIsSkip } = { hasIsSkip: false }] = await tx<{ hasIsSkip: boolean }[]>`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'garimpa' and table_name = 'recommendation_exposure' and column_name = 'is_skip'
      ) as "hasIsSkip"`;

    for (const item of items) {
      const [archive] = await tx<{ selection: { kind?: string; affiliateId?: string; products?: Array<{
        id: string; offerOptionKey?: string | null; priceCents: number;
      }> } }[]>`select selection from garimpa.recommendation_edition_archive
        where tenant_id=${tenantId} and channel=${channel} and id=${item.confirmationId}::uuid`;
      let offer = (archive?.selection.kind === "pauta-copied-v1" || archive?.selection.kind === "pauta-preparation-v1")
        && archive.selection.affiliateId === context.affiliateId
        ? archive.selection.products?.find(product => product.id === item.productId) : undefined;
      let priceCents = offer?.priceCents;
      let optionKey = offer?.offerOptionKey ?? null;
      if (!priceCents || priceCents <= 0) {
        const [latest] = await tx<{ price_cents: number; option_key: string | null }[]>`
          select price_cents, option_key from garimpa.price_observation
          where tenant_id=${tenantId} and product_id=${item.productId} and price_cents > 0
          order by observed_at desc limit 1`;
        priceCents = latest?.price_cents ?? 100;
        optionKey = latest?.option_key ?? null;
      }

      if (!archive) {
        await tx`insert into garimpa.recommendation_edition_archive(id,tenant_id,channel,version,config_version,prepared_at,selection,inputs)
          values(${item.confirmationId}::uuid,${tenantId},${channel},1,1,now(),
            ${tx.json({ kind: "pauta-preparation-v1", affiliateId: context.affiliateId, products: [{ id: item.productId, offerOptionKey: optionKey, priceCents }] })},
            ${tx.json([{ productId: item.productId }])})
          on conflict(id) do nothing`;
      }

      if (hasIsSkip && hasPrepExpired) {
        await tx`insert into garimpa.recommendation_exposure(tenant_id,channel,edition_id,product_id,option_key,price_cents,confirmed_by,preparation_expired,is_skip)
          values(${tenantId},${channel},${item.confirmationId},${item.productId},${optionKey},${priceCents},${actorAppUserId},false,true)
          on conflict(tenant_id,channel,edition_id,product_id) do nothing`;
      } else if (hasPrepExpired) {
        await tx`insert into garimpa.recommendation_exposure(tenant_id,channel,edition_id,product_id,option_key,price_cents,confirmed_by,preparation_expired)
          values(${tenantId},${channel},${item.confirmationId},${item.productId},${optionKey},${priceCents},${actorAppUserId},false)
          on conflict(tenant_id,channel,edition_id,product_id) do nothing`;
      } else {
        await tx`insert into garimpa.recommendation_exposure(tenant_id,channel,edition_id,product_id,option_key,price_cents,confirmed_by)
          values(${tenantId},${channel},${item.confirmationId},${item.productId},${optionKey},${priceCents},${actorAppUserId})
          on conflict(tenant_id,channel,edition_id,product_id) do nothing`;
      }
    }
    return true;
  }, sqlFactory);
}
