/**
 * Backfill conservador de família no catálogo existente (M4-D).
 *
 * A classificação vive em TS (`product-family.ts`), fonte única — nada de
 * duplicar o dicionário em SQL. Este script percorre produtos sem família e
 * grava key/label/método/versão quando o título tem pista forte; produto sem
 * pista permanece com família nula (singular), nunca num balde "outros".
 *
 * Modo sombra por padrão: sem `--apply`, apenas imprime o que seria mudado.
 * Execução com escrita exige decisão humana.
 */

import postgres from "postgres";
import { familyInfoForTitle } from "../src/product-family.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL ausente");

const apply = process.argv.includes("--apply");
const sql = postgres(connectionString, {
  prepare: false,
  max: 1,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function main(): Promise<void> {
  const rows = await sql<{ id: string; title: string }[]>`
    select id, title
    from garimpa.product
    where family_key is null
    order by id
  `;

  const changes: { id: string; family: NonNullable<ReturnType<typeof familyInfoForTitle>> }[] = [];
  for (const row of rows) {
    const family = familyInfoForTitle(row.title);
    if (family) changes.push({ id: row.id, family });
  }

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          scanned: rows.length,
          wouldClassify: changes.length,
          wouldRemainSingular: rows.length - changes.length,
          families: Object.fromEntries(
            [...new Set(changes.map((c) => c.family.key))].map((key) => [
              key,
              changes.filter((c) => c.family.key === key).length,
            ]),
          ),
        },
        null,
        2,
      ),
    );
    return;
  }

  let applied = 0;
  for (const change of changes) {
    await sql`
      update garimpa.product
      set family_key = ${change.family.key},
          family_label = ${change.family.label},
          family_method = ${change.family.method},
          family_version = ${change.family.version},
          updated_at = now()
      where id = ${change.id}
    `;
    applied++;
  }

  console.log(
    JSON.stringify(
      {
        mode: "apply",
        applied,
        remainedSingular: rows.length - applied,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} finally {
  await sql.end();
}
