import postgres from "postgres";

type Decision = {
  status: "held" | "rejected";
  reason: "family_saturation" | "audience_mismatch" | "misleading_claim" | "insufficient_evidence" | "weak_offer";
  rationale: string;
};

type QueueFact = {
  id: string;
  external_id: string;
  title: string;
  product_url: string;
  image_url: string | null;
  category: string | null;
  family_key: string | null;
  family_label: string | null;
  family_method: string | null;
  family_version: string | null;
  marketplace: string;
  status: string;
  price_cents: number;
  original_price_cents: number | null;
  claimed_discount_rate: number | null;
  rating_star: number | null;
  sales_label: string | null;
  sales_count: number | null;
  observed_at: Date | string;
  observation_count: number;
  history_days: number;
  previous_min_price_cents: number | null;
  lowest_verified: boolean;
  presenting_capture_run_id: string | null;
  presenting_marketplace: string | null;
  presenting_plan_id: string | null;
  presenting_query_id: string | null;
  presenting_mode: string | null;
  presenting_target_category: string | null;
  presenting_target_family: string | null;
  last_seen_at: Date | string;
};

const APPLY = process.argv.includes("--apply");
const TENANT_ID = "local";
const POLICY_VERSION = "bootstrap-clean-v1";

// Representantes mantidos deliberadamente para não transformar saturação em
// proibição de categoria: dois de unhas e dois de moto, escolhidos por sinais
// de procura/preço dentro da amostra disponível em 06/09/2026.
const SATURATION_REPRESENTATIVES = new Set([
  "be1472c0-7d96-42de-a1e4-c88535f0d4e4",
  "2b90cc10-0738-4d16-b486-5c9876fb2e44",
  "4ebfaae0-e061-46f2-9c1c-8dad94e2e20f",
  "2c08ac38-9b2a-450e-ba28-4dc96a0f72f5",
]);

const EXPLICIT_DECISIONS = new Map<string, Decision>([
  ["5da5440f-3d77-49f4-91e9-b29b9b007568", { status: "rejected", reason: "misleading_claim", rationale: "Especificação 26V/48V e preço incompatível pedem exclusão por promessa duvidosa." }],
  ["14f9ca46-72c4-46e1-af6d-2a342fb07189", { status: "rejected", reason: "misleading_claim", rationale: "Especificação genérica 48V sem evidência suficiente é promessa duvidosa." }],
  ["3a39fd02-c0e2-477b-a3e9-a72d17755393", { status: "held", reason: "insufficient_evidence", rationale: "Desconto de 86% em kit de marca exige evidência adicional." }],
  ["2d0d81e9-7dc0-4d4c-bcb4-ae23b09af897", { status: "held", reason: "weak_offer", rationale: "Poucas vendas e desconto pequeno não sustentam vantagem." }],
  ["7796a2db-c770-47ee-b9ee-a4868ddca2cf", { status: "held", reason: "weak_offer", rationale: "Poucas vendas e nenhuma vantagem de preço declarada." }],
  ["ef486941-88a5-4094-b3ac-448ea93395f4", { status: "held", reason: "weak_offer", rationale: "Uma observação e nenhuma vantagem de preço declarada." }],
  ["7f6ce37b-5367-4fab-b65a-7178e03090ae", { status: "held", reason: "weak_offer", rationale: "Uma observação e volume de vendas muito baixo." }],
]);

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function decisionFor(row: QueueFact): Decision | null {
  if (SATURATION_REPRESENTATIVES.has(row.id)) return null;
  const explicit = EXPLICIT_DECISIONS.get(row.id);
  if (explicit) return explicit;
  const title = normalized(row.title);

  if (/unhas posticas|adesivos? de unha|gel.{0,35}unha|unha.{0,35}gel|nail art|esmalte|manicure|pinceis de unha|molde.{0,20}unha|dicas de unhas/.test(title)) {
    return { status: "held", reason: "family_saturation", rationale: "Família de unhas/manicure saturada; somente representantes fortes permanecem." };
  }
  if (/motocic|guidao|nmax|x-adv|hornet|bandit|scrambler|\byzf|\bmt0[79]|trident 660|gold wing/.test(title)) {
    return { status: "held", reason: "family_saturation", rationale: "Família de acessórios de moto saturada; somente representantes fortes permanecem." };
  }
  if (/piercing|argolas?|brincos?|joias?|aneis?|anel /.test(title)) {
    return { status: "rejected", reason: "audience_mismatch", rationale: "Acessório corporal ou insumo de bijuteria fora do foco editorial atual." };
  }
  return null;
}

function snapshotFor(row: QueueFact, decision: Decision) {
  const signals: string[] = [];
  if (Number(row.observation_count) < 3) signals.push("low_history");
  if (Number(row.claimed_discount_rate) >= 0.7) signals.push("high_claimed_discount");
  if (!row.category) signals.push("missing_category");
  if (row.rating_star == null) signals.push("missing_rating");
  const prefix = row.marketplace === "mercadolivre" ? "ml" : row.marketplace;
  return {
    snapshot_version: 1,
    snapshot: {
      productId: row.id,
      slug: `${prefix}-${row.external_id}`,
      marketplace: row.marketplace,
      externalId: row.external_id,
      title: row.title,
      productUrl: row.product_url,
      imageUrl: row.image_url ?? null,
      category: row.category ?? null,
      family: row.family_key ? { key: row.family_key, label: row.family_label, method: row.family_method, version: row.family_version } : null,
      statusBefore: row.status,
      priceCents: Number(row.price_cents),
      originalPriceCents: row.original_price_cents == null ? null : Number(row.original_price_cents),
      claimedDiscountRate: row.claimed_discount_rate == null ? null : Number(row.claimed_discount_rate),
      ratingStar: row.rating_star == null ? null : Number(row.rating_star),
      salesLabel: row.sales_label ?? null,
      salesCount: row.sales_count == null ? null : Number(row.sales_count),
      observedAt: new Date(row.observed_at as Date | string).toISOString(),
      observationCount: Number(row.observation_count),
      historyDays: Number(row.history_days),
      previousMinPriceCents: row.previous_min_price_cents == null ? null : Number(row.previous_min_price_cents),
      lowestVerified: Boolean(row.lowest_verified),
      signalsShown: signals,
      provenance: {
        presentingCaptureRunId: row.presenting_capture_run_id ?? null,
        presentingMarketplace: row.presenting_marketplace ?? null,
        planId: row.presenting_plan_id ?? null,
        queryId: row.presenting_query_id ?? null,
        mode: row.presenting_mode ?? null,
        targetCategory: row.presenting_target_category ?? null,
        targetFamily: row.presenting_target_family ?? null,
      },
      action: { via: "review", policyVersion: POLICY_VERSION },
    },
    automation: { kind: "initial_catalog_cleanup", rationale: decision.rationale },
  };
}

const sql = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max: 1,
  ssl: process.env.DATABASE_URL!.includes("localhost") ? false : { rejectUnauthorized: false },
});

try {
  const rows = await sql<QueueFact[]>`
    select f.*
    from garimpa.curation_queue_facts f
    where f.tenant_id = ${TENANT_ID}
      and f.status = 'approved'
      and f.last_seen_at >= now() - interval '7 days'
    order by f.marketplace, f.title
  `;
  const decisions = rows.flatMap((row) => {
    const decision = decisionFor(row);
    return decision ? [{ row, decision }] : [];
  });

  console.log(`Modo: ${APPLY ? "APLICAR" : "PRÉVIA"}`);
  console.log(`Aprovados vigentes: ${rows.length} | decisões: ${decisions.length} | permanecem: ${rows.length - decisions.length}`);
  for (const { row, decision } of decisions) {
    console.log(`[${decision.status}/${decision.reason}] ${row.title}`);
  }

  if (APPLY) {
    await sql.begin(async (tx) => {
      for (const { row, decision } of decisions) {
        const current = await tx<{ status: string }[]>`
          select status from garimpa.product_curation
          where tenant_id = ${TENANT_ID} and product_id = ${row.id}
          for update
        `;
        if (current[0]?.status !== "approved") throw new Error(`Estado mudou durante a limpeza: ${row.id}`);
        const metadata = snapshotFor(row, decision);
        await tx`
          insert into garimpa.curation_event
            (tenant_id, product_id, from_status, to_status, reason_code, reason_detail,
             actor_type, policy_version, metadata)
          values (${TENANT_ID}, ${row.id}, 'approved', ${decision.status}, ${decision.reason},
                  ${decision.rationale}, 'llm', ${POLICY_VERSION}, ${tx.json(metadata)})
        `;
        await tx`
          update garimpa.product_curation
          set status = ${decision.status}, reason_code = ${decision.reason},
              reason_detail = ${decision.rationale}, reviewed_at = now(), updated_at = now()
          where tenant_id = ${TENANT_ID} and product_id = ${row.id} and status = 'approved'
        `;
      }
    });
    console.log(`Aplicadas ${decisions.length} decisões auditáveis.`);
  }
} finally {
  await sql.end();
}
