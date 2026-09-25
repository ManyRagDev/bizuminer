import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleAllowed } from "../src/monitoring-schedule.ts";

test("cron respeita a escolha da conta; disparo manual continua explícito", () => {
  assert.equal(scheduleAllowed("schedule", false), false);
  assert.equal(scheduleAllowed("schedule", true), true);
  assert.equal(scheduleAllowed("workflow_dispatch", false), true);
});
