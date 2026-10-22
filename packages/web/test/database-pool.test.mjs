import test from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {databaseHandle} from '../lib/database-pool.ts';

const context=t=>({tenantId:t,affiliateId:'aff_'+t,actor:'worker',actorAppUserId:'u_'+t,authenticatedAuthUserId:null,membershipRole:null,requestId:'req_'+t});
test('database handles keep per-transaction accounts and end never closes another handle',async()=>{
 let rootEnds=0;
 const root=async()=>[{ok:true}];root.end=async()=>{rootEnds++;};root.unsafe=async()=>[{ok:true}];root.json=x=>JSON.stringify(x);
 root.begin=async(...args)=>{
  const settings={};const tx=async(parts,...values)=>{const text=parts.join('?');const key=text.match(/set_config\('([^']+)'/)?.[1];if(key)settings[key]=values[0];return [];};
  return args.at(-1)(Object.assign(tx,{settings}));
 };
 const originalBegin=root.begin;const a=databaseHandle(root,context('a')),b=databaseHandle(root,context('b'));
 const result=await Promise.all([a.begin(async tx=>{await Promise.resolve();return tx.settings['garimpa.tenant_id'];}),b.begin('read only',async tx=>tx.settings['garimpa.tenant_id'])]);
 assert.deepEqual(result,['a','b']);assert.equal(root.begin,originalBegin);
 await a.end();await a.end();assert.equal(rootEnds,0);
 await assert.rejects(()=>a.begin(async()=>{}),/database_handle_closed/);assert.throws(()=>a.unsafe('select 1'),/database_handle_closed/);
 assert.equal((await b`select 1`)[0].ok,true);await b.end();assert.equal(rootEnds,0);
});

test('lazy SQL prepared before end cannot start later; Query helpers remain chainable',async()=>{
 // An unreachable local target proves the closed-handle guard fires before the driver tries connecting.
 const root=postgres('postgres://synthetic@localhost:1/postgres',{max:1,ssl:false,connect_timeout:1,prepare:false});
 try {
  const a=databaseHandle(root),lazy=a`select 1`.values();
  const unsafe=a.unsafe('select 1').raw();
  const cursor=a`select 1`.cursor(1)[Symbol.asyncIterator]();
  await a.end();
  await assert.rejects(async()=>await lazy,/database_handle_closed/);
  await assert.rejects(async()=>await unsafe,/database_handle_closed/);
  assert.throws(()=>cursor.next(),/database_handle_closed/);
 }finally{await root.end({timeout:1});}
});

test('only handles for the same destination reuse a transport; credentials remain separated',async()=>{
 const {accountDatabase}=await import('../lib/database-pool.ts');
 const a=accountDatabase('postgres://synthetic_a@localhost:1/a');
 const same=accountDatabase('postgres://synthetic_a@localhost:1/a');
 const b=accountDatabase('postgres://synthetic_b@localhost:1/b');
 assert.equal(a.options,same.options);assert.notEqual(a.options,b.options);
 assert.equal(a.options.user,'synthetic_a');assert.equal(b.options.user,'synthetic_b');
 assert.equal(a.options.max,3);assert.equal(a.options.idle_timeout,5);
 await Promise.all([a.end(),same.end(),b.end()]);
});
