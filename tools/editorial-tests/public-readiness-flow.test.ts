import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {commercialFixture} from './commercial-fixture.ts';
const require=createRequire(import.meta.url);
const {publicProjectionReady}=require('../../packages/web/lib/public-offer-db.ts');

// An installed detail function alone must not switch all public callers.
for(const [migrationCount,expected] of [[1,false],[6,false],[8,true]] as const){
  const {pg,factory}=await commercialFixture({migrationCount});
  try {
    assert.equal(await publicProjectionReady(factory),expected);
    assert.equal((await pg.query('select count(*)::int n from garimpa.short_link')).rows[0].n,0);
    assert.equal((await pg.query('select count(*)::int n from garimpa.click_event')).rows[0].n,0);
    if(expected){
      await pg.exec('drop function garimpa.public_catalog_stats(text,integer)');
      assert.equal(await publicProjectionReady(factory),false);
    }
    console.log(`PASS readiness at migration ${migrationCount} is ${expected}; probe writes no links/clicks`);
  } finally {await pg.close();}
}
console.log('Partial-install diagnostics do not authorize the M2-first rollout.');
