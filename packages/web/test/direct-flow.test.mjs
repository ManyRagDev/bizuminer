import assert from "node:assert/strict";
import test from "node:test";
import {
  DIRECT_COUNTDOWN_SECONDS,
  DIRECT_FLAG_PREFIX,
  flagKey,
  nextCountdown,
  shouldFire,
} from "../lib/direct-flow.ts";

test("contador padrão é 3 segundos", () => {
  assert.equal(DIRECT_COUNTDOWN_SECONDS, 3);
});

test("flagKey isola por produto", () => {
  assert.equal(flagKey("ml-MLB123"), `${DIRECT_FLAG_PREFIX}ml-MLB123`);
  assert.notEqual(flagKey("ml-MLB123"), flagKey("ml-MLB456"));
});

test("nextCountdown decresce e para em zero", () => {
  assert.equal(nextCountdown(3), 2);
  assert.equal(nextCountdown(2), 1);
  assert.equal(nextCountdown(1), 0);
  assert.equal(nextCountdown(0), 0);
});

test("shouldFire só dispara no zero", () => {
  assert.equal(shouldFire(3), false);
  assert.equal(shouldFire(1), false);
  assert.equal(shouldFire(0), true);
});
