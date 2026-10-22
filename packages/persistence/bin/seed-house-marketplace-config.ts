/** Dedicated administrative connection; preview by default; never prints credentials. */
import { administrativeMaintenanceDb } from '../src/maintenance-cli.ts';
import { seedHouseConfig } from '../src/house-maintenance.ts';
const tracking=process.env.ML_TRACKING_ID,tool=process.env.ML_TOOL_ID;
if(!tracking || !tool)throw new Error('marketplace_configuration_required');
const sql=administrativeMaintenanceDb();
try { console.log(JSON.stringify(await seedHouseConfig(sql,tracking,tool,process.argv.includes('--apply')),null,2)); }
catch { console.error('house_config_failed: confira a conexão administrativa, a conta e os requisitos; nenhum segredo é exibido.'); process.exitCode=1; }
finally { await sql.end(); }
