import type { Sql } from 'postgres';
import { withMonitoringDb } from './monitoring-db.ts';
import { familyInfoForTitle } from './product-family.ts';

/** Classification only: no editorial approval and no change of account ownership. */
export async function backfillFamilies(sql: Sql, tenantId: string, apply = false) {
  return withMonitoringDb(sql, tenantId, async tx => {
    const accounts = await tx`select id from garimpa.affiliate_account where tenant_id=${tenantId} and status='active'`;
    if (accounts.length !== 1) throw new Error('maintenance_account_unavailable');
    const rows = await tx<{ id: string; title: string }[]>`
      select id,title from garimpa.product where tenant_id=${tenantId} and family_key is null order by id`;
    const changes = rows.flatMap(row => {
      const family = familyInfoForTitle(row.title);
      return family ? [{ id: row.id, family }] : [];
    });
    let applied = 0;
    if (apply) for (const change of changes) {
      const updated = await tx`update garimpa.product set family_key=${change.family.key},family_label=${change.family.label},
        family_method=${change.family.method},family_version=${change.family.version},updated_at=now()
        where id=${change.id} and tenant_id=${tenantId} and family_key is null returning id`;
      applied += updated.length;
    }
    return { mode: apply ? 'apply' : 'dry-run', tenantId, scanned: rows.length, wouldClassify: changes.length,
      wouldRemainSingular: rows.length-changes.length, applied,
      families: Object.fromEntries([...new Set(changes.map(c=>c.family.key))].map(key=>[key,changes.filter(c=>c.family.key===key).length])) };
  });
}
