/**
 * Atribuição de cliques e validação de tokens de campanha (EP-07 / C-06).
 */

import { db } from "./db.ts";
import { isCampaignLinkCode } from "./commerce-contract.ts";
import { publicCampaignLink, publicProjectionReady } from "./public-offer-db.ts";

export interface CampaignTokenValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
  readonly campaignLinkId?: string;
  readonly campaignPublicationId?: string;
  readonly tenantId?: string;
}

/**
 * Valida rigorosamente se o código de campanha `?c=<code>` pertence ao produto / slug fornecido.
 * Falha fechado: se o token for de outro produto ou inexistente, recusa a atribuição.
 */
export async function validateCampaignTokenForSlug(
  code: string | null | undefined,
  slug: string,
  sqlFactory: typeof db = db,
): Promise<CampaignTokenValidationResult> {
  if (!code) {
    return { valid: false, reason: "token_missing" };
  }

  if (!isCampaignLinkCode(code)) {
    return { valid: false, reason: "malformed_token" };
  }

  if (sqlFactory === db && !process.env.DATABASE_URL) {
    return { valid: false, reason: "db_lookup_unavailable" };
  }

  try {
    if (await publicProjectionReady(sqlFactory)) {
      const link = await publicCampaignLink(code, slug, sqlFactory);
      return link ? { valid: true, campaignLinkId: link.link_id, campaignPublicationId: link.social_publication_id, tenantId: link.tenant_id }
        : { valid: false, reason: "mismatched_or_inactive_token" };
    }
    const sql = sqlFactory();
    try {
      const rows = await sql<{
        link_id: string;
        pub_id: string;
        tenant_id: string;
        product_id: string;
      }[]>`
        select
          cl.id as link_id,
          cl.publication_id as pub_id,
          cl.tenant_id,
          ck.opportunity_id
        from garimpa.campaign_link cl
        join garimpa.campaign_publication cp on cp.id = cl.publication_id
        join garimpa.commercial_kit ck on ck.id = cp.kit_id
        join garimpa.opportunity op on op.id = ck.opportunity_id
        join garimpa.product p on p.id = op.product_id
        join garimpa.publication pub on pub.id=cl.web_publication_id and pub.product_id=p.id and pub.tenant_id=cl.tenant_id
        where cl.code = ${code}
          and cl.monetization_status = 'valid'
          and pub.status='active' and pub.slug=${slug}
        limit 1
      `;

      if (!rows[0]) {
        return { valid: false, reason: "mismatched_or_inactive_token" };
      }

      const row = rows[0];
      return {
        valid: true,
        campaignLinkId: row.link_id,
        campaignPublicationId: row.pub_id,
        tenantId: row.tenant_id,
      };
    } finally {
      if (typeof sql.end === "function") {
        await sql.end();
      }
    }
  } catch {
    // Se a tabela ainda não existir no ambiente local ou conexão falhar, falha fechado com segurança
    return { valid: false, reason: "db_lookup_unavailable" };
  }
}
