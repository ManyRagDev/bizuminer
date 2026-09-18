import { db } from "./db.ts";
import { productSlug } from "./marketplaces.ts";

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
  decision: "approved" | "rejected" | "held";
  reasonCode: string | null;
  reasonDetail: string | null;
  rationale?: string;
  priceFormatted?: string;
  createdAt: string;
}

export interface SpotCheckProduct {
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

export const DEFAULT_GUIDELINE =
  "Foco em utilidades práticas de casa, cozinha, gadgets inteligentes e presentes criativos com alto apelo visual e compra por impulso. Evitar peças industriais, ferramentas secas, insumos de reposição e itens de nicho ultra-específico.";

export async function getEditorialGuideline(tenantId = "local"): Promise<EditorialGuidelineConfig> {
  if (!process.env.DATABASE_URL) {
    return {
      tenantId,
      guideline: DEFAULT_GUIDELINE,
      autoPublish: false,
      minScoreAutoPublish: 4,
      updatedAt: new Date().toISOString(),
    };
  }

  const sql = db();
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

    return {
      tenantId,
      guideline: DEFAULT_GUIDELINE,
      autoPublish: false,
      minScoreAutoPublish: 4,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      tenantId,
      guideline: DEFAULT_GUIDELINE,
      autoPublish: false,
      minScoreAutoPublish: 4,
      updatedAt: new Date().toISOString(),
    };
  } finally {
    await sql.end();
  }
}

export async function saveEditorialGuideline(
  tenantId = "local",
  guideline: string,
  autoPublish: boolean,
  minScore = 4,
): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;

  const sql = db();
  try {
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
  } finally {
    await sql.end();
  }
}

/**
 * Carrega as decisões humanas mais recentes com justificativa ou aprovação explícita.
 * Esses itens funcionam como exemplos Few-Shot dinâmicos injetados no Gemini 2.5 Flash.
 */
export async function getGoldenExamples(tenantId = "local", limit = 6): Promise<GoldenExample[]> {
  if (!process.env.DATABASE_URL) return [];

  const sql = db();
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
          coalesce(p.title, (e.metadata->'snapshot'->>'title'), 'Produto') as title,
          e.to_status,
          e.reason_code,
          e.reason_detail,
          e.metadata,
          e.created_at,
          coalesce(latest_price.price_cents, (e.metadata->'snapshot'->>'priceCents')::int) as price_cents
        from garimpa.curation_event e
        left join garimpa.product p on p.id = e.product_id and p.tenant_id = e.tenant_id
        left join lateral (
          select price_cents from garimpa.price_observation o
          where o.product_id = e.product_id and o.tenant_id = e.tenant_id
          order by observed_at desc limit 1
        ) latest_price on true
        where e.tenant_id = ${tenantId}
          and e.actor_type = 'human'
        order by e.product_id, e.id desc
      )
      select * from latest_events
      order by created_at desc
      limit ${Math.min(Math.max(limit, 1), 20)}
    `;

    return rows.map((r) => {
      const snapshot = r.metadata?.snapshot as Record<string, unknown> | undefined;
      const priceCents = r.price_cents ?? (typeof snapshot?.priceCents === "number" ? snapshot.priceCents : null);
      return {
        productId: r.product_id,
        title: r.title,
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
  } finally {
    await sql.end();
  }
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
  tenantId = "local",
  limit = 12,
): Promise<SpotCheckProduct[]> {
  if (!process.env.DATABASE_URL) return [];

  const sql = db();
  try {
    const rows = await sql<{
      id: string;
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
        p.id,
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
        and latest.actor_type = 'llm'
        and latest.to_status = 'approved'
      order by latest.id desc
      limit ${Math.min(Math.max(limit, 1), 30)}
    `;

    return rows.map((r) => {
      const auto = (r.metadata?.automation as Record<string, unknown>) ?? {};
      return {
        id: r.id,
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
  } finally {
    await sql.end();
  }
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
  tenantId = "local",
): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;

  const sql = db();
  try {
    return await sql.begin(async (tx) => {
      const current = await tx<{ status: string }[]>`
        select status from garimpa.product_curation
        where tenant_id = ${tenantId} and product_id = ${productId}
        for update
      `;
      if (!current[0]) return false;

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
          ${reviewerAppUserId}, ${sql.json({ spotCheckConfirm: true })}
        )
      `;

      return true;
    });
  } catch {
    return false;
  } finally {
    await sql.end();
  }
}

/**
 * Ação de Spot-Check "Descartar": desaprova um produto auto-publicado e grava
 * o motivo para calibração da IA.
 */
export async function rejectAndLearnSpotCheck(
  productId: string,
  feedback: string,
  reviewerAppUserId: string,
  tenantId = "local",
): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;

  const sql = db();
  try {
    return await sql.begin(async (tx) => {
      const current = await tx<{ status: string }[]>`
        select status from garimpa.product_curation
        where tenant_id = ${tenantId} and product_id = ${productId}
        for update
      `;
      if (!current[0]) return false;

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
          ${sql.json({ spotCheckReject: true, feedback: reasonDetail })}
        )
      `;

      return true;
    });
  } catch {
    return false;
  } finally {
    await sql.end();
  }
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
}

export interface SystemOperationalPulse {
  isCaptureRunning: boolean;
  runningMarketplace: string | null;
  lastCaptureAt: string | null;
  lastCaptureMarketplace: string | null;
  lastCaptureNewItems: number;
  lastCaptureStatus: "ok" | "error" | null;
  lastTriageAt: string | null;
  lastTriageTotal: number;
  lastTriageApproved: number;
  lastTriageHeld: number;
  pendingCount: number;
}

/**
 * Retorna os lotes de triagem automatizada mais recentes (com ID persistido ou agrupados).
 */
export async function getTriageBatchesHistory(
  tenantId = "local",
  limit = 8,
): Promise<TriageBatchHistory[]> {
  if (!process.env.DATABASE_URL) return [];

  const sql = db();
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
          r.model_name
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
          null::varchar(64) as model_name
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
    }));
  } catch {
    return [];
  } finally {
    await sql.end();
  }
}

/**
 * Retorna o "pulso" em tempo real do sistema: estado da ingestão, última triagem e volume de pendências.
 */
export async function getOperationalPulse(
  tenantId = "local",
): Promise<SystemOperationalPulse> {
  if (!process.env.DATABASE_URL) {
    return {
      isCaptureRunning: false,
      runningMarketplace: null,
      lastCaptureAt: null,
      lastCaptureMarketplace: null,
      lastCaptureNewItems: 0,
      lastCaptureStatus: null,
      lastTriageAt: null,
      lastTriageTotal: 0,
      lastTriageApproved: 0,
      lastTriageHeld: 0,
      pendingCount: 0,
    };
  }

  const sql = db();
  try {
    const [runningRuns, lastRuns, triageRuns, legacyTriage, pending] = await Promise.all([
      sql<{ marketplace: string }[]>`
        select marketplace from garimpa.capture_run
        where tenant_id = ${tenantId} and status = 'running'
        order by started_at desc limit 1
      `,
      sql<{
        marketplace: string;
        finished_at: Date | string | null;
        items_new: number;
        status: "ok" | "error";
      }[]>`
        select marketplace, finished_at, items_new, status
        from garimpa.capture_run
        where tenant_id = ${tenantId} and status in ('ok', 'error')
        order by finished_at desc nulls last, started_at desc limit 1
      `,
      sql<{
        run_time: Date | string;
        total: number;
        approved: number;
        held: number;
      }[]>`
        select
          started_at as run_time,
          total_input as total,
          approved_count as approved,
          held_count as held
        from garimpa.triage_run
        where tenant_id = ${tenantId} and status in ('ok', 'running')
        order by started_at desc limit 1
      `,
      sql<{
        run_time: Date | string;
        total: number;
        approved: number;
        held: number;
      }[]>`
        select
          date_trunc('minute', created_at) as run_time,
          count(*)::int as total,
          count(*) filter (where to_status = 'approved')::int as approved,
          count(*) filter (where to_status = 'held')::int as held
        from garimpa.curation_event
        where actor_type in ('rule', 'llm') and tenant_id = ${tenantId}
        group by date_trunc('minute', created_at)
        order by run_time desc limit 1
      `,
      sql<{ count: number }[]>`
        select count(*)::int as count
        from garimpa.product_curation
        where tenant_id = ${tenantId} and status = 'pending'
      `,
    ]);

    const activeCapture = runningRuns[0];
    const latestCapture = lastRuns[0];
    const latestTriage = triageRuns[0] ?? legacyTriage[0];
    const pendingTotal = pending[0]?.count ?? 0;

    return {
      isCaptureRunning: Boolean(activeCapture),
      runningMarketplace: activeCapture?.marketplace ?? null,
      lastCaptureAt: latestCapture?.finished_at ? new Date(latestCapture.finished_at).toISOString() : null,
      lastCaptureMarketplace: latestCapture?.marketplace ?? null,
      lastCaptureNewItems: latestCapture?.items_new ?? 0,
      lastCaptureStatus: latestCapture?.status ?? null,
      lastTriageAt: latestTriage?.run_time ? new Date(latestTriage.run_time).toISOString() : null,
      lastTriageTotal: latestTriage?.total ?? 0,
      lastTriageApproved: latestTriage?.approved ?? 0,
      lastTriageHeld: latestTriage?.held ?? 0,
      pendingCount: pendingTotal,
    };
  } catch {
    return {
      isCaptureRunning: false,
      runningMarketplace: null,
      lastCaptureAt: null,
      lastCaptureMarketplace: null,
      lastCaptureNewItems: 0,
      lastCaptureStatus: null,
      lastTriageAt: null,
      lastTriageTotal: 0,
      lastTriageApproved: 0,
      lastTriageHeld: 0,
      pendingCount: 0,
    };
  } finally {
    await sql.end();
  }
}

export interface TriageBatchItem {
  id: string;
  productId: string;
  title: string;
  imageUrl: string | null;
  productUrl: string | null;
  marketplace: string;
  priceCents: number;
  status: "approved" | "rejected" | "held";
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
  tenantId = "local",
): Promise<TriageBatchItem[]> {
  if (!process.env.DATABASE_URL) return [];

  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(batchIdOrMinute);

  const sql = db();
  try {
    const rows = await sql<{
      id: string;
      product_id: string;
      to_status: "approved" | "rejected" | "held";
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
  } finally {
    await sql.end();
  }
}


