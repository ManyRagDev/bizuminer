/** Read-only by default. --execute only closes expired operation records; never captures or calls AI. */
import { captureBatches } from "../lib/capture-batch-db.ts";
const before = await captureBatches.read();
const expiredIds = process.argv.includes("--execute")
  ? await captureBatches.expire()
  : [];
const after = await captureBatches.read();
console.log(
  JSON.stringify(
    {
      mode: process.argv.includes("--execute") ? "execute" : "read-only",
      before: before
        ? { id: before.id, status: before.status, startedAt: before.started_at }
        : null,
      expiredIds,
      after: after
        ? {
            id: after.id,
            status: after.status,
            finishedAt: after.finished_at,
            error: after.metadata.execution?.error,
          }
        : null,
    },
    null,
    2,
  ),
);
