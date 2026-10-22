import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {commercialFixture} from './commercial-fixture.ts';
const fixture=await commercialFixture({migrationCount:1});
const {pg,factory}=fixture;
await pg.exec(await readFile(new URL('../../packages/persistence/supabase/migrations/20261015035001_garimpa_affiliate_secret_bootstrap_rls.sql',import.meta.url),'utf8'));
await pg.exec(`insert into garimpa.affiliate_account(id,tenant_id,public_slug,display_name) values('aff_test_a','test_a','test-a','Test A'),('aff_test_b','test_b','test-b','Test B');
insert into garimpa.affiliate_secret(tenant_id,marketplace,secret_id,key_version,ciphertext,nonce,tag) values('test_a','synthetic','key','test','not-real','test','test'),('test_b','synthetic','key','test','not-real','test','test');`);
async function count(tenant?:string,role?:string,actor?:string){return factory().begin(async(tx:any)=>{
 if(tenant)await tx`select set_config('garimpa.tenant_id',${tenant},true)`;
 if(role)await tx`select set_config('garimpa.membership_role',${role},true)`;
 if(actor)await tx`select set_config('garimpa.actor_type',${actor},true)`;
 return (await tx`select count(*)::int n from garimpa.affiliate_secret`)[0].n;
});}
assert.equal(await count(),0);
assert.equal(await count('test_a','owner','human'),1);
assert.equal(await count('test_a','operator','human'),0);
assert.equal(await count('test_a',undefined,'worker'),1);
assert.equal(await count('test_b','owner','human'),1);
assert.equal(await count('unowned','owner','human'),0);
await pg.exec(`update garimpa.affiliate_account set status='suspended' where tenant_id='test_b'`);
assert.equal(await count('test_b','owner','human'),0);
await assert.rejects(()=>factory().begin(async(tx:any)=>{
 await tx`select set_config('garimpa.tenant_id','test_a',true)`;
 await tx`select set_config('garimpa.membership_role','owner',true)`;
 await tx`insert into garimpa.affiliate_secret(tenant_id,marketplace,secret_id,key_version,ciphertext,nonce,tag) values('test_b','synthetic','forged','test','not-real','test','test')`;
}),/row-level security/);
await pg.close();
console.log('PASS isolated M1 + narrow secret hardening: absent context/operator/foreign tenant/suspended deny; own owner/worker allowed; cross-account insert denied');
// The complete original chain remains compatible with the supplemental guard.
const complete=await commercialFixture();
assert.equal(complete.applied.length,6);
assert.equal((await complete.pg.query(`select relrowsecurity from pg_class where oid='garimpa.affiliate_secret'::regclass`)).rows[0].relrowsecurity,true);
await complete.pg.close();
console.log('PASS complete 14-file local chain remains installable');
