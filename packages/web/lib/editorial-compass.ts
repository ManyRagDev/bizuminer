import { scopedTenantId } from "./account-scope.ts";
import { db } from "./db.ts";
import { withTenantDb } from "./tenant-db.ts";
import { PRODUCT_EVIDENCE_TTL_DAYS } from "./catalog-policy.ts";
import { productSlug } from "./marketplaces.ts";
import { DEFAULT_SCORE_WEIGHTS, type ScoreWeights } from "./curation-score-v2.ts";
import { scoreWeightsRevision } from "./curation-score-revision.ts";
import { automatedTriageFailureMessage } from "./triage-feedback.ts";

export interface EditorialGuidelineConfig {
  tenantId: string;
  guideline: string;
  autoPublish: boolean;
  minScoreAutoPublish: number;
  updatedAt: string;
}

export interface GoldenExample {
  productId: string;
  title: string;
  snapshotTitle?: string;
  decision: "approved" | "rejected" | "held";
  reasonCode: string | null;
  reasonDetail: string | null;
  rationale?: string;
  priceFormatted?: string;
  createdAt: string;
}

export interface SpotCheckProduct {
  sourceEventId: string;
  id: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  productUrl: string;
  priceCents: number;
  marketplace: string;
  category: string | null;
  aiScore: number;
  aiJustification: string;
  editorialCategory?: string;
  publishedAt: string;
}

export const DAILY_AUDIT_TARGET = 12;

export interface DailyAuditProgress {
  target: number;
  reviewed: number;
  confirmed: number;
  corrected: number;
  remaining: number;
  complete: boolean;
}

export function toDailyAuditProgress(
  confirmed: number,
  corrected: number,
  target = DAILY_AUDIT_TARGET,
): DailyAuditProgress {
  const safeTarget = Math.min(Math.max(target, 0), 50);
  const safeConfirmed = Math.max(0, confirmed);
  const safeCorrected = Math.max(0, corrected);
  const reviewed = safeConfirmed + safeCorrected;
  return {
    target: safeTarget,
    reviewed,
    confirmed: safeConfirmed,
    corrected: safeCorrected,
    remaining: Math.max(0, safeTarget - reviewed),
    complete: reviewed >= safeTarget,
  };
}

/** Progresso da sessão diária no fuso operacional do BizuMiner. */
export async function getDailyAuditProgress(
  tenantId = scopedTenantId(),
  target = DAILY_AUDIT_TARGET,
  sqlFactory: typeof db = db,
): Promise<DailyAuditProgress> {
  const empty = toDailyAuditProgress(0, 0, target);
  if (!process.env.DATABASE_URL) return empty;

  return await withTenantDb(tenantId, async (sql) => {
    try {
      const rows = await sql<{ confirmed: number; corrected: number }[]>`
        select
          count(*) filter (where metadata ? 'spotCheckConfirm')::int as confirmed,
          count(*) filter (where metadata ? 'spotCheckReject')::int as corrected
        from garimpa.curation_event
        where tenant_id = ${tenantId}
          and actor_type = 'human'
          and (metadata ? 'spotCheckConfirm' or metadata ? 'spotCheckReject')
          and created_at >= (
            date_trunc('day', now() at time zone 'America/Sao_Paulo')
            at time zone 'America/Sao_Paulo'
          )
      `;
      const confirmed = rows[0]?.confirmed ?? 0;
      const corrected = rows[0]?.corrected ?? 0;
      return toDailyAuditProgress(confirmed, corrected, target);
    } catch {
      return empty;
    }
  }, sqlFactory);
}

/** Qualidade é uma amostra recente e opcional, independente da publicação. */
export async function getAuditDesk(tenantId = scopedTenantId()) {
  const [progress, available] = await Promise.all([
    getDailyAuditProgress(tenantId), getRecentSpotCheckProducts(tenantId, DAILY_AUDIT_TARGET),
  ]);
  const target = Math.min(DAILY_AUDIT_TARGET, progress.reviewed + available.length);
  const adjusted = toDailyAuditProgress(progress.confirmed, progress.corrected, target);
  return { progress: adjusted, products: available.slice(0, adjusted.remaining) };
}

export const DEFAULT_GUIDELINE =
  "Foco em utilidades práticas e produtos acabados de alta utilidade e apelo comercial nos 12 departamentos do catálogo (Casa, Eletrodomésticos, Eletrônicos, Informática, Ferramentas, Beleza, Esporte e Lazer, Auto, Brinquedos, Iluminação, Papelaria, Moda). Valorizar gadgets inteligentes, soluções para o dia a dia e itens com boas avaliações e vendas. Rejeitar peças industriais e técnicas de reposição avulsas (parafusos, rolamentos soltos, engrenagens industriais), cabos sem diferencial ou anúncios de baixa qualidade.";

export async function getEditorialGuideline(tenantId = scopedTenantId(), sqlFactory: typeof db = db): Promise<EditorialGuidelineConfig> {
  const fallback: EditorialGuidelineConfig = {
    tenantId,
    guideline: DEFAULT_GUIDELINE,
    autoPublish: false,
    minScoreAutoPublish: 4,
    updatedAt: new Date().toISOString(),
  };

  if (!process.env.DATABASE_URL) {
    return fallback;
  }

  return await withTenantDb(tenantId, async (sql) => {
    try {
      const rows = await sql<{
        tenant_id: string;
        guideline: string;
        auto_publish: boolean;
        min_score_auto_publish: number;
        updated_at: Date | string;
      }[]>`
        select tenant_id, guideline, auto_publish, min_score_auto_publish, updated_at
        from garimpa.editorial_guideline
        where tenant_id = ${tenantId}
        limit 1
      `;

      if (rows.length > 0 && rows[0]) {
        const r = rows[0];
        return {
          tenantId: r.tenant_id,
          guideline: r.guideline,
          autoPublish: r.auto_publish,
          minScoreAutoPublish: r.min_score_auto_publish,
          updatedAt: new Date(r.updated_at).toISOString(),
        };
      }

      return fallback;
    } catch {
      return fallback;
    }
  }, sqlFactory);
}

export async function saveEditorialGuideline(
  tenantId = scopedTenantId(),
  guideline: string,
  autoPublish: boolean,
  minScore = 4,
  sqlFactory: typeof db = db,
): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;

  return await withTenantDb(tenantId, async (sql) => {
    await sql`
      insert into garimpa.editorial_guideline (tenant_id, guideline, auto_publish, min_score_auto_publish, updated_at)
      values (${tenantId}, ${guideline.trim()}, ${autoPublish}, ${minScore}, now())
      on conflict (tenant_id)
      do update set
        guideline = excluded.guideline,
        auto_publish = excluded.auto_publish,
        min_score_auto_publish = excluded.min_score_auto_publish,
        updated_at = now()
    `;
    return true;
  }, sqlFactory);
}

/**
 * Carrega as decisões humanas mais recentes com justificativa ou aprovação explícita.
 * Esses itens funcionam como exemplos Few-Shot dinâmicos injetados no Gemini 2.5 Flash.
 */
export async function getGoldenExamples(tenantId = scopedTenantId(), limit = 6, sqlFactory: typeof db = db,
  requireDecisionSnapshot = false): Promise<GoldenExample[]> {
  if (!process.env.DATABASE_URL) return [];

  return await withTenantDb(tenantId, async (sql) => {
    try {
      const rows = await sql<{
        product_id: string;
        title: string;
        to_status: "approved" | "rejected" | "held";
        reason_code: string | null;
        reason_detail: string | null;
        metadata: Record<string, unknown>;
        created_at: Date | string;
        price_cents: number | null;
      }[]>`
        with latest_events as (
          select distinct on (e.product_id)
            e.product_id,
            coalesce(nullif(e.metadata->'snapshot'->>'title', ''), p.title, 'Produto') as title,
            e.to_status,
            e.reason_code,
            e.reason_detail,
            e.metadata,
            e.created_at,
            case when jsonb_typeof(e.metadata->'snapshot'->'priceCents') = 'number' then
              case when (e.metadata->'snapshot'->>'priceCents')::numeric between 0 and 2147483647
                and trunc((e.metadata->'snapshot'->>'priceCents')::numeric) = (e.metadata->'snapshot'->>'priceCents')::numeric
                then (e.metadata->'snapshot'->>'priceCents')::numeric::int else null end
              else null end as price_cents
          from garimpa.curation_event e
          left join garimpa.product p on p.id = e.product_id and p.tenant_id = e.tenant_id
          where e.tenant_id = ${tenantId}
            and e.actor_type = 'human'
            -- A stable product partition keeps the evaluation holdout out of few-shots.
            and substr(md5(e.tenant_id || ':' || e.product_id), 1, 1) not in ('0','1','2','3')
            and not exists(select 1 from garimpa.curation_equivalence_member own
              join garimpa.curation_equivalence_group g on g.tenant_id=own.tenant_id and g.id=own.group_id and g.revoked_at is null
              join garimpa.curation_equivalence_member related on related.tenant_id=g.tenant_id and related.group_id=g.id and related.active
              where own.tenant_id=e.tenant_id and own.product_id=e.product_id and own.active
                and substr(md5(related.tenant_id || ':' || related.product_id),1,1) in ('0','1','2','3'))
          order by e.product_id, e.id desc
        ),
        balanced as (
          select *,
            row_number() over (partition by (to_status = 'approved') order by created_at desc) as rn
          from latest_events
          where not ${requireDecisionSnapshot} or (
            nullif(btrim(reason_detail), '') is not null
            and nullif(btrim(metadata->'snapshot'->>'title'), '') is not null
          )
        )
        select product_id, title, to_status, reason_code, reason_detail, metadata, created_at, price_cents
        from balanced
        where rn <= ${Math.ceil(Math.min(Math.max(limit, 1), 20) / 2)}
        order by created_at desc
        limit ${Math.min(Math.max(limit, 1), 20)}
      `;

      return rows.map((r) => {
        const snapshot = r.metadata?.snapshot as Record<string, unknown> | undefined;
        const priceCents = r.price_cents;
        return {
          productId: r.product_id,
          title: r.title,
          snapshotTitle: typeof snapshot?.title === "string" && snapshot.title.trim() ? snapshot.title : undefined,
          decision: r.to_status,
          reasonCode: r.reason_code,
          reasonDetail: r.reason_detail,
          rationale: typeof snapshot?.rationale === "string" ? snapshot.rationale : undefined,
          priceFormatted: priceCents !== null ? `R$ ${(priceCents / 100).toFixed(2)}` : undefined,
          createdAt: new Date(r.created_at).toISOString(),
        };
      });
    } catch {
      return [];
    }
  }, sqlFactory);
}

export type WeeklyAuditProduct = {
  id: string; title: string; marketplace: string; category: string | null;
  productUrl: string; priceCents: number | null; observedAt: string | null; observationId: string | null;
  score: number | null; group: "selected" | "boundary" | "tail"; holdout: boolean; reviewed: boolean;
};

export async function getWeeklyAuditSettings(tenantId = scopedTenantId(), sqlFactory: typeof db = db) {
  if (!process.env.DATABASE_URL) return {version:0,limit:20,available:false};
  return withTenantDb(tenantId, async sql => {
    try {
      const [row] = await sql<{version:number;config:{weeklyAuditLimit?:unknown}}[]>`
        select version,config from garimpa.curation_policy_v2 where tenant_id=${tenantId}`;
      const value=row?.config?.weeklyAuditLimit;
      return {version:row?.version ?? 0,limit:typeof value==='number' && Number.isInteger(value) && value>=1 && value<=50 ? value : 20,available:true};
    } catch { return {version:0,limit:20,available:false}; }
  },sqlFactory);
}

/** Weekly, deterministic sample; it never changes a curation decision. */
export async function getWeeklyAuditSample(tenantId = scopedTenantId(), limitPerGroup = 20,
  sqlFactory: typeof db = db): Promise<WeeklyAuditProduct[]> {
  if (!process.env.DATABASE_URL) return [];
  const limit = Math.min(50, Math.max(1, Math.floor(limitPerGroup)));
  return withTenantDb(tenantId, async sql => {
    try {
      const [policy]=await sql<{enabled:boolean;factual_gate_required:boolean;config:{scoreWeights?:ScoreWeights}}[]>`
        select enabled,factual_gate_required,config from garimpa.curation_policy_v2 where tenant_id=${tenantId}`;
      const scoreVersion=policy?.enabled ? scoreWeightsRevision(policy.config.scoreWeights ?? DEFAULT_SCORE_WEIGHTS) : null;
      const rows = await sql<{id:string;title:string;marketplace:string;category:string|null;product_url:string;observation_id:string|null;price_cents:number|null;observed_at:Date|string|null;score:string|number|null;
        sample_group:WeeklyAuditProduct["group"];holdout:boolean;reviewed:boolean}[]>`
        with selected as (
          select item->>'productId' as product_id from garimpa.recommendation_edition e
          join garimpa.recommendation_channel channel on channel.tenant_id=e.tenant_id and channel.channel=e.channel
          cross join lateral jsonb_array_elements(e.inputs) item
          where e.tenant_id=${tenantId} and e.channel='home' and channel.enabled and channel.version=e.config_version
            and (channel.valid_until is null or channel.valid_until>now()) and (item->>'validUntil')::timestamptz>now()
            and (not ${Boolean(policy?.enabled || policy?.factual_gate_required)} or
              now()<garimpa.current_offer_valid_until(e.tenant_id,item->>'productId',item->>'observationId'))
            and (not ${Boolean(policy?.enabled)} or garimpa.has_current_curation_assessment(e.tenant_id,item->>'productId',item->>'observationId'))
            and not garimpa.equivalent_human_veto(e.tenant_id,item->>'productId',item->>'observationId')
        ), pool as (
          select p.id,p.title,p.marketplace,p.category,p.product_url,o.id as observation_id,o.price_cents,o.observed_at,s.score_vitrine,
            exists(select 1 from selected where product_id=p.id) as selected,
            exists(select 1 from garimpa.price_observation previous where previous.tenant_id=p.tenant_id
              and previous.product_id=p.id and previous.option_key=o.option_key and o.option_key<>'listing'
              and previous.offer_evidence->>'currency'=o.offer_evidence->>'currency'
              and previous.observed_at<o.observed_at) as has_history,
            md5(${tenantId} || ':' || p.id || ':' || date_trunc('week',now() at time zone 'America/Sao_Paulo')::date::text) as draw
          from garimpa.product p
          left join lateral (select id,price_cents,observed_at,option_key,offer_evidence from garimpa.price_observation o
            where o.tenant_id=p.tenant_id and o.product_id=p.id
              and (not exists(select 1 from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id)
                or o.option_key=(select choice.option_key from garimpa.editorial_offer_choice choice where choice.tenant_id=p.tenant_id and choice.product_id=p.id))
            order by o.observed_at desc,o.id desc limit 1) o on true
          left join garimpa.curation_score_projection s on s.tenant_id=p.tenant_id and s.product_id=p.id
            and s.option_key=o.option_key and s.observation_id=o.id and s.policy_version=${scoreVersion}
            and o.observed_at>=now()-case when p.marketplace='shopee' then interval '72 hours' else interval '48 hours' end
          where p.tenant_id=${tenantId}
        ), boundary as (
          select id from pool where not selected and score_vitrine is not null
          order by abs(score_vitrine-coalesce((select min(chosen.score_vitrine) from pool chosen
            where chosen.selected and chosen.score_vitrine is not null),score_vitrine)),score_vitrine desc,id limit ${limit}
        ), classified as (
          select p.*,case when selected then 'selected' when exists(select 1 from boundary b where b.id=p.id)
            then 'boundary' else 'tail' end as sample_group,
            row_number() over(partition by coalesce(nullif(category,''),'Sem categoria'),
              case when score_vitrine is null then 'sem_pontuacao' when not has_history then 'sem_historico' else 'demais' end
              order by draw,id) as category_rank
          from pool p
        ), ranked as (
          select *,row_number() over(partition by sample_group order by
            case when sample_group='tail' then category_rank else 0 end,draw,id) as sample_rank from classified
        )
        select r.id,r.title,r.marketplace,r.category,r.product_url,r.observation_id,r.price_cents,r.observed_at,r.score_vitrine as score,r.sample_group,
          (substr(md5(${tenantId} || ':' || r.id),1,1) in ('0','1','2','3') or exists(
            select 1 from garimpa.curation_equivalence_member own
            join garimpa.curation_equivalence_group g on g.tenant_id=own.tenant_id and g.id=own.group_id and g.revoked_at is null
            join garimpa.curation_equivalence_member related on related.tenant_id=g.tenant_id and related.group_id=g.id and related.active
            where own.tenant_id=${tenantId} and own.product_id=r.id and own.active
              and substr(md5(related.tenant_id || ':' || related.product_id),1,1) in ('0','1','2','3'))) as holdout,
          exists(select 1 from garimpa.editorial_assessment a where a.tenant_id=${tenantId} and a.product_id=r.id
            and a.actor_app_user_id is not null and a.assessment->>'schemaVersion'='2'
            and a.snapshot->>'rubricObservationId'=r.observation_id
            and a.snapshot->>'title'=r.title
            and a.snapshot->>'category' is not distinct from r.category
            and a.snapshot->>'product_url'=r.product_url
            and a.created_at >= (date_trunc('week',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')) as reviewed
        from ranked r where r.sample_rank<=${limit}
        order by case r.sample_group when 'selected' then 0 when 'boundary' then 1 else 2 end,r.sample_rank`;
      return rows.map(r=>({id:r.id,title:r.title,marketplace:r.marketplace,category:r.category,productUrl:r.product_url,
        observationId:r.observation_id,priceCents:r.price_cents,observedAt:r.observed_at ? new Date(r.observed_at).toISOString() : null,
        score:r.score === null ? null : Number(r.score),group:r.sample_group,holdout:r.holdout,reviewed:r.reviewed}));
    } catch { return []; }
  },sqlFactory);
}

/**
 * Busca os últimos produtos aprovados automaticamente no piloto automático pelo Gemini,
 * para serem exibidos na mesa de Spot-Check (auditoria rápida de amostragem em 2 min).
 *
 * Só entram produtos cuja decisão MAIS RECENTE foi a aprovação da IA: assim que o
 * diretor confirma ("Manter") ou descarta ("Descartar") um item, um evento humano
 * mais novo passa a ser a última decisão e o produto sai da fila de amostragem.
 * Antes, "Manter" era só visual — o produto voltava a aparecer a cada recarga.
 */
export async function getRecentSpotCheckProducts(
  tenantId = scopedTenantId(),
  limit = 12,
  sqlFactory: typeof db = db,
): Promise<SpotCheckProduct[]> {
  if (!process.env.DATABASE_URL) return [];

  return await withTenantDb(tenantId, async (sql) => {
  try {
    const rows = await sql<{
      id: string;
      source_event_id: string;
      marketplace: string;
      external_id: string;
      title: string;
      image_url: string | null;
      product_url: string;
      price_cents: number;
      category: string | null;
      metadata: Record<string, unknown>;
      created_at: Date | string;
    }[]>`
      select
        p.id, latest.id::text as source_event_id,
        p.marketplace,
        p.external_id,
        p.title,
        p.image_url,
        p.product_url,
        coalesce(latest_price.price_cents, 0)::int as price_cents,
        p.category,
        latest.metadata,
        latest.created_at
      from garimpa.product p
      join garimpa.product_curation c on c.product_id = p.id and c.tenant_id = p.tenant_id
      join lateral (
        select e.id, e.actor_type, e.to_status, e.metadata, e.created_at
        from garimpa.curation_event e
        where e.product_id = p.id and e.tenant_id = p.tenant_id
        order by e.id desc
        limit 1
      ) latest on true
      left join lateral (
        select obs.price_cents
        from garimpa.price_observation obs
        where obs.product_id = p.id and obs.tenant_id = p.tenant_id
        order by obs.observed_at desc
        limit 1
      ) latest_price on true
      where p.tenant_id = ${tenantId}
        and c.status = 'approved'
        and p.last_seen_at >= now() - (${PRODUCT_EVIDENCE_TTL_DAYS} * interval '1 day')
        and latest.created_at >= now() - interval '7 days'
        and latest_price.price_cents > 0
        and latest.actor_type = 'llm'
        and latest.to_status = 'approved'
      order by latest.id desc
      limit ${Math.min(Math.max(limit, 1), 30)}
    `;

    return rows.map((r) => {
      const auto = (r.metadata?.automation as Record<string, unknown>) ?? {};
      return {
        id: r.id,
        sourceEventId: r.source_event_id,
        slug: productSlug(r.marketplace, r.external_id),
        title: r.title,
        imageUrl: r.image_url,
        productUrl: r.product_url,
        priceCents: r.price_cents,
        marketplace: r.marketplace,
        category: r.category,
        aiScore: typeof auto.aiScore === "number" ? auto.aiScore : 4,
        aiJustification: typeof auto.aiJustification === "string" ? auto.aiJustification : "Aprovado no piloto automático.",
        editorialCategory: typeof auto.editorialCategory === "string" ? auto.editorialCategory : undefined,
        publishedAt: new Date(r.created_at).toISOString(),
      };
    });
  } catch {
    return [];
  }
}, sqlFactory);
}

/**
 * Ação de Spot-Check "Manter": o diretor confirma a aprovação automática.
 * Apenas marca a revisão humana no estado atual (status continua `approved`)
 * e registra o evento — assim o produto sai da fila de amostragem de forma
 * idempotente, em vez de voltar a aparecer a cada recarga.
 */
export async function confirmSpotCheck(
  productId: string,
  reviewerAppUserId: string,
  tenantId = scopedTenantId(),
  expectedEventId?: string,
  sqlFactory: typeof db = db,
): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;

  return await withTenantDb(tenantId, async (tx) => {
    try {
      const current = await tx<{ status: string }[]>`
        select status from garimpa.product_curation
        where tenant_id = ${tenantId} and product_id = ${productId}
        for update
      `;
      if (current[0]?.status !== "approved" || !expectedEventId) return false;
      const latest = await tx<{ id: string; actor_type: string; to_status: string }[]>`
        select id::text as id,actor_type,to_status from garimpa.curation_event
        where tenant_id=${tenantId} and product_id=${productId} order by id desc limit 1
      `;
      if (latest[0]?.id !== expectedEventId || latest[0]?.actor_type !== "llm" || latest[0]?.to_status !== "approved") return false;

      await tx`
        update garimpa.product_curation
        set reviewed_by_app_user_id = ${reviewerAppUserId},
            reviewed_at = now(),
            updated_at = now()
        where tenant_id = ${tenantId} and product_id = ${productId}
      `;

      await tx`
        insert into garimpa.curation_event (
          tenant_id, product_id, from_status, to_status, actor_type,
          actor_app_user_id, metadata
        ) values (
          ${tenantId}, ${productId}, ${current[0].status}, 'approved', 'human',
          ${reviewerAppUserId}, ${tx.json({ spotCheckConfirm: true })}
        )
      `;

      return true;
    } catch {
      return false;
    }
  }, sqlFactory);
}

/**
 * Ação de Spot-Check "Descartar": desaprova um produto auto-publicado e grava
 * o motivo para calibração da IA.
 */
export async function rejectAndLearnSpotCheck(
  productId: string,
  feedback: string,
  reviewerAppUserId: string,
  tenantId = scopedTenantId(),
  expectedEventId?: string,
  sqlFactory: typeof db = db,
): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;

  return await withTenantDb(tenantId, async (tx) => {
    try {
      const current = await tx<{ status: string }[]>`
        select status from garimpa.product_curation
        where tenant_id = ${tenantId} and product_id = ${productId}
        for update
      `;
      if (current[0]?.status !== "approved" || !expectedEventId) return false;
      const latest = await tx<{ id: string; actor_type: string; to_status: string }[]>`
        select id::text as id,actor_type,to_status from garimpa.curation_event
        where tenant_id=${tenantId} and product_id=${productId} order by id desc limit 1
      `;
      if (latest[0]?.id !== expectedEventId || latest[0]?.actor_type !== "llm" || latest[0]?.to_status !== "approved") return false;

      const trimmedDetail = feedback.trim();
      const reasonDetail = trimmedDetail.length >= 3 ? trimmedDetail.slice(0, 1000) : "Descartado pelo diretor no spot-check.";

      await tx`
        update garimpa.product_curation
        set status = 'rejected',
            reason_code = 'other',
            reason_detail = ${reasonDetail},
            reviewed_by_app_user_id = ${reviewerAppUserId},
            reviewed_at = now(),
            updated_at = now()
        where tenant_id = ${tenantId} and product_id = ${productId}
      `;

      await tx`
        insert into garimpa.curation_event (
          tenant_id, product_id, from_status, to_status, actor_type,
          actor_app_user_id, reason_code, reason_detail, metadata
        ) values (
          ${tenantId}, ${productId}, ${current[0].status}, 'rejected', 'human',
          ${reviewerAppUserId}, 'other', ${reasonDetail},
          ${tx.json({ spotCheckReject: true, feedback: reasonDetail })}
        )
      `;

      return true;
    } catch {
      return false;
    }
  }, sqlFactory);
}

export interface TriageBatchHistory {
  batchId: string;
  runTime: string;
  totalItems: number;
  approved: number;
  rejected: number;
  held: number;
  llmCount: number;
  ruleCount: number;
  topReason: string;
  status?: "running" | "ok" | "error";
  modelName?: string | null;
  errorMessage?: string | null;
}

/**
 * Retorna os lotes de triagem automatizada mais recentes (com ID persistido ou agrupados).
 */
export async function getTriageBatchesHistory(
  tenantId = scopedTenantId(),
  limit = 8,
  sqlFactory: typeof db = db,
): Promise<TriageBatchHistory[]> {
  if (!process.env.DATABASE_URL) return [];

  return await withTenantDb(tenantId, async (sql) => {
    try {
      const rows = await sql<{
        batch_id: string;
        run_time: Date | string;
        total_items: number;
        approved: number;
        rejected: number;
        held: number;
        llm_count: number;
        rule_count: number;
        top_reason: string | null;
        status: "running" | "ok" | "error";
        model_name: string | null;
        error_message: string | null;
      }[]>`
        with run_batches as (
          select
            r.id::text as batch_id,
            r.started_at as run_time,
            r.total_input as total_items,
            r.approved_count as approved,
            r.rejected_count as rejected,
            r.held_count as held,
            coalesce(ev.llm_count, 0)::int as llm_count,
            coalesce(ev.rule_count, 0)::int as rule_count,
            coalesce(ev.top_reason, 'concluído') as top_reason,
            r.status,
            r.model_name,
            r.error_message
          from garimpa.triage_run r
          left join lateral (
            select
              count(*) filter (where actor_type = 'llm')::int as llm_count,
              count(*) filter (where actor_type = 'rule')::int as rule_count,
              mode() within group (order by coalesce(reason_code, 'none')) as top_reason
            from garimpa.curation_event e
            where e.triage_run_id = r.id
          ) ev on true
          where r.tenant_id = ${tenantId}
        ),
        legacy_batches as (
          select
            'legacy_' || to_char(date_trunc('minute', created_at), 'YYYYMMDD_HH24MI') as batch_id,
            date_trunc('minute', created_at) as run_time,
            count(*)::int as total_items,
            count(*) filter (where to_status = 'approved')::int as approved,
            count(*) filter (where to_status = 'rejected')::int as rejected,
            count(*) filter (where to_status = 'held')::int as held,
            count(*) filter (where actor_type = 'llm')::int as llm_count,
            count(*) filter (where actor_type = 'rule')::int as rule_count,
            mode() within group (order by coalesce(reason_code, 'none')) as top_reason,
            'ok'::varchar(32) as status,
            null::varchar(64) as model_name,
            null::text as error_message
          from garimpa.curation_event
          where actor_type in ('rule', 'llm')
            and tenant_id = ${tenantId}
            and triage_run_id is null
          group by date_trunc('minute', created_at)
        )
        select * from run_batches
        union all
        select * from legacy_batches
        order by run_time desc
        limit ${Math.min(Math.max(limit, 1), 50)}
      `;

      return rows.map((r) => ({
        batchId: r.batch_id,
        runTime: new Date(r.run_time).toISOString(),
        totalItems: Number(r.total_items),
        approved: Number(r.approved),
        rejected: Number(r.rejected),
        held: Number(r.held),
        llmCount: Number(r.llm_count),
        ruleCount: Number(r.rule_count),
        topReason: r.top_reason ?? "none",
        status: r.status,
        modelName: r.model_name,
        errorMessage: r.status === "error" ? automatedTriageFailureMessage(r.error_message) : null,
      }));
    } catch {
      return [];
    }
  }, sqlFactory);
}

export interface TriageBatchItem {
  id: string;
  productId: string;
  title: string;
  imageUrl: string | null;
  productUrl: string | null;
  marketplace: string;
  priceCents: number;
  status: "approved" | "rejected" | "held" | "pending";
  actorType: "rule" | "llm" | "human";
  reasonCode: string | null;
  reasonDetail: string | null;
  aiScore?: number | null;
  editorialCategory?: string | null;
  rationale: string;
  createdAt: string;
}

/**
 * Busca todos os produtos avaliados em um lote específico de triagem para inspeção no modal.
 * Aceita tanto UUID de triage_run quanto timestamp de execução legada.
 */
export async function getTriageBatchItems(
  batchIdOrMinute: string,
  tenantId = scopedTenantId(),
  sqlFactory: typeof db = db,
): Promise<TriageBatchItem[]> {
  if (!process.env.DATABASE_URL) return [];

  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(batchIdOrMinute);

  return await withTenantDb(tenantId, async (sql) => {
    try {
      const rows = await sql<{
        id: string;
        product_id: string;
        to_status: "approved" | "rejected" | "held" | "pending";
        reason_code: string | null;
        reason_detail: string | null;
        actor_type: "rule" | "llm" | "human";
        created_at: Date | string;
        metadata: Record<string, unknown>;
        title: string;
        image_url: string | null;
        product_url: string | null;
        marketplace: string;
        price_cents: number;
      }[]>`
        select
          e.id,
          e.product_id,
          e.to_status,
          e.reason_code,
          e.reason_detail,
          e.actor_type,
          e.created_at,
          e.metadata,
          coalesce(p.title, (e.metadata->'snapshot'->>'title'), 'Produto') as title,
          coalesce(p.image_url, (e.metadata->'snapshot'->>'imageUrl')) as image_url,
          coalesce(p.product_url, (e.metadata->'snapshot'->>'productUrl')) as product_url,
          coalesce(p.marketplace, (e.metadata->'snapshot'->>'marketplace'), 'geral') as marketplace,
          coalesce((e.metadata->'snapshot'->>'priceCents')::int, 0) as price_cents
        from garimpa.curation_event e
        left join garimpa.product p on p.id = e.product_id and p.tenant_id = e.tenant_id
        where e.actor_type in ('rule', 'llm')
          and e.tenant_id = ${tenantId}
          and (
            (${isUuid} and e.triage_run_id = ${isUuid ? batchIdOrMinute : null}::uuid)
            or
            (not ${isUuid} and date_trunc('minute', e.created_at) = ${!isUuid && !isNaN(new Date(batchIdOrMinute).getTime()) ? new Date(batchIdOrMinute) : new Date(0)})
          )
        order by e.id desc
        limit 200
      `;

      return rows.map((r) => {
        const auto = (r.metadata?.automation as Record<string, unknown>) ?? {};
        const rationale =
          typeof auto.rationale === "string"
            ? auto.rationale
            : typeof auto.aiJustification === "string"
            ? auto.aiJustification
            : r.reason_detail ?? "Sem justificativa registrada";

        return {
          id: r.id,
          productId: r.product_id,
          title: r.title,
          imageUrl: r.image_url,
          productUrl: r.product_url,
          marketplace: r.marketplace,
          priceCents: r.price_cents,
          status: r.to_status,
          actorType: r.actor_type,
          reasonCode: r.reason_code,
          reasonDetail: r.reason_detail,
          aiScore: typeof auto.aiScore === "number" ? auto.aiScore : null,
          editorialCategory: typeof auto.editorialCategory === "string" ? auto.editorialCategory : null,
          rationale,
          createdAt: new Date(r.created_at).toISOString(),
        };
      });
    } catch {
      return [];
    }
  }, sqlFactory);
}
