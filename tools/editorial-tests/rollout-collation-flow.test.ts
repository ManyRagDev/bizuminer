import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {nativePostgresFixture} from './native-postgres-fixture.ts';

// Only the exact inventory guard is exercised here. Full cutover/RLS behavior
// remains covered by replacement-rollout-flow and operational-maintenance-flow.
// Every connection below belongs to this fresh disposable native server.
const require=createRequire(new URL('../../packages/web/package.json',import.meta.url));
const postgres=require('postgres');
const fx=await nativePostgresFixture();
const catalogue=JSON.parse(await readFile(new URL('../../docs/implementation/evidencias/rollout-31-expansion-catalog.json',import.meta.url),'utf8'));
const sql=await readFile(new URL('../../packages/persistence/supabase/rollouts/v2/20261015194759_garimpa_v2_scoped_cutover.sql',import.meta.url),'utf8');
const guard=sql.split('\n').filter(line=>line.includes("raise exception 'rollout_function_inventory_mismatch'"));
assert.equal(guard.length,1);
assert.match(guard[0],/order by p\.oid::regprocedure::text COLLATE "C"/);
const oldGuard=guard[0].replace(' COLLATE "C"','');
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
const results:any[]=[];
let client:any;
try {
 for(const [database,locale] of [['collation_c','C'],['collation_us','en_US.UTF-8']]) {
  await fx.admin.unsafe(`create database ${quote(database)} template template0 encoding 'UTF8' lc_collate '${locale}' lc_ctype '${locale}'`);
  client=postgres({host:'127.0.0.1',port:Number(fx.admin.options.port[0]),database,username:'postgres',max:1,prepare:false,onnotice:()=>{}});
  await client.unsafe('create schema garimpa; create table garimpa.rollout_control(enabled boolean); insert into garimpa.rollout_control values(false); alter table garimpa.rollout_control enable row level security; create policy preserved on garimpa.rollout_control for select using(false)');
  // These synthetic signatures test inventory semantics, not function bodies.
  const define=async(signature:string)=>client.unsafe(`create function ${signature} returns integer language sql as 'select 1'`);
  for(const f of catalogue.functions)await define(f.signature);
  const policyState=async()=>JSON.stringify(await client`select policyname,qual from pg_policies where schemaname='garimpa' order by policyname`);
  const before=await policyState();
  const execute=async(body:string)=>client.begin(async(tx:any)=>{await tx.unsafe('set local search_path=pg_catalog');await tx.unsafe(body);});
  const reject=async(body:string)=>{
   await assert.rejects(()=>execute(body+'; update garimpa.rollout_control set enabled=true'),/rollout_function_inventory_mismatch/);
   assert.equal((await client`select enabled from garimpa.rollout_control`)[0].enabled,false);
   assert.equal(await policyState(),before);
  };
  if(locale==='C')await execute(oldGuard);else await reject(oldGuard);
  results.push({locale,scenario:'old guard reproduces locale-dependent result',result:'PASS'});
  await execute(guard[0]);
  results.push({locale,scenario:'exact expected signatures accepted',result:'PASS'});
  await define('garimpa.unexpected_extra()');await reject(guard[0]);await client.unsafe('drop function garimpa.unexpected_extra()');
  results.push({locale,scenario:'extra signature rejected; gate/policy preserved',result:'PASS'});
  const missing='garimpa.public_catalog(text,jsonb)';
  await client.unsafe('drop function '+missing);await reject(guard[0]);await define(missing);
  results.push({locale,scenario:'missing signature rejected; gate/policy preserved',result:'PASS'});
  await define('garimpa.public_catalog(text,text)');await reject(guard[0]);await client.unsafe('drop function garimpa.public_catalog(text,text)');
  results.push({locale,scenario:'unexpected overload rejected; gate/policy preserved',result:'PASS'});
  await execute(guard[0]);assert.equal(await policyState(),before);
  await client.end({timeout:3});client=null;
  await fx.admin.unsafe('drop database '+quote(database));
 }
 console.log(JSON.stringify({engine:fx.version,results},null,2));
} finally {if(client)await client.end({timeout:3});await fx.close();}
