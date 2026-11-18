import { db } from "./db.ts";

export type CurationCallReservation = "reserved" | "limit_reached" | "not_configured";

/** Deployment-wide cost control; no tenant data or key material is read or returned. */
export async function reserveCurationProviderCall(
  fingerprint: string, requestId: string, model: string, kind: "legacy" | "attributes",
): Promise<CurationCallReservation> {
  const sql = db();
  try {
    // Commit the reservation before contacting the provider. An uncertain DB
    // result consumes a possible slot and never authorizes a provider request.
    return await sql.begin(async tx => {
      const [row] = await tx<{ result: CurationCallReservation }[]>`
        select garimpa.reserve_curation_provider_call(${fingerprint},${requestId}::uuid,${model},${kind}) as result`;
      if (!row || !["reserved", "limit_reached", "not_configured"].includes(row.result))
        throw new Error("ai_curation_call_budget_unavailable");
      return row.result;
    }) as CurationCallReservation;
  } finally { await sql.end(); }
}
