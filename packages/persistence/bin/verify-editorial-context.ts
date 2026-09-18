/**
 * EvidÃªncia derivada do contexto editorial (M4-D), somente leitura.
 *
 * Confere contra o banco:
 *   1. presenÃ§a do schema (colunas de famÃ­lia, deferred_until, ids de lote e
 *      a view de fatos) â€” antes da migration, responde `awaiting_migration`;
 *   2. integridade da famÃ­lia no catÃ¡logo (par key/label/mÃ©todo/versÃ£o);
 *   3. snapshot obrigatÃ³rio: decisÃµes humanas novas (apÃ³s o primeiro evento
 *      com snapshot) sem `snapshot_version` ou sem o objeto `snapshot`;
 *   4. integridade de grupo/lote: um mesmo `bulk_action_id` ou `group_id`
 *      nunca atravessa tenants;
 *   5. adiamentos ("Depois") nunca aplicados a status final decidido.
 */

import postgres from "postgres";
import { summarizeSnapshotEvidence } from "../src/editorial-context-verification.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL ausente");

const sql = postgres(connectionString, {
  prepare: false,
  max: 1,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function runVerification(sql: postgres.Sql): Promise<void> {
  const [familyRow] = await sql<{
    products: number;
    with_family: number;
    without_family: number;
    broken_pairs: number;
  }[]>`
    select
      count(*)::int as products,
      count(*) filter (where family_key is not null)::int as with_family,
      count(*) filter (where family_key is null)::int as without_family,
      count(*) filter (
        where (family_key is null)::int + (family_label is null)::int
            + (family_method is null)::int + (family_version is null)::int
          not in (0, 4)
      )::int as broken_pairs
    from garimpa.product
  `;
  const family = familyRow ?? { products: 0, with_family: 0, without_family: 0, broken_pairs: 0 };

  const [watermark] = await sql<{ first_snapshot_at: Date | null }[]>`
    select min(created_at) as first_snapshot_at
    from garimpa.curation_event
    where metadata ? 'snapshot_version'
  `;

  const missingSnapshot = watermark?.first_snapshot_at
    ? await sql<{ id: string; product_id: string; created_at: Date }[]>`
        select id::text as id, product_id, created_at
        from garimpa.curation_event
        where actor_type = 'human'
          and created_at >= ${watermark.first_snapshot_at}
          and not (metadata ? 'snapshot_version')
        order by created_at
      `
    : [];

  const malformedSnapshot = watermark?.first_snapshot_at
    ? await sql<{ id: string; product_id: string }[]>`
        select id::text as id, product_id
        from garimpa.curation_event
        where actor_type = 'human'
          and created_at >= ${watermark.first_snapshot_at}
          and metadata ? 'snapshot_version'
          and (
            jsonb_typeof(metadata -> 'snapshot_version') is distinct from 'number'
            or metadata ->> 'snapshot_version' <> '1'
            or jsonb_typeof(metadata -> 'snapshot') is distinct from 'object'
            or not ((metadata -> 'snapshot') ?& array[
              'productId', 'slug', 'marketplace', 'externalId', 'title',
              'productUrl', 'imageUrl', 'category', 'family', 'statusBefore',
              'priceCents', 'originalPriceCents', 'claimedDiscountRate',
              'ratingStar', 'salesLabel', 'salesCount', 'observedAt',
              'observationCount', 'historyDays', 'previousMinPriceCents',
              'lowestVerified', 'signalsShown', 'provenance', 'action'
            ])
            or jsonb_typeof(metadata -> 'snapshot' -> 'title') is distinct from 'string'
            or jsonb_typeof(metadata -> 'snapshot' -> 'priceCents') is distinct from 'number'
            or jsonb_typeof(metadata -> 'snapshot' -> 'observationCount') is distinct from 'number'
            or jsonb_typeof(metadata -> 'snapshot' -> 'historyDays') is distinct from 'number'
            or jsonb_typeof(metadata -> 'snapshot' -> 'lowestVerified') is distinct from 'boolean'
            or jsonb_typeof(metadata -> 'snapshot' -> 'signalsShown') is distinct from 'array'
            or jsonb_typeof(metadata -> 'snapshot' -> 'provenance') is distinct from 'object'
            or jsonb_typeof(metadata -> 'snapshot' -> 'action') is distinct from 'object'
            or jsonb_typeof(metadata -> 'snapshot' -> 'imageUrl') not in ('string', 'null')
          )
      `
    : [];

  const bulkCrossTenant = await sql<{ bulk_action_id: string; tenants: number }[]>`
    select bulk_action_id, count(distinct tenant_id)::int as tenants
    from garimpa.curation_event
    where bulk_action_id is not null
    group by bulk_action_id
    having count(distinct tenant_id) > 1
  `;

  const groupCrossTenant = await sql<{ group_id: string; tenants: number }[]>`
    select group_id, count(distinct tenant_id)::int as tenants
    from garimpa.curation_event
    where group_id is not null
    group by group_id
    having count(distinct tenant_id) > 1
  `;

  const deferredOnDecided = await sql<{ product_id: string }[]>`
    select product_id
    from garimpa.product_curation
    where deferred_until is not null
      and status in ('approved', 'rejected')
  `;

  const snapshotEvidence = summarizeSnapshotEvidence(
    watermark?.first_snapshot_at,
    missingSnapshot.length,
    malformedSnapshot.length,
  );
  const report = {
    verifiedAt: new Date().toISOString(),
    status: snapshotEvidence.status,
    family,
    snapshot: {
      firstSnapshotAt: watermark?.first_snapshot_at ?? null,
      missingSnapshotCount: missingSnapshot.length,
      missingSnapshot,
      malformedSnapshotCount: malformedSnapshot.length,
      malformedSnapshot,
      evidencePresent: snapshotEvidence.evidencePresent,
      ok: snapshotEvidence.ok,
    },
    groups: {
      bulkCrossTenantCount: bulkCrossTenant.length,
      bulkCrossTenant,
      groupCrossTenantCount: groupCrossTenant.length,
      groupCrossTenant,
      ok: bulkCrossTenant.length === 0 && groupCrossTenant.length === 0,
    },
    deferrals: {
      deferredOnDecidedCount: deferredOnDecided.length,
      deferredOnDecided,
      ok: deferredOnDecided.length === 0,
    },
    ok: true,
  };

  report.ok =
    family.broken_pairs === 0 &&
    report.snapshot.ok &&
    report.groups.ok &&
    report.deferrals.ok;

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

try {
  const [schema] = await sql<{
    family_cols: string | null;
    deferred_col: string | null;
    event_cols: string | null;
    facts_view: string | null;
    deferred_status_check: string | null;
    family_presence_check: string | null;
  }[]>`
    select
      (select string_agg(column_name, ',' order by column_name)
       from information_schema.columns
       where table_schema = 'garimpa' and table_name = 'product'
         and column_name in ('family_key', 'family_label', 'family_method', 'family_version')) as family_cols,
      (select column_name from information_schema.columns
       where table_schema = 'garimpa' and table_name = 'product_curation'
         and column_name = 'deferred_until') as deferred_col,
      (select string_agg(column_name, ',' order by column_name)
       from information_schema.columns
       where table_schema = 'garimpa' and table_name = 'curation_event'
          and column_name in (
            'group_id', 'review_session_id', 'bulk_action_id',
            'from_reason_code', 'from_reason_detail', 'from_deferred_until'
          )) as event_cols,
      to_regclass('garimpa.curation_queue_facts')::text as facts_view,
      (select conname from pg_constraint
       where conrelid = 'garimpa.product_curation'::regclass
         and conname = 'product_curation_deferred_status_check') as deferred_status_check,
      (select conname from pg_constraint
       where conrelid = 'garimpa.product'::regclass
         and conname = 'product_family_presence_check') as family_presence_check
  `;

  const migrationApplied =
    schema?.family_cols === "family_key,family_label,family_method,family_version" &&
    schema?.deferred_col === "deferred_until" &&
    schema?.event_cols === "bulk_action_id,from_deferred_until,from_reason_code,from_reason_detail,group_id,review_session_id" &&
    schema?.facts_view === "garimpa.curation_queue_facts" &&
    schema?.deferred_status_check === "product_curation_deferred_status_check" &&
    schema?.family_presence_check === "product_family_presence_check";

  if (!migrationApplied) {
    console.log(
      JSON.stringify(
        {
          verifiedAt: new Date().toISOString(),
          status: "awaiting_migration",
          schema: {
            familyCols: schema?.family_cols ?? null,
            deferredCol: schema?.deferred_col ?? null,
            eventCols: schema?.event_cols ?? null,
            factsView: schema?.facts_view ?? null,
            deferredStatusCheck: schema?.deferred_status_check ?? null,
            familyPresenceCheck: schema?.family_presence_check ?? null,
          },
          ok: false,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } else {
    await runVerification(sql);
  }
} finally {
  await sql.end();
}
