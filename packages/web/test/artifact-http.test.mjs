import assert from 'node:assert/strict';
import test from 'node:test';
import {artifactAccessFailure} from '../lib/artifact-http.ts';
test('R-01: unauthenticated artifact access returns 401; authenticated forbidden returns 403 without metadata',async()=>{
 for(const [kind,status] of [['no_session',401],['forbidden',403]]){
  const response=artifactAccessFailure(kind);assert.equal(response.status,status);
  assert.deepEqual(Object.keys(await response.json()),['error']);assert.equal(response.headers.get('cache-control'),'private, no-store');
 }
});
