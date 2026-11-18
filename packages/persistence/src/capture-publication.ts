import type { Sql } from "postgres";
import { withMonitoringDb } from "./monitoring-db.ts";

export type CapturePublication = { publishedAt: string; policy: "complete-operation-v1"; observations: number };
/** Provider calls and triage are deliberately outside this short atomic commit. */
export async function publishCaptureBatch(sql: Sql, tenantId: string, batchId: string, workerId: string): Promise<CapturePublication> {
  return withMonitoringDb(sql, tenantId, async tx => {
    const [row] = await tx<{ publication: CapturePublication }[]>`
      select garimpa.publish_capture_batch(${tenantId},${batchId}::uuid,${workerId}) as publication`;
    if (!row) throw new Error("capture_publication_missing");
    return row.publication;
  });
}

export type SourceCapturePublication = { publishedAt: string; policy: "per-source-v2"; marketplace: string; observations: number };
export async function publishCaptureSource(sql: Sql, tenantId: string, batchId: string, workerId: string, marketplace: string): Promise<SourceCapturePublication> {
  return withMonitoringDb(sql, tenantId, async tx => {
    const [row] = await tx<{ publication: SourceCapturePublication }[]>`
      select garimpa.publish_capture_source(${tenantId},${batchId}::uuid,${workerId},${marketplace}) as publication`;
    if (!row) throw new Error("capture_publication_missing");
    return row.publication;
  });
}
