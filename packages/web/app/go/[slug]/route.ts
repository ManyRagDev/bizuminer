import { createHash } from "node:crypto";
import { affiliateLink, db } from "../../../lib/db";

/**
 * Telemetria própria de cliques (engenharia-reversa.md §6):
 * grava click_event (IP só como hash — LGPD) e redireciona 302 para o link
 * afiliado matt_full com subId = slug da publicação.
 *
 * A publication é criada sob demanda no primeiro clique (slug determinístico
 * `ml-<external_id>`), garantindo que toda oferta da vitrine tenha subId.
 */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const sql = db();
  try {
    const rows = await sql<{ id: string; product_url: string; tenant_id: string }[]>`
      insert into garimpa.publication (id, tenant_id, product_id, channel, slug)
      select gen_random_uuid()::text, p.tenant_id, p.id, 'web', ${slug}
      from garimpa.product p
      where p.marketplace = 'mercadolivre' and 'ml-' || p.external_id = ${slug}
      on conflict (slug) do update set published_at = now()
      returning id, tenant_id
    `;
    if (rows.length === 0) {
      return new Response("Oferta não encontrada", { status: 404 });
    }
    const pub = rows[0]!;

    const product = await sql<{ product_url: string }[]>`
      select p.product_url from garimpa.product p
      join garimpa.publication pub on pub.product_id = p.id
      where pub.id = ${pub.id}
    `;

    // IP só como hash com sal fixo — dedup sem armazenar dado pessoal (LGPD).
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "0.0.0.0";
    const ipHash = createHash("sha256").update(`garimpa:${ip}`).digest("hex").slice(0, 32);

    await sql`
      insert into garimpa.click_event
        (id, tenant_id, publication_id, user_agent, referer, ip_hash)
      values (gen_random_uuid()::text, ${pub.tenant_id}, ${pub.id},
              ${req.headers.get("user-agent")}, ${req.headers.get("referer")}, ${ipHash})
    `;

    const target = affiliateLink(product[0]!.product_url, slug);
    return new Response(null, {
      status: 302,
      headers: { Location: target, "Cache-Control": "no-store" },
    });
  } finally {
    await sql.end();
  }
}
