import {createRequire} from 'node:module';
const require = createRequire(new URL('../packages/web/package.json', import.meta.url));
const postgres = require('postgres');
process.loadEnvFile(new URL('../packages/web/.env.local', import.meta.url));
const sql = postgres(process.env.DATABASE_URL, {prepare:false,max:1,connect_timeout:12,ssl:{rejectUnauthorized:false}});
try {
 await sql.begin('read only', async tx => {
 const queries = {
  clock: `select now() as audited_at`,
  jewelry: `select f.title,f.status,f.price_cents,c.reason_detail from garimpa.curation_queue_facts f join garimpa.product_curation c on c.tenant_id=f.tenant_id and c.product_id=f.id where f.tenant_id='local' and f.title ~* '(brinco|pulseira)' order by f.price_cents desc limit 12`,
  policy_events: `select policy_version,actor_type,to_status,count(*)::int n from garimpa.curation_event where tenant_id='local' group by policy_version,actor_type,to_status order by policy_version,actor_type,to_status`,
  family: `select coalesce(f.family_key,'sem_familia') family,count(*)::int n from garimpa.curation_queue_facts f where f.tenant_id='local' and f.status='pending' and f.last_seen_at>=now()-interval '7 days' group by f.family_key order by n desc`,
  funnel: `with latest as (select distinct on (product_id) product_id,observed_at from garimpa.price_observation where tenant_id='local' order by product_id,observed_at desc,id desc) select coalesce(c.status,'missing') status,count(*)::int total,count(*) filter(where p.last_seen_at>=now()-interval '7 days')::int fresh_seen,count(*) filter(where p.last_seen_at>=now()-interval '7 days' and l.observed_at>=now()-interval '7 days')::int fresh_seen_and_observation from garimpa.product p left join garimpa.product_curation c on c.product_id=p.id and c.tenant_id=p.tenant_id left join latest l on l.product_id=p.id where p.tenant_id='local' group by c.status order by total desc`,
  pending: `select count(*)::int fresh_pending,count(*) filter(where (f.deferred_until is null or f.deferred_until<=now()) and not exists(select 1 from garimpa.curation_event e where e.tenant_id=f.tenant_id and e.product_id=f.id and e.actor_type in ('rule','llm')))::int triage_eligible,count(*) filter(where exists(select 1 from garimpa.curation_event e where e.tenant_id=f.tenant_id and e.product_id=f.id and e.actor_type in ('rule','llm')))::int previously_triaged from garimpa.curation_queue_facts f where f.tenant_id='local' and f.status='pending' and f.last_seen_at>=now()-interval '7 days'`,
  events: `select actor_type,to_status,count(*)::int n from garimpa.curation_event where tenant_id='local' group by actor_type,to_status order by actor_type,to_status`,
  guideline: `select guideline,auto_publish,min_score_auto_publish,updated_at from garimpa.editorial_guideline where tenant_id='local'`,
  reasons: `select status,reason_code,count(*)::int n from garimpa.product_curation where tenant_id='local' group by status,reason_code order by n desc`,
  spot_feedback: `select p.title,e.reason_code,e.reason_detail,e.created_at,e.metadata from garimpa.curation_event e join garimpa.product p on p.id=e.product_id and p.tenant_id=e.tenant_id where e.tenant_id='local' and e.metadata->>'spotCheckReject'='true' order by e.id desc limit 8`,
  capture: `select marketplace,status,max(started_at) last_capture,count(*) filter(where started_at>=now()-interval '7 days')::int runs_7d from garimpa.capture_run where tenant_id='local' group by marketplace,status order by marketplace,status`
 };
 for(const [name,q] of Object.entries(queries)) {console.log(JSON.stringify({name,rows:await tx.unsafe(q)}));}
 });
} catch(e) {console.error(JSON.stringify({error:e.code??e.name,message:e.message}));process.exitCode=1;} finally {await sql.end({timeout:2});}
