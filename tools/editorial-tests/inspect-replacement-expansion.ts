/** Local catalogue capture used to seal C. No remote connection is accepted. */
import {nativePostgresFixture} from './native-postgres-fixture.ts';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const fx=await nativePostgresFixture();
try {
 const manifest=JSON.parse(await readFile(new URL('../../packages/persistence/supabase/rollouts/v2/manifest.json',import.meta.url),'utf8'));
 for(const item of manifest.installedSubset)await fx.migrate(item.file);
 const baselineConstraints=await fx.admin`select c.relname table_name,k.conname name from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='garimpa'`;
 for(const item of manifest.units.filter((x:any)=>x.phase!=='scoped_cutover')){
  const sql=await readFile(new URL('../../packages/persistence/supabase/rollouts/v2/'+item.file,import.meta.url),'utf8');
  if(createHash('sha256').update(sql).digest('hex')!==item.sha256)throw new Error('catalogue_input_hash_mismatch');
  await fx.admin.begin(async(tx:any)=>{await tx.unsafe(sql);});
  console.log('PASS local expansion unit '+item.phase);
 }
 const policies=await fx.admin`select tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='garimpa' order by tablename,policyname`;
 const functions=await fx.admin`select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.prosrc,p.prosecdef,p.proconfig::text config,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='garimpa' order by signature`;
 const views=await fx.admin`select c.relname name,pg_get_viewdef(c.oid,true) definition,c.reloptions::text options,c.relacl::text acl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='garimpa' and c.relname in ('curation_queue_facts','effective_price_evidence_policy') and c.relkind='v' order by c.relname`;
 const tables=await fx.admin`select c.relname name,c.relrowsecurity rls,c.relforcerowsecurity force_rls,c.relowner::regrole::text owner,c.relacl::text acl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='garimpa' and c.relkind in ('r','p') order by c.relname`;
 const columnAcls=await fx.admin`select c.relname table_name,a.attname column_name,a.attacl::text acl from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='garimpa' and a.attnum>0 and not a.attisdropped and cardinality(a.attacl)>0 order by c.relname,a.attname`;
 const allConstraints=await fx.admin`select c.relname table_name,k.conname name,pg_get_constraintdef(k.oid) definition,k.convalidated validated from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='garimpa' order by c.relname,k.conname`;
 const constraints=allConstraints.filter((k:any)=>!baselineConstraints.some((b:any)=>b.table_name===k.table_name&&b.name===k.name)||['product_curation_reviewer_user_fkey','editorial_selection_actor_user_fkey'].includes(k.name));
 const foreignKeys=await fx.admin`select c.relname table_name,k.conname name,nt.nspname||'.'||ct.relname target,
   array_to_string(array(select a.attname from unnest(k.conkey) with ordinality x(num,ord) join pg_attribute a on a.attrelid=k.conrelid and a.attnum=x.num order by x.ord),',') source_columns,
   array_to_string(array(select a.attname from unnest(k.confkey) with ordinality x(num,ord) join pg_attribute a on a.attrelid=k.confrelid and a.attnum=x.num order by x.ord),',') target_columns,
   k.convalidated validated from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace join pg_class ct on ct.oid=k.confrelid join pg_namespace nt on nt.oid=ct.relnamespace
   where n.nspname='garimpa' and k.contype='f' order by c.relname,k.conname`;
 const triggers=await fx.admin`select c.relname table_name,t.tgname name,pg_get_triggerdef(t.oid) definition,t.tgenabled enabled from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='garimpa' and not t.tgisinternal order by c.relname,t.tgname`;
 const inputs=manifest.units.filter((x:any)=>x.phase!=='scoped_cutover').map((x:any)=>({file:x.file,sha256:x.sha256}));
 await writeFile(new URL('../../docs/implementation/evidencias/rollout-31-expansion-catalog.json',import.meta.url),JSON.stringify({engine:fx.version,inputs,policies,functions,views,tables,columnAcls,constraints,foreignKeys,triggers},null,2)+'\n');
}finally{await fx.close();}
