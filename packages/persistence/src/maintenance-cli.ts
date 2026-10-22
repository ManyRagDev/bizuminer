import postgres from 'postgres';

/** Deliberately never falls back to DATABASE_URL / the production runtime role. */
export function administrativeMaintenanceDb() {
  const url = process.env.BIZUMINER_MAINTENANCE_DATABASE_URL;
  if (!url) throw new Error('BIZUMINER_MAINTENANCE_DATABASE_URL_required');
  let target: URL;
  try { target = new URL(url); } catch { throw new Error('invalid_maintenance_connection'); }
  if (!['postgres:','postgresql:'].includes(target.protocol)) throw new Error('invalid_maintenance_connection');
  try { return postgres(url,{max:1,prepare:false,connect_timeout:10,
    ssl:['localhost','127.0.0.1','[::1]'].includes(target.hostname)?false:'require'}); }
  catch { throw new Error('invalid_maintenance_connection'); }
}

/** Old scripts assume unrestricted visibility or contain historical fixed decisions.
 * They are removed from the V2 operational procedure before any DB/network action. */
export function retiredLegacyMaintenance(command: string): void {
  throw new Error(`legacy_maintenance_retired: ${command}. Use account services or the isolated test suite; this command must not access the active database.`);
}
