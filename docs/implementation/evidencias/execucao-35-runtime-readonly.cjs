// Read-only baseline through the application's existing connection. No migration.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
let sql;
(async () => {
  process.loadEnvFile(path.join(root, 'packages/web/.env.local'));
  const target = new URL(process.env.DATABASE_URL);
  if (!target.hostname.endsWith('.supabase.com') && !target.hostname.endsWith('.supabase.co')) throw new Error('unexpected_database_host');
  const postgres = require(path.join(root, 'packages/web/node_modules/postgres'));
  sql = postgres(process.env.DATABASE_URL, {max:1,prepare:false,ssl:'require',connect_timeout:10,onnotice:()=>{}});
  const result = await sql.begin('read only', async tx => {
    const [identity] = await tx`select current_user as role,current_database() as database,rolsuper,rolbypassrls from pg_roles where rolname=current_user`;
    if (identity.role !== 'garimpa_app' || identity.rolsuper || identity.rolbypassrls) throw new Error('connection_is_not_runtime_role');
    const [counts] = await tx`select now() inspected_at,(select count(*)::int from garimpa.product) products,(select count(*)::int from garimpa.price_observation) observations,(select count(*)::int from garimpa.publication) publications,(select count(*)::int from garimpa.short_link) shortlinks`;
    return {result:'PASS',phase:'before migrations; legacy runtime read access only',identity,counts,databaseWrites:0,limits:'Does not certify Google session, deployed routes or post-migration behavior.'};
  });
  fs.writeFileSync(path.join(__dirname,'execucao-35-runtime-readonly.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
})().catch(error => {
  // Driver messages and URLs can expose credentials; print only controlled diagnostics.
  const known=['unexpected_database_host','connection_is_not_runtime_role'];
  console.error(JSON.stringify({result:'NOT_COMPLETED',reason:known.includes(error.message)?error.message:'connection_or_query_failed',code:/^[A-Z0-9_]+$/.test(error.code||'')?error.code:undefined}));
  process.exitCode=1;
}).finally(async()=>{if(sql)await sql.end({timeout:3});});
