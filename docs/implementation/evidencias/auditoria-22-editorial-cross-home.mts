import {commercialFixture} from '../../../tools/editorial-tests/commercial-fixture.ts';
import {writeFile} from 'node:fs/promises';
const {pg,factory}=await commercialFixture();const results:any[]=[];
await pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_a','a','alpha','Alpha'),('aff_b','b','beta','Beta');
insert into garimpa.app_user(id,tenant_id,auth_user_id) values('user_a','a','auth_a');
insert into garimpa.affiliate_membership(affiliate_id,app_user_id,role) values('aff_b','user_a','operator');
insert into garimpa.app_user_role(app_user_id,role) values('user_a','afiliado');`);
await factory().begin(async(tx:any)=>{
 await tx`select set_config('garimpa.tenant_id','b',true),set_config('garimpa.actor_app_user_id','user_a',true),set_config('garimpa.membership_role','operator',true)`;
 results.push({name:'resolver permits cross-home member',rows:await tx`select affiliate_id from garimpa.resolve_actor_accounts('auth_a') where tenant_id='b'`});
 results.push({name:'existing editorial actor join under scoped RLS',rows:await tx`select u.id from garimpa.app_user u join garimpa.affiliate_membership m on m.app_user_id=u.id join garimpa.affiliate_account a on a.id=m.affiliate_id where u.id='user_a' and a.tenant_id='b' and m.revoked_at is null`});
});
try{await factory().begin(async(tx:any)=>{
 await tx`select set_config('garimpa.tenant_id','b',true),set_config('garimpa.actor_app_user_id','user_a',true)`;
 await tx`insert into garimpa.editorial_selection(tenant_id,version,status,valid_until,actor_app_user_id) values('b',1,'active',now()+interval '1 day','user_a')`;
 });results.push({name:'cross-home selection write',allowed:true});}catch(e:any){results.push({name:'cross-home selection write',allowed:false,error:e.message,code:e.code});}
await pg.close();await writeFile(new URL('./auditoria-22-editorial-cross-home.json',import.meta.url),JSON.stringify({environment:'isolated PGlite synthetic only',results},null,2)+'\n');console.log(JSON.stringify(results,null,2));
