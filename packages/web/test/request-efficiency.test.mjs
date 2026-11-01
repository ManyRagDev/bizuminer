import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeAccountTransaction, releaseAccountTransaction} from '../lib/account-scope.ts';
import {databaseHandle} from '../lib/database-pool.ts';
import {withAccountDb} from '../lib/tenant-db.ts';
import {readInRequest, invalidateRequestReads} from '../lib/request-read.ts';
import {getUserMemberships, resolveAccountContext} from '../lib/account-context.ts';
import {createAdminDraftStore, adminDraftKey} from '../lib/admin-draft-store.ts';
import {normalizeAdminTab} from '../lib/admin-navigation.ts';

const human=(actor='a')=>({tenantId:'tenant',affiliateId:'aff',actor:'human',actorAppUserId:actor,authenticatedAuthUserId:'auth_'+actor,membershipRole:'owner',requestId:'request'});
function fixture(){
 const queries=[];let allowed=true;
 const tx=async(parts,...values)=>{
  const text=parts.join('?');queries.push({text,values});
  if(text.includes('to_regprocedure'))return [{ready:true}];
  if(text.includes('resolve_actor_accounts'))return allowed?[{affiliate_id:'aff'}]:[];
  return [{count:7}];
 };
 tx.unsafe=x=>x;
 const root=Object.assign(async()=>[],{end:async()=>{},unsafe:x=>x,begin:async(...args)=>args.at(-1)(tx)});
 return {tx,root,queries,revoke:()=>{allowed=false;},allow:()=>{allowed=true;}};
}

test('inherited and explicit authorization converge; only context preparation is grouped',async()=>{
 const f=fixture(),context=human();
 const value=await withAccountDb(context,tx=>tx`select business_count`,()=>databaseHandle(f.root,context));
 assert.equal(value[0].count,7);
 assert.equal(f.queries.filter(q=>q.text.includes('set_config')).length,1);
 assert.equal(f.queries.filter(q=>q.text.startsWith('select affiliate_id from garimpa.resolve_actor_accounts')).length,1);
 const settings=f.queries.find(q=>q.text.includes('set_config'));
 assert.equal((settings.text.match(/set_config/g)||[]).length,6);
 assert.deepEqual(settings.values,['tenant','human','a','owner','request']);
});

test('same-tenant actor changes are rejected; a later transaction revalidates membership',async()=>{
 const f=fixture(),context=human();
 await withAccountDb(context,async tx=>{
  await assert.rejects(()=>authorizeAccountTransaction(tx,human('b')),/forbidden_account_scope/);
 },()=>databaseHandle(f.root,context));
 f.revoke();
 await assert.rejects(()=>withAccountDb(context,async()=>{},()=>databaseHandle(f.root,context)),/forbidden/);
 assert.equal(f.queries.filter(q=>q.text.startsWith('select affiliate_id from garimpa.resolve_actor_accounts')).length,2);
 f.allow();
 await withAccountDb(context,async()=>{},()=>databaseHandle(f.root,context));
 assert.equal(f.queries.filter(q=>q.text.startsWith('select affiliate_id from garimpa.resolve_actor_accounts')).length,3);
});

test('failed authorization fixes its attempted identity until transaction cleanup',async()=>{
 const f=fixture();f.revoke();
 try {
  await assert.rejects(()=>authorizeAccountTransaction(f.tx,human()),/forbidden/);
  f.allow();
  await assert.rejects(()=>authorizeAccountTransaction(f.tx,human('b')),/forbidden_account_scope/);
  await assert.rejects(()=>authorizeAccountTransaction(f.tx,human()),/forbidden/);
  assert.equal(f.queries.filter(q=>q.text.startsWith('select affiliate_id from garimpa.resolve_actor_accounts')).length,1);
 }finally{releaseAccountTransaction(f.tx);}
 await authorizeAccountTransaction(f.tx,human('b'));
 releaseAccountTransaction(f.tx);
});

test('rollback releases the proof even when a test transport reuses a transaction object',async()=>{
 const f=fixture(),context=human();
 await assert.rejects(()=>withAccountDb(context,async()=>{throw Error('rollback');},()=>databaseHandle(f.root,context)),/rollback/);
 await withAccountDb(human('b'),async()=>{},()=>databaseHandle(f.root,human('b')));
 assert.equal(f.queries.filter(q=>q.text.startsWith('select affiliate_id from garimpa.resolve_actor_accounts')).length,2);
});

test('request reads share promises, separate identities and discard the previous mutation phase',async()=>{
 const request={},other={};let calls=0,finish;
 const old=readInRequest(['counter','a'],()=>new Promise(resolve=>{calls++;finish=resolve;}),request);
 assert.equal(old,readInRequest(['counter','a'],async()=>0,request));
 await Promise.resolve();
 invalidateRequestReads(request);
 const fresh=readInRequest(['counter','a'],async()=>{calls++;return 2;},request);
 finish(1);assert.equal(await old,1);assert.equal(await fresh,2);
 assert.equal(await readInRequest(['counter','a'],async()=>0,request),2);
 assert.equal(await readInRequest(['counter','b'],async()=>3,request),3);
 assert.equal(await readInRequest(['counter','a'],async()=>4,other),4);
 assert.equal(calls,2);
});

test('account resolution and the switcher reuse the same memberships for one explicit request',async()=>{
 const request={};let reads=0;
 const factory=()=>Object.assign(async()=>{reads++;return [{affiliate_id:'aff',tenant_id:'tenant',public_slug:'public',display_name:'Account',account_status:'active',membership_role:'owner',app_user_id:'a'}];},{end:async()=>{}});
 const [accounts,account]=await Promise.all([getUserMemberships('auth_a',factory,request),resolveAccountContext({authUserId:'auth_a',sqlFactory:factory,request})]);
 assert.equal(reads,1);assert.equal(account.tenantId,accounts[0].tenantId);
 assert.equal(await resolveAccountContext({authUserId:'auth_a',requestedAccount:'other',sqlFactory:factory,request}),null);
 assert.equal(reads,1);
 invalidateRequestReads(request);await getUserMemberships('auth_a',factory,request);assert.equal(reads,2);
});

test('draft keys isolate account and actor; pending writes survive remount and logout disposes old setters',()=>{
 const store=createAdminDraftStore(),a=adminDraftKey('user','a','actor','form'),b=adminDraftKey('user','b','actor','form');
 store.set(a,'draft','');assert.equal(store.get(a,''),'draft');assert.equal(store.get(b,''),'');
 assert.notEqual(a,adminDraftKey('user','a','other','form'));
 const pending=adminDraftKey('user','a','actor','pending');store.set(pending,true,false);assert.equal(store.get(pending,false),true);
 store.set(a,'late response','');assert.equal(store.get(b,''),'');
 store.dispose();store.set(a,'late after logout','');assert.equal(store.get(a,''),'');
});

test('only known admin panes load; absent and invalid parameters use the overview',()=>{
 for(const value of [undefined,'','unknown','../afiliados'])assert.equal(normalizeAdminTab(value),'visao-geral');
 for(const value of ['visao-geral','rodagens','captura-manual','publicacao','afiliados'])assert.equal(normalizeAdminTab(value),value);
});
