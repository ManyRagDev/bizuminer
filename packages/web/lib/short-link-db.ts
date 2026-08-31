import { db } from "./db.ts";
import { generateShortCode, isValidShortCode } from "./short-code.ts";

/**
 * Persistência do link curto (`/p/<code>` → `/bizu/<slug>`).
 *
 * Ver `short-code.ts` para o porquê do sorteio; aqui mora o que torna o
 * sorteio seguro — unicidade no banco e nova tentativa no conflito.
 */

/**
 * Quantas vezes tentar antes de desistir.
 *
 * Com 10 mil links cunhados, a chance de um sorteio bater num código já usado
 * é 10.000/707.281 = 1,4%; duas colisões seguidas, 0,02%; cinco seguidas,
 * 1 em 180 bilhões. O limite existe para que um bug futuro (alfabeto reduzido
 * por engano, espaço realmente esgotado) falhe alto em vez de girar para
 * sempre num laço infinito.
 */
const MAX_ATTEMPTS = 5;

/**
 * Devolve o código curto do slug, cunhando um na primeira vez.
 *
 * Idempotente por slug: chamar de novo devolve o MESMO código. É o índice
 * único `(tenant_id, slug)` que garante isso mesmo sob concorrência — duas
 * requisições simultâneas para o produto novo não geram dois códigos, a
 * perdedora relê o vencedor.
 */
export async function shortCodeForSlug(slug: string, tenantId = "local"): Promise<string> {
  const sql = db();
  try {
    const existing = await sql<{ code: string }[]>`
      select code from garimpa.short_link
      where tenant_id = ${tenantId} and slug = ${slug}
    `;
    if (existing[0]) return existing[0].code;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const code = generateShortCode();
      // Dois conflitos possíveis, tratados de formas OPOSTAS:
      // - code já usado por outro slug  → sortear de novo (colisão).
      // - slug já tem código (corrida)  → devolver o que ganhou, não insistir.
      // `on conflict do nothing` cobre os dois sem levantar exceção; o retorno
      // vazio é que diz "alguém chegou antes", e aí perguntamos quem.
      const inserted = await sql<{ code: string }[]>`
        insert into garimpa.short_link (code, tenant_id, slug)
        values (${code}, ${tenantId}, ${slug})
        on conflict do nothing
        returning code
      `;
      if (inserted[0]) return inserted[0].code;

      const winner = await sql<{ code: string }[]>`
        select code from garimpa.short_link
        where tenant_id = ${tenantId} and slug = ${slug}
      `;
      if (winner[0]) return winner[0].code;
      // Nada inserido e o slug segue sem código: foi colisão de `code`. Sorteia de novo.
    }
    throw new Error(`Não foi possível cunhar código curto para ${slug} em ${MAX_ATTEMPTS} tentativas`);
  } finally {
    await sql.end();
  }
}

/** Resolve o código para o slug do produto. `null` = código inexistente. */
export async function slugForShortCode(code: string, tenantId = "local"): Promise<string | null> {
  // Formato conferido antes de tocar o banco: `/p/[code]` recebe o que o mundo
  // mandar, e string arbitrária não vira consulta.
  if (!isValidShortCode(code)) return null;

  const sql = db();
  try {
    const rows = await sql<{ slug: string }[]>`
      select slug from garimpa.short_link
      where tenant_id = ${tenantId} and code = ${code}
    `;
    return rows[0]?.slug ?? null;
  } finally {
    await sql.end();
  }
}

/**
 * Cunha códigos curtos para VÁRIOS slugs numa única conexão.
 *
 * Existe para a pauta: cunhar código por código abria N conexões simultâneas
 * (Promise.all) e estourava o pooler do Supabase em modo session (limite de
 * 15 sessões). Com o lote, são 1 SELECT + inserts sequenciais na MESMA
 * conexão — o teto nunca chega perto.
 *
 * Idempotente por slug, mesma semântica de `shortCodeForSlug`.
 */
export async function shortCodesForSlugs(slugs: string[], tenantId = "local"): Promise<Map<string, string>> {
  const unique = [...new Set(slugs)];
  if (unique.length === 0) return new Map();
  const sql = db();
  try {
    const result = new Map<string, string>();
    const existing = await sql<{ code: string; slug: string }[]>`
      select code, slug from garimpa.short_link
      where tenant_id = ${tenantId} and slug = any(${unique})
    `;
    for (const row of existing) result.set(row.slug, row.code);

    for (const slug of unique) {
      if (result.has(slug)) continue;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const code = generateShortCode();
        const inserted = await sql<{ code: string }[]>`
          insert into garimpa.short_link (code, tenant_id, slug)
          values (${code}, ${tenantId}, ${slug})
          on conflict do nothing
          returning code
        `;
        if (inserted[0]) {
          result.set(slug, inserted[0].code);
          break;
        }
        const winner = await sql<{ code: string }[]>`
          select code from garimpa.short_link
          where tenant_id = ${tenantId} and slug = ${slug}
        `;
        if (winner[0]) {
          result.set(slug, winner[0].code);
          break;
        }
      }
      if (!result.has(slug)) {
        throw new Error(`Não foi possível cunhar código curto para ${slug} em ${MAX_ATTEMPTS} tentativas`);
      }
    }
    return result;
  } finally {
    await sql.end();
  }
}
