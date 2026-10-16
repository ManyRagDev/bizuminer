/** Explicit administrative bootstrap, preview by default; requires an existing authenticated affiliate. */
import { administrativeMaintenanceDb } from '../src/maintenance-cli.ts';
import { bootstrapHouse } from '../src/house-maintenance.ts';
const email=process.env.ADMIN_EMAIL;
if(!email)throw new Error('explicit_admin_email_required');
const sql=administrativeMaintenanceDb();
try { console.log(JSON.stringify(await bootstrapHouse(sql,email,process.argv.includes('--apply')),null,2)); }
catch { console.error('house_bootstrap_failed: confira a conexão administrativa, a identidade autenticada e o vínculo existente.'); process.exitCode=1; }
finally { await sql.end(); }
