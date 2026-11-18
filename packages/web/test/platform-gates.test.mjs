import assert from 'node:assert/strict';
import test from 'node:test';
import {captureEnabled} from '../lib/platform-gates.ts';

test('account API credentials do not need to be duplicated in global environment for the installation switch',()=>{
  assert.equal(captureEnabled('shopee',{SHOPEE_CAPTURE_ENABLED:'true'}),true);
  assert.equal(captureEnabled('aliexpress',{ALIEXPRESS_CAPTURE_ENABLED:'true'}),true);
});
test('credentials alone never enable a disabled source; unknown sources fail closed',()=>{
  const credentials={SHOPEE_APP_ID:'fixture',SHOPEE_APP_SECRET:'fixture',ALIEXPRESS_APP_KEY:'fixture',ALIEXPRESS_APP_SECRET:'fixture',ALIEXPRESS_TRACKING_ID:'fixture'};
  for(const value of [undefined,'false','TRUE','1','']) {
    assert.equal(captureEnabled('shopee',{...credentials,SHOPEE_CAPTURE_ENABLED:value}),false);
    assert.equal(captureEnabled('aliexpress',{...credentials,ALIEXPRESS_CAPTURE_ENABLED:value}),false);
  }
  assert.equal(captureEnabled('unknown',{}),false);
});
