/** Somente leitura: consulta a política nova sem executar IA ou alterar decisões.
 * Uso em packages/web: node --env-file=.env.local --experimental-strip-types bin/inspect-triage-value.mjs
 */
import postgres from "postgres";
import { loadAutomatedTriageCandidates } from "../lib/triage-candidates-db.ts";
import { evaluateTriageValue, TRIAGE_VALUE_POLICY_VERSION } from "../lib/triage-value-policy.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente");
const sql = postgres(process.env.DATABASE_URL, {
  prepare: false, max: 1, connect_timeout: 10,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});
try {
  const report = await sql.begin("isolation level repeatable read read only", async (tx) => {
    await tx`set local statement_timeout = '20000ms'`;
    const candidates = await loadAutomatedTriageCandidates(tx, "local", 200);
    const outcomes = {};
    for (const candidate of candidates) {
      const { outcome } = evaluateTriageValue(candidate.priceCents, candidate.comparablePriceHistory);
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    }
    const coverage = await tx`
      select c.status, count(*)::int as products,
        count(*) filter (where latest.price_cents<2000)::int as below_value_floor,
        count(*) filter (where jsonb_typeof(latest.offer_evidence->'variantKey')='string'
          and nullif(btrim(latest.offer_evidence->>'variantKey'),'') is not null)::int as identified_configurations
      from garimpa.product p
      join garimpa.product_curation c on c.tenant_id=p.tenant_id and c.product_id=p.id
      join lateral (select o.price_cents,o.offer_evidence from garimpa.price_observation o
        where o.tenant_id=p.tenant_id and o.product_id=p.id
        order by o.observed_at desc,o.id desc limit 1) latest on true
      where p.tenant_id='local' and c.status in ('pending','held')
        and p.last_seen_at>=now()-interval '7 days'
      group by c.status order by c.status
    `;
    return { checkedAt: new Date().toISOString(), readOnly: true, policyVersion: TRIAGE_VALUE_POLICY_VERSION,
      candidateLimit: 200, returnedCandidates: candidates.length, candidateOutcomes: outcomes,
      recoveredAutomaticPriceHolds: candidates.filter((candidate) => candidate.inputVersion.status === "held").length,
      freshQueueCoverage: coverage };
  });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(JSON.stringify({ errorName: error.name, errorCode: error.code ?? null,
    errorMessage: String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]") }));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
