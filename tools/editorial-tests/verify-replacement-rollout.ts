/** Read-only local verifier. Does not connect, deploy, repair history or apply SQL. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {replacementRollout} from './replacement-rollout.ts';
const {manifest,units}=await replacementRollout();
assert.deepEqual(manifest.units.map((x:any)=>x.phase),['foundation','expansion','scoped_cutover']);
assert.equal(manifest.installedSubset.length,3);
assert.equal(manifest.supersedes.length,11);
assert.equal(manifest.legacyPoliciesReplaced.length,28);
for(const unit of units.filter(x=>x.phase!=='installedSubset')) {
 assert.equal(unit.transactionRequired,true);
 assert.equal(createHash('sha256').update('BEGIN;\n'+unit.sql+'\nCOMMIT;\n').digest('hex'),unit.manualTransactionSha256);
}
for(const item of manifest.supersedes){
 const bytes=await readFile(new URL('../../packages/persistence/supabase/migrations/'+item.file,import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,'historical_source_changed:'+item.file);
}
for(const item of manifest.compatibilitySources){
 const bytes=await readFile(new URL('../../'+item.path,import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,'compatibility_source_changed:'+item.path);
}
const catalogue=JSON.parse(await readFile(new URL('../../docs/implementation/evidencias/rollout-31-expansion-catalog.json',import.meta.url),'utf8'));
assert.deepEqual(catalogue.inputs,manifest.units.slice(0,2).map((x:any)=>({file:x.file,sha256:x.sha256})));
console.log(JSON.stringify({result:'PASS',scope:'local files only; no production authorization',units:manifest.units.map((x:any)=>({phase:x.phase,file:x.file,sha256:x.sha256})),installedSubsetPreserved:3,supersededOriginals:11,replacedLegacyPolicies:28,newCommercialTables:manifest.newCommercialTables.length},null,2));
