import {commercialFixture} from '../../../tools/editorial-tests/commercial-fixture.ts';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// This is the ORIGINAL candidate diagnostic. Never overwrite its historical
// evidence with results from repaired migrations under the same filename.
const catalogue=JSON.parse(await readFile(new URL('./mcp-21-catalogo-migrations.json',import.meta.url),'utf8'));
for(const migration of catalogue.migrations){
 const bytes=await readFile(new URL('../../../'+migration.path,import.meta.url));
 if(createHash('sha256').update(bytes).digest('hex')!==migration.sha256)
  throw new Error('Original candidate changed; use a separate re-evaluation harness: '+migration.path);
}
const results:any[]=[];
const capture=async(name:string,work:()=>Promise<any>)=>{try{results.push({name,result:await work()});}catch(e:any){results.push({name,error:e.message,code:e.code,constraint:e.constraint_name});}};
const seed=`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_a','a','alpha','Alpha'),('aff_b','b','beta','Beta');
insert into garimpa.app_user(id,tenant_id,auth_user_id) values('user_a','a','auth_a'),('user_b','b','auth_b');
insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_a','user_a','owner'),('aff_b','user_b','owner'),('aff_b','user_a','operator');
insert into garimpa.app_user_role(app_user_id,role) values('user_a','afiliado'),('user_b','afiliado');
insert into garimpa.product(id,tenant_id,marketplace,external_id,title,product_url,last_price_cents) values('product_a','a','mercadolivre','1','A','https://produto.mercadolivre.com.br/MLB-1',100),('product_b','b','mercadolivre','2','B','https://produto.mercadolivre.com.br/MLB-2',100);
insert into garimpa.product_curation(tenant_id,product_id,status) values('a','product_a','pending'),('b','product_b','pending');`;
const f=await commercialFixture({migrationCount:1});
await f.pg.exec(seed);
await capture('M1 runtime legacy product read without context',async()=>await f.factory()`select count(*)::int n from garimpa.product`);
await f.pg.exec(await readFile(new URL('../../../packages/persistence/supabase/migrations/20261014101000_garimpa_tenant_rls_scoped.sql',import.meta.url),'utf8'));
await capture('M2 runtime legacy product read without context',async()=>await f.factory()`select count(*)::int n from garimpa.product`);
await capture('M2 public projection unavailable',async()=>await f.factory()`select to_regprocedure('garimpa.public_deal_detail(text)') is not null ready`);
await capture('M2 login bootstrap select no context',async()=>await f.factory()`select id from garimpa.app_user where auth_user_id='auth_a'`);
await capture('M2 login bootstrap insert no context',async()=>await f.factory().begin(async(tx:any)=>await tx`insert into garimpa.app_user(id,tenant_id,auth_user_id) values('new_user','a','new_auth') returning id`));
await capture('M2 legitimate cross-home member cannot record curation',async()=>await f.factory().begin(async(tx:any)=>{
 await tx`select set_config('garimpa.tenant_id','b',true)`;
 await tx`select set_config('garimpa.actor_app_user_id','user_a',true)`;
 await tx`select set_config('garimpa.membership_role','operator',true)`;
 return await tx`update garimpa.product_curation set reviewed_by_app_user_id='user_a' where product_id='product_b' returning product_id`;
}));
await f.pg.close();
const complete=await commercialFixture(); await complete.pg.exec(seed);
await capture('M11 owner B can insert invitation naming affiliate A',async()=>await complete.factory().begin(async(tx:any)=>{
 await tx`select set_config('garimpa.tenant_id','b',true)`;
 await tx`select set_config('garimpa.actor_app_user_id','user_b',true)`;
 await tx`select set_config('garimpa.membership_role','owner',true)`;
 return await tx`insert into garimpa.account_invitation(tenant_id,affiliate_id,token_hash,invited_email,role,expires_at,created_by) values('b','aff_a','synthetic-hash','b@example.invalid','owner',now()+interval '1 day','user_b') returning tenant_id,affiliate_id`;
}));
await capture('M11 forged invitation grants owner membership in A',async()=>await complete.factory()`select * from garimpa.accept_account_invitation('synthetic-hash','user_b','auth_b','b@example.invalid')`);
await capture('M11 resolver exposes acquired A membership',async()=>await complete.factory()`select tenant_id,membership_role from garimpa.resolve_actor_accounts('auth_b') order by tenant_id`);
await capture('M12 dispatch attempt FK catalogue',async()=>await complete.pg.query(`select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='garimpa.dispatch_attempt'::regclass and contype='f'`));
await complete.pg.close();
await writeFile(new URL('./auditoria-22-probes.json',import.meta.url),JSON.stringify({environment:'PGlite memory only; synthetic data; no remote writes; diagnostics, not acceptance',results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
