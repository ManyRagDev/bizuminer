/**
 * Gestão de dispositivos e métricas por afiliado (E7). Só o dono lê/escreve.
 * NUNCA devolve token bruto nem hash — apenas `token_prefix`, estado e datas.
 * Revogação/renomeação é escopada ao afiliado dono do dispositivo (não dá para
 * agir sobre dispositivo de outro afiliado por ID forjado).
 */

import { db } from "./db.ts";

export interface DeviceRow {
  id: string;
  affiliateId: string;
  name: string;
  tokenPrefix: string | null;
  pairedAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface AffiliateMetricRow {
  affiliateId: string;
  displayName: string;
  publicSlug: string;
  status: string;
  publications: number;
  clicks7d: number;
  devices: number;
}

export async function listDevices(affiliateId: string): Promise<DeviceRow[]> {
  const sql = db();
  try {
    const rows = await sql<{
      id: string;
      affiliate_id: string;
      name: string;
      token_prefix: string | null;
      paired_at: Date | null;
      last_used_at: Date | null;
      revoked_at: Date | null;
      created_at: Date;
    }[]>`
      select id, affiliate_id, name, token_prefix, paired_at, last_used_at, revoked_at, created_at
      from garimpa.extension_device
      where affiliate_id = ${affiliateId}
      order by created_at desc
    `;
    return rows.map((row) => ({
      id: row.id,
      affiliateId: row.affiliate_id,
      name: row.name,
      tokenPrefix: row.token_prefix,
      pairedAt: row.paired_at ? new Date(row.paired_at).toISOString() : null,
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
      revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  } finally {
    await sql.end();
  }
}

export async function revokeDevice(affiliateId: string, deviceId: string): Promise<boolean> {
  const sql = db();
  try {
    const rows = await sql<{ id: string }[]>`
      update garimpa.extension_device
      set revoked_at = now(), token_hash = null, token_prefix = null
      where id = ${deviceId} and affiliate_id = ${affiliateId} and revoked_at is null
      returning id
    `;
    return rows.length > 0;
  } finally {
    await sql.end();
  }
}

export async function renameDevice(affiliateId: string, deviceId: string, name: string): Promise<boolean> {
  const sql = db();
  try {
    const rows = await sql<{ id: string }[]>`
      update garimpa.extension_device
      set name = ${name}
      where id = ${deviceId} and affiliate_id = ${affiliateId}
      returning id
    `;
    return rows.length > 0;
  } finally {
    await sql.end();
  }
}

/** Métricas por afiliado (cliques/publicações/dispositivos) — sem token bruto. */
export async function affiliateMetrics(): Promise<AffiliateMetricRow[]> {
  const sql = db();
  try {
    const rows = await sql<{
      affiliate_id: string;
      display_name: string;
      public_slug: string;
      status: string;
      publications: number;
      clicks_7d: number;
      devices: number;
    }[]>`
      select a.id as affiliate_id, a.display_name, a.public_slug, a.status,
             (select count(*)::int from garimpa.publication p where p.affiliate_id = a.id) as publications,
             (select count(*)::int from garimpa.click_event c
                join garimpa.publication p on p.id = c.publication_id
                where p.affiliate_id = a.id and c.clicked_at >= now() - interval '7 days') as clicks_7d,
             (select count(*)::int from garimpa.extension_device d where d.affiliate_id = a.id) as devices
      from garimpa.affiliate_account a
      order by (a.id = 'aff_local') desc, a.created_at asc
    `;
    return rows.map((row) => ({
      affiliateId: row.affiliate_id,
      displayName: row.display_name,
      publicSlug: row.public_slug,
      status: row.status,
      publications: row.publications,
      clicks7d: row.clicks_7d,
      devices: row.devices,
    }));
  } finally {
    await sql.end();
  }
}
