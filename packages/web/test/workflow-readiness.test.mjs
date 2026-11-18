import assert from 'node:assert/strict';
import test from 'node:test';
import { verifiedWorkflowsReady, verifiedWorkflowsStatus } from '../lib/workflow-readiness.ts';

function factory({missing=[],rollout=false,errorAt}={}) {
 const calls=[];let closed=0;
 const sql=async(parts)=>{
  const query=parts.join('?');calls.push(query);
  if(errorAt===calls.length)throw new Error('database_failure');
  assert.match(query.trim(),/^select /i,'readiness must only read');
  if(query.includes('to_regclass')) {
   for(const object of ['garimpa.private_artifact','garimpa.governance_decision','garimpa.dispatch_control','garimpa.commercial_rollout_ready()'])
    assert.ok(query.includes(`'${object}'`),'schema probe must include '+object);
   return [{ready:missing.length===0}];
  }
  assert.match(query,/^select garimpa\.commercial_rollout_ready\(\) as ready$/);
  return [{ready:rollout}];
 };
 sql.end=async()=>{closed++;};
 return {create:()=>sql,calls,get closed(){return closed;}};
}

test('schema absent includes missing rollout function and never calls the activation gate',async()=>{
 for(const name of ['private_artifact','governance_decision','dispatch_control','commercial_rollout_ready']) {
  const probe=factory({missing:[name],rollout:true});
  assert.equal(await verifiedWorkflowsStatus(probe.create),'schema_missing');
  assert.equal(probe.calls.length,1);assert.equal(probe.closed,1);
 }
});
test('installed schema with rollout OFF reports disabled rather than missing migration',async()=>{
 const probe=factory({rollout:false});
 assert.equal(await verifiedWorkflowsStatus(probe.create),'rollout_disabled');
 assert.equal(probe.calls.length,2);assert.equal(probe.closed,1);
});
test('installed schema and rollout ON report ready; compatibility boolean stays closed otherwise',async()=>{
 const probe=factory({rollout:true});
 assert.equal(await verifiedWorkflowsStatus(probe.create),'ready');assert.equal(probe.closed,1);
 for(const [options,expected] of [[{rollout:true},true],[{rollout:false},false],[{missing:['private_artifact'],rollout:true},false],[{rollout:null},false],[{rollout:'true'},false]]) {
  const legacy=factory(options);assert.equal(await verifiedWorkflowsReady(legacy.create),expected);assert.equal(legacy.closed,1);
 }
});
test('database and permission errors propagate without reporting ready, and handles always close',async()=>{
 for(const errorAt of [1,2])for(const check of [verifiedWorkflowsStatus,verifiedWorkflowsReady]) {
  const probe=factory({rollout:true,errorAt});await assert.rejects(()=>check(probe.create),/database_failure/);assert.equal(probe.closed,1);
 }
});
