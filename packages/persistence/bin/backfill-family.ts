/** Conservative family classification, scoped to one active account; preview by default. */
import postgres from 'postgres';
import { backfillFamilies } from '../src/catalog-maintenance.ts';
const url=process.env.DATABASE_URL;
if(!url)throw new Error('DATABASE_URL_required');
const args=process.argv.slice(2),index=args.indexOf('--tenant');
const tenantId=index<0?'local':args[index+1];
if(!tenantId || tenantId.startsWith('--'))throw new Error('maintenance_tenant_required');
let sql: ReturnType<typeof postgres> | undefined;
try {
 const target=new URL(url);
 if (!['postgres:','postgresql:'].includes(target.protocol)) throw new Error('invalid_connection');
 sql=postgres(url,{max:1,prepare:false,connect_timeout:10,
  ssl:['localhost','127.0.0.1','[::1]'].includes(target.hostname)?false:'require'});
 console.log(JSON.stringify(await backfillFamilies(sql,tenantId,args.includes('--apply')),null,2));
} catch { console.error('family_backfill_failed: confira a conexão e a conta ativa; detalhes de conexão não são exibidos.');process.exitCode=1; }
finally { if(sql)await sql.end(); }
