/**
 * Acesso do painel à camada de afiliados (E1).
 *
 * Invariante de segurança (R2/R3 do plano-afiliados.md): `tracking_id` e
 * `tool_id` são configuração autoritativa do servidor. Nenhuma função deste
 * módulo devolve esses valores em payload — as views expõem apenas
 * `configured`, `status` e `validated_at`. A escrita de credencial só acontece
 * a partir de ação autenticada do dono, nunca é lida de `process.env` global
 * no caminho de clique (isso é E3).
 */

import { db } from "./db";

export interface AffiliateAccount {
  id: string;
  tenantId: string;
  publicSlug: string;
  displayName: string;
  status: "active" | "suspended";
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** Status de uma credencial de marketplace — SEM tracking_id/tool_id. */
export interface MarketplaceConfigView {
  marketplace: string;
  configured: boolean;
  status: "active" | "invalid" | "suspended" | null;
  validatedAt: Date | string | null;
}

export interface AffiliateAccountSummary extends AffiliateAccount {
  ownerCount: number;
  configs: MarketplaceConfigView[];
}

function toAccount(row: {
  id: string;
  tenant_id: string;
  public_slug: string;
  display_name: string;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
}): AffiliateAccount {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    publicSlug: row.public_slug,
    displayName: row.display_name,
    status: row.status as AffiliateAccount["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Lista todas as contas de afiliado (só o dono; fronteira server-only). */
export async function listAffiliateAccounts(): Promise<AffiliateAccountSummary[]> {
  const sql = db();
  try {
    const rows = await sql<{
      id: string;
      tenant_id: string;
      public_slug: string;
      display_name: string;
      status: string;
      created_at: Date | string;
      updated_at: Date | string;
      owner_count: number;
    }[]>`
      select a.id, a.tenant_id, a.public_slug, a.display_name, a.status,
             a.created_at, a.updated_at,
             (select count(*)::int from garimpa.affiliate_membership m
               where m.affiliate_id = a.id and m.role = 'owner') as owner_count
      from garimpa.affiliate_account a
      order by (a.id = 'aff_local') desc, a.created_at asc
    `;

    const accounts: AffiliateAccountSummary[] = [];
    for (const row of rows) {
      const configs = await sql<{
        marketplace: string;
        configured: boolean;
        status: string | null;
        validated_at: Date | string | null;
      }[]>`
        select c.marketplace,
               (c.id is not null) as configured,
               c.status,
               c.validated_at
        from garimpa.affiliate_marketplace_config c
        where c.affiliate_id = ${row.id}
        order by c.marketplace asc
      `;
      accounts.push({
        ...toAccount(row),
        ownerCount: row.owner_count,
        configs: configs.map((c) => ({
          marketplace: c.marketplace,
          configured: c.configured,
          status: c.status as MarketplaceConfigView["status"],
          validatedAt: c.validated_at,
        })),
      });
    }
    return accounts;
  } finally {
    await sql.end();
  }
}

/** Conta da casa (aff_local) com status de configuração de marketplace. */
export async function getHouseAccount(): Promise<AffiliateAccountSummary | null> {
  const sql = db();
  try {
    const rows = await sql<{
      id: string;
      tenant_id: string;
      public_slug: string;
      display_name: string;
      status: string;
      created_at: Date | string;
      updated_at: Date | string;
      owner_count: number;
    }[]>`
      select a.id, a.tenant_id, a.public_slug, a.display_name, a.status,
             a.created_at, a.updated_at,
             (select count(*)::int from garimpa.affiliate_membership m
               where m.affiliate_id = a.id and m.role = 'owner') as owner_count
      from garimpa.affiliate_account a
      where a.id = 'aff_local'
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;

    const configs = await sql<{
      marketplace: string;
      configured: boolean;
      status: string | null;
      validated_at: Date | string | null;
    }[]>`
      select c.marketplace,
             (c.id is not null) as configured,
             c.status,
             c.validated_at
      from garimpa.affiliate_marketplace_config c
      where c.affiliate_id = ${row.id}
      order by c.marketplace asc
    `;
    return {
      ...toAccount(row),
      ownerCount: row.owner_count,
      configs: configs.map((c) => ({
        marketplace: c.marketplace,
        configured: c.configured,
        status: c.status as MarketplaceConfigView["status"],
        validatedAt: c.validated_at,
      })),
    };
  } finally {
    await sql.end();
  }
}

/**
 * Grava/atualiza a credencial de marketplace de um afiliado. Só o dono chama.
 * Nunca devolve os valores gravados — apenas o status resultante.
 */
export async function upsertMarketplaceConfig(input: {
  affiliateId: string;
  marketplace: string;
  trackingId: string;
  toolId: string;
}): Promise<MarketplaceConfigView> {
  const sql = db();
  try {
    const rows = await sql<{
      marketplace: string;
      configured: boolean;
      status: string;
      validated_at: Date | string | null;
    }[]>`
      insert into garimpa.affiliate_marketplace_config
        (affiliate_id, marketplace, tracking_id, tool_id, status)
      values (${input.affiliateId}, ${input.marketplace}, ${input.trackingId}, ${input.toolId}, 'active')
      on conflict (affiliate_id, marketplace) do update set
        tracking_id = excluded.tracking_id,
        tool_id = excluded.tool_id,
        status = 'active',
        validated_at = null,
        updated_at = now()
      returning marketplace, true as configured, status, validated_at
    `;
    const row = rows[0]!;
    return {
      marketplace: row.marketplace,
      configured: row.configured,
      status: row.status as MarketplaceConfigView["status"],
      validatedAt: row.validated_at,
    };
  } finally {
    await sql.end();
  }
}
