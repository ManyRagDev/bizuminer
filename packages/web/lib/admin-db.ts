import { db } from "./db";

/**
 * Painel administrativo: leitura agregada de tudo que o app registra.
 * Nenhuma escrita acontece aqui — acionar rodagem é responsabilidade da rota
 * /api/admin/rodagem, e quem grava capture_run é o próprio sweep.
 */

export interface CaptureRunRow {
  id: string;
  marketplace: string;
  status: "running" | "ok" | "error";
  started_at: Date | string;
  finished_at: Date | string | null;
  items_captured: number;
  items_new: number;
  price_changes: number;
  error: string | null;
  collector_run_id: string | null;
  observation_count: number;
}

export interface AdminOverview {
  products: number;
  observations: number;
  runs: number;
  clicks7d: number;
  publications: number;
  subscribers: number;
  members: number;
  favorites: number;
  activeWatches: number;
  profiles: number;
  lastOkRunAt: Date | string | null;
}

export interface TopClickedRow {
  title: string;
  slug: string;
  clicks: number;
}

export async function adminOverview(tenantId = "local"): Promise<AdminOverview> {
  const sql = db();
  try {
    const rows = await sql<Array<Record<string, number | Date | string | null>>>`
      select
        (select count(*)::int from garimpa.product where tenant_id = ${tenantId}) as products,
        (select count(*)::int from garimpa.price_observation where tenant_id = ${tenantId}) as observations,
        (select count(*)::int from garimpa.capture_run where tenant_id = ${tenantId}) as runs,
        (select count(*)::int from garimpa.click_event c
          join garimpa.publication pub on pub.id = c.publication_id
          where pub.tenant_id = ${tenantId} and c.clicked_at >= now() - interval '7 days') as clicks_7d,
        (select count(*)::int from garimpa.publication where tenant_id = ${tenantId}) as publications,
        (select count(*)::int from garimpa.subscriber where tenant_id = ${tenantId}) as subscribers,
        (select count(*)::int from garimpa.app_user where tenant_id = ${tenantId}) as members,
        (select count(*)::int from garimpa.favorite where tenant_id = ${tenantId}) as favorites,
        (select count(*)::int from garimpa.price_watch where tenant_id = ${tenantId} and active) as active_watches,
        (select count(*)::int from garimpa.buyer_profile where tenant_id = ${tenantId}) as profiles,
        (select max(finished_at) from garimpa.capture_run
          where tenant_id = ${tenantId} and status = 'ok') as last_ok_run_at
    `;
    const row = rows[0];
    return {
      products: row.products as number,
      observations: row.observations as number,
      runs: row.runs as number,
      clicks7d: row.clicks_7d as number,
      publications: row.publications as number,
      subscribers: row.subscribers as number,
      members: row.members as number,
      favorites: row.favorites as number,
      activeWatches: row.active_watches as number,
      profiles: row.profiles as number,
      lastOkRunAt: row.last_ok_run_at as Date | string | null,
    };
  } finally {
    await sql.end();
  }
}

export async function captureRuns(limit = 20, tenantId = "local", marketplace?: string): Promise<CaptureRunRow[]> {
  const sql = db();
  try {
    return await sql<CaptureRunRow[]>`
      select cr.id, cr.marketplace, cr.status, cr.started_at, cr.finished_at,
             cr.items_captured, cr.items_new, cr.price_changes, cr.error,
             cr.collector_run_id,
             (select count(*)::int from garimpa.price_observation o
               where o.capture_run_id = cr.id) as observation_count
      from garimpa.capture_run cr
      where cr.tenant_id = ${tenantId}
        and (${marketplace ?? null}::text is null or cr.marketplace = ${marketplace ?? null})
      order by cr.started_at desc
      limit ${Math.min(Math.max(limit, 1), 100)}
    `;
  } finally {
    await sql.end();
  }
}

/**
 * Rodagem em andamento (janela de 30 min): trava de concorrência do acionador.
 * Um `running` mais velho que isso é processo morto que não fechou o registro —
 * não deve travar o painel para sempre, mas aparece na tabela como está.
 */
/**
 * `marketplace` opcional filtra a trava de concorrência por plataforma —
 * uma rodagem do ML em andamento não deve bloquear o disparo da Shopee.
 * Sem filtro, devolve a rodagem em andamento de qualquer plataforma (usado
 * pela visão geral do painel).
 */
export async function runningRun(tenantId = "local", marketplace?: string): Promise<CaptureRunRow | null> {
  const sql = db();
  try {
    const rows = await sql<CaptureRunRow[]>`
      select cr.id, cr.marketplace, cr.status, cr.started_at, cr.finished_at,
             cr.items_captured, cr.items_new, cr.price_changes, cr.error,
             cr.collector_run_id, 0 as observation_count
      from garimpa.capture_run cr
      where cr.tenant_id = ${tenantId}
        and cr.status = 'running'
        and cr.started_at >= now() - interval '30 minutes'
        and (${marketplace ?? null}::text is null or cr.marketplace = ${marketplace ?? null})
      order by cr.started_at desc
      limit 1
    `;
    return rows[0] ?? null;
  } finally {
    await sql.end();
  }
}

export async function topClicked(days = 7, limit = 6, tenantId = "local"): Promise<TopClickedRow[]> {
  const sql = db();
  try {
    return await sql<TopClickedRow[]>`
      select p.title, pub.slug, count(c.id)::int as clicks
      from garimpa.click_event c
      join garimpa.publication pub on pub.id = c.publication_id
      join garimpa.product p on p.id = pub.product_id
      where pub.tenant_id = ${tenantId}
        and c.clicked_at >= now() - make_interval(days => ${Math.min(Math.max(days, 1), 90)})
      group by p.title, pub.slug
      order by clicks desc
      limit ${Math.min(Math.max(limit, 1), 20)}
    `;
  } finally {
    await sql.end();
  }
}
