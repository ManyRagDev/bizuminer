/**
 * Semeia a credencial de marketplace da casa (aff_local) a partir do env
 * (ML_TRACKING_ID / ML_TOOL_ID) — os mesmos valores que o caminho legado já
 * usa. NUNCA imprime os valores; apenas o status resultante.
 *
 * Uso: npm run seed:house-config   (usa DATABASE_URL + ML_* de ../web/.env.local)
 */

import postgres from "postgres";

async function main(): Promise<number> {
  const trackingId = process.env.ML_TRACKING_ID;
  const toolId = process.env.ML_TOOL_ID;
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definido.");
    return 1;
  }
  if (!trackingId || !toolId) {
    console.error("ML_TRACKING_ID e ML_TOOL_ID precisam estar no ambiente.");
    return 1;
  }

  const sql = postgres(process.env.DATABASE_URL, {
    prepare: false,
    max: 1,
    ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  try {
    const [config] = await sql<{ marketplace: string; status: string; validated_at: string | null }[]>`
      insert into garimpa.affiliate_marketplace_config
        (affiliate_id, marketplace, tracking_id, tool_id, status)
      values ('aff_local', 'mercadolivre', ${trackingId}, ${toolId}, 'active')
      on conflict (affiliate_id, marketplace) do update set
        tracking_id = excluded.tracking_id,
        tool_id = excluded.tool_id,
        status = 'active',
        validated_at = null,
        updated_at = now()
      returning marketplace, status, validated_at::text
    `;
    console.log(`config ${config!.marketplace}: status=${config!.status} validated_at=${config!.validated_at ?? "null"}`);
    console.log("(tracking_id/tool_id não são impressos — configurados a partir do env)");
    return 0;
  } finally {
    await sql.end();
  }
}

process.exit(await main());
