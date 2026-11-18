import assert from "node:assert/strict";
import test from "node:test";
import { MonitoringLookup } from "../src/monitoring-lookup.ts";

test("reconsulta por API recusa AliExpress antes de acessar a rede", async () => {
  const lookup = new MonitoringLookup();
  await assert.rejects(
    lookup.byIdDetailed(
      { marketplace: "aliexpress", secret: { appKey: "key", appSecret: "secret", trackingId: "tag" } } as never,
      "123",
      { runId: "test", log: () => {} },
    ),
    /reconsulta por ID indisponível para aliexpress/,
  );
});
