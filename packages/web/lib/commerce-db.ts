/**
 * Acesso a banco para campanhas, kits e links de campanha (EP-04 / C-04 / C-06).
 */

import type postgres from "postgres";
import {
  generateCampaignLinkCode,
  type Campaign,
  type CampaignLink,
  type CommercialKit,
  type CommercialKitRevision,
  type KitSnapshot,
  type KitMaterial,
} from "./commerce-contract.ts";

export type Sql = postgres.Sql | postgres.TransactionSql;

export async function createCampaign(
  sql: Sql,
  input: {
    tenantId: string;
    name: string;
    objective: string;
    audiencePolicyVersionId?: string | null;
    createdBy: string;
  },
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    insert into garimpa.campaign
      (tenant_id, name, objective, audience_policy_version_id, created_by)
    values
      (${input.tenantId}, ${input.name}, ${input.objective},
       ${input.audiencePolicyVersionId ?? null}, ${input.createdBy})
    returning id
  `;
  return rows[0]!.id;
}

export async function listCampaigns(
  sql: Sql,
  tenantId: string,
): Promise<Campaign[]> {
  const rows = await sql<{
    id: string;
    tenant_id: string;
    name: string;
    objective: string;
    audience_policy_version_id: string | null;
    starts_at: string | null;
    ends_at: string | null;
    status: string;
    version: number;
    created_by: string;
    created_at: string;
  }[]>`
    select id, tenant_id, name, objective, audience_policy_version_id,
           starts_at::text, ends_at::text, status, version, created_by, created_at::text
    from garimpa.campaign
    where tenant_id = ${tenantId}
    order by created_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    objective: r.objective,
    audiencePolicyVersionId: r.audience_policy_version_id ?? undefined,
    startsAt: r.starts_at ?? undefined,
    endsAt: r.ends_at ?? undefined,
    status: r.status as Campaign["status"],
    version: r.version,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}

export async function createCommercialKitDraft(
  sql: Sql,
  input: {
    tenantId: string;
    campaignId: string;
    opportunityId: string;
    snapshot: KitSnapshot;
    claims: unknown[];
    materials: KitMaterial[];
    createdBy: string;
    contentDigest: string;
  },
): Promise<{ kitId: string; revisionId: string }> {
  // 1. Cria o kit
  const kitRows = await sql<{ id: string }[]>`
    insert into garimpa.commercial_kit
      (tenant_id, campaign_id, opportunity_id, current_revision, version, status)
    values
      (${input.tenantId}, ${input.campaignId}, ${input.opportunityId}, 1, 1, 'draft')
    returning id
  `;
  const kitId = kitRows[0]!.id;

  // 2. Cria a revisão 1
  const revRows = await sql<{ id: string }[]>`
    insert into garimpa.commercial_kit_revision
      (tenant_id, kit_id, revision, snapshot, claims, materials, created_by, content_digest)
    values
      (${input.tenantId}, ${kitId}, 1, ${sql.json(input.snapshot as any)},
       ${sql.json(input.claims as any)}, ${sql.json(input.materials as any)},
       ${input.createdBy}, ${input.contentDigest})
    returning id
  `;
  const revisionId = revRows[0]!.id;

  return { kitId, revisionId };
}

export async function reserveCampaignLink(
  sql: Sql,
  input: {
    tenantId: string;
    publicationId: string;
    webPublicationId?: string | null;
  },
  codeFactory: () => string = generateCampaignLinkCode,
): Promise<CampaignLink> {
  // Tentativa de gerar código único sem colisão
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = codeFactory();
    try {
      const rows = await sql<{
        id: string;
        tenant_id: string;
        publication_id: string;
        web_publication_id: string | null;
        code: string;
        target_url: string | null;
        monetization_status: string;
        capability_version: string;
        created_at: string;
      }[]>`
        insert into garimpa.campaign_link
          (tenant_id, publication_id, web_publication_id, code, monetization_status)
        values
          (${input.tenantId}, ${input.publicationId}, ${input.webPublicationId ?? null}, ${code}, 'reserved')
        on conflict(code) do nothing
        returning id, tenant_id, publication_id, web_publication_id, code, target_url,
                  monetization_status, capability_version, created_at::text
      `;
      if(!rows[0]) continue; // Collision never aborts the surrounding transaction.
      const r = rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        publicationId: r.publication_id,
        webPublicationId: r.web_publication_id ?? undefined,
        code: r.code,
        targetUrl: r.target_url ?? undefined,
        monetizationStatus: r.monetization_status as CampaignLink["monetizationStatus"],
        capabilityVersion: r.capability_version,
        createdAt: r.created_at,
      };
    } catch (err: any) {
      throw err;
    }
  }
  throw new Error("Falha ao gerar código único de link de campanha após 5 tentativas.");
}

import { db } from "./db.ts";

export async function resolveCampaignLinkByCode(
  code: string,
  sqlFactory?: typeof db,
): Promise<{ slug: string; tenantId: string; code: string } | null>;
export async function resolveCampaignLinkByCode(
  sql: Sql,
  code: string,
): Promise<{ slug: string; tenantId: string; code: string } | null>;
export async function resolveCampaignLinkByCode(
  sqlOrCode: Sql | string,
  codeOrSqlFactory?: string | typeof db,
): Promise<{ slug: string; tenantId: string; code: string } | null> {
  let sql: Sql;
  let code: string;
  let ownedConnection: postgres.Sql | undefined;

  if (typeof sqlOrCode === "string") {
    code = sqlOrCode;
    const factory = (codeOrSqlFactory as typeof db) ?? db;
    const { publicProjectionReady, publicCampaignLink } = await import("./public-offer-db.ts");
    if (await publicProjectionReady(factory)) {
      const row = await publicCampaignLink(code, null, factory);
      return row ? { code: row.code, slug: row.slug, tenantId: row.tenant_id } : null;
    }
    sql = ownedConnection = factory();
  } else {
    sql = sqlOrCode;
    code = codeOrSqlFactory as string;
  }

  try {
    const rows = await sql<{
      code: string;
      tenant_id: string;
      slug: string;
    }[]>`
      select cl.code, cl.tenant_id, pub.slug
      from garimpa.campaign_link cl
      join garimpa.campaign_publication cp on cp.id = cl.publication_id
      join garimpa.commercial_kit ck on ck.id = cp.kit_id
      join garimpa.opportunity opp on opp.id = ck.opportunity_id
      join garimpa.product p on p.id = opp.product_id
      join garimpa.publication pub on pub.product_id = p.id and pub.tenant_id = cl.tenant_id
      where cl.code = ${code}
        and cl.monetization_status in ('valid', 'reserved')
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      code: row.code,
      tenantId: row.tenant_id,
      slug: row.slug,
    };
  } finally {
    if (ownedConnection) {
      await ownedConnection.end();
    }
  }
}
