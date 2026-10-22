import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  CaptureBatchStore,
} = require("../../packages/web/lib/capture-batch-db.ts");
const {
  executeCaptureBatch,
} = require("../../packages/web/lib/capture-batch-worker.ts");
const {
  BrowserCaptureStore,
} = require("../../packages/web/lib/browser-capture-db.ts");
const {
  validateBrowserCapture,
} = require("../../packages/web/lib/browser-capture-contract.ts");
const {
  applyAutomatedTriageDecisions,
} = require("../../packages/web/lib/curation-db.ts");

const pg = new PGlite();
function adapter(client: Pick<PGlite, "query" | "exec">): any {
  const sql: any = async (
    parts: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    const parameters: unknown[] = [];
    let query = parts[0];
    values.forEach((value, i) => {
      parameters.push(value);
      query += `$${parameters.length}` + parts[i + 1];
    });
    return (await client.query(query, parameters)).rows;
  };
  sql.json = (value: unknown) => JSON.stringify(value);
  sql.end = async () => {};
  sql.begin = (run: (tx: any) => Promise<unknown>) =>
    pg.transaction((tx) => run(adapter(tx)));
  return sql;
}
const factory: any = () => adapter(pg);
const store = new CaptureBatchStore(factory);
const browserStore = new BrowserCaptureStore(factory);
const browserAccess = { appUserId: "owner", tenantId: "local" };
const browserPayload = () =>
  validateBrowserCapture({
    version: 1,
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    marketplace: "mercadolivre",
    clientCapturedAt: new Date().toISOString(),
    page: { kind: "offers", url: "https://www.mercadolivre.com.br/ofertas" },
    products: [
      {
        externalId: "MLB1234567890",
        title: "Fone Bluetooth",
        productUrl:
          "https://produto.mercadolivre.com.br/MLB-1234567890-fone-_JM",
        priceCents: 8990,
        originalPriceCents: 12000,
        ratingStar: 4.8,
        salesCount: 10000,
      },
      {
        externalId: "MLB9876543210",
        title: "Furadeira elétrica",
        productUrl:
          "https://www.mercadolivre.com.br/furadeira/p/MLB12345678?wid=MLB9876543210",
        priceCents: 30000,
      },
    ],
  });
const summary = {
  processed: 3,
  approved: 1,
  held: 1,
  rejected: 1,
  annotatedPending: 0,
};
let passed = 0;
async function scenario(label: string, run: () => Promise<void>) {
  await pg.exec(
    "truncate garimpa.price_observation,garimpa.product,garimpa.capture_batch,garimpa.capture_run,garimpa.triage_run",
  );
  await run();
  passed++;
  console.log(`PASS ${label}`);
}
async function captured(id: string, marketplace: string, status = "ok") {
  await pg.query(
    "insert into garimpa.capture_run(id,started_at,tenant_id,marketplace,status,parameters) values(gen_random_uuid()::text,now(),'local',$1,$2,$3)",
    [marketplace, status, JSON.stringify({ operationBatchId: id })],
  );
}
await pg.exec(`create schema garimpa;create role garimpa_app;create role service_role;
  create table garimpa.capture_run(id text not null,tenant_id text,marketplace text,
    status text,started_at timestamptz not null,finished_at timestamptz,error text,parameters jsonb);
  create table garimpa.triage_run(id uuid default gen_random_uuid(),tenant_id text,status text,
    finished_at timestamptz,error_message text,metadata jsonb default '{}');`);
await pg.exec(
  await readFile(
    new URL(
      "../../packages/persistence/supabase/migrations/20260917170000_operational_batches.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await pg.exec(`
  alter table garimpa.capture_run add primary key(id);
  alter table garimpa.capture_run add column collector_run_id text, add column items_captured int,
    add column items_new int, add column price_changes int;
  create table garimpa.product(id text primary key,tenant_id text,marketplace text,external_id text,title text,
    product_url text,image_url text,category text,family_key text,family_label text,family_method text,family_version text,
    last_price_cents int check(last_price_cents>0),first_seen_at timestamptz,last_seen_at timestamptz,last_capture_run_id text,updated_at timestamptz,
    unique(tenant_id,marketplace,external_id));
  create table garimpa.price_observation(id text,tenant_id text,capture_run_id text references garimpa.capture_run(id),
    product_id text references garimpa.product(id),price_cents int check(price_cents>0),original_price_cents int,claimed_discount_rate numeric,
    rating_star numeric,sales_count bigint,sales_label text,observed_at timestamptz,title_snapshot text,product_url_snapshot text,
    image_url_snapshot text,category_snapshot text,offer_evidence jsonb,capture_source text check(capture_source in ('sweep','extension','bookmarklet','legacy')),
    source_page_url text,client_captured_at timestamptz,unique(capture_run_id,product_id));
  create table garimpa.app_user_role(app_user_id text,role text,revoked_at timestamptz);
  create table garimpa.affiliate_account(id text,tenant_id text,status text);
  create table garimpa.affiliate_membership(app_user_id text,affiliate_id text,revoked_at timestamptz);
  create table garimpa.extension_device(id text,affiliate_id text,created_by_app_user_id text,revoked_at timestamptz);
  insert into garimpa.app_user_role values('owner','afiliado',null);
  insert into garimpa.affiliate_account values('aff_local','local','active');
  insert into garimpa.affiliate_membership values('owner','aff_local',null);
  insert into garimpa.extension_device values('device','aff_local','owner',null);
`);
try {
  await scenario(
    "Um lote ativo por tenant e um único dono por lote",
    async () => {
      const b = await store.create("local", ["shopee"], 1, "local", false);
      await assert.rejects(
        () => store.create("local", ["shopee"], 1, "local", false),
        /unique/i,
      );
      assert.ok(await store.claim(b.id, "first"));
      assert.equal(await store.claim(b.id, "second"), null);
      assert.equal(await store.claim(b.id, "third", "another-tenant"), null);
      assert.equal(await store.publicStatus(b.id, "another-tenant"), null);
    },
  );
  await scenario(
    "Terminar uma consulta não encerra a captura da loja",
    async () => {
      const b = await store.create("local", ["shopee"], 1, "local", false);
      await store.claim(b.id, "owner");
      await captured(b.id, "shopee");
      const view = await store.publicStatus(b.id);
      assert.equal(view?.status, "running");
      assert.equal(view?.finished_at, null);
      assert.equal(view?.marketplaces[0].runs, 1);
      assert.equal("workerId" in view!, false); // Internal execution credentials are not returned to the browser.
    },
  );
  await scenario(
    "Falha antes do primeiro insert encerra lote, sem executar IA",
    async () => {
      const b = await store.create("local", ["shopee"], 1, "local", false);
      let calls = 0;
      await executeCaptureBatch(
        b.id,
        async (step: any) => {
          assert.equal(step.kind, "capture");
          calls++;
          return { ok: false, error: "spawn_failed" };
        },
        store,
      );
      assert.equal(calls, 1);
      assert.equal((await store.publicStatus(b.id))?.status, "error");
      assert.ok((await store.publicStatus(b.id))?.finished_at);
      assert.equal(
        await executeCaptureBatch(
          b.id,
          async () => {
            throw new Error("duplicate");
          },
          store,
        ),
        false,
      );
    },
  );
  await scenario(
    "Uma loja falha; a outra termina; triagem persistida é parcial e executada uma vez",
    async () => {
      const b = await store.create(
        "local",
        ["shopee", "aliexpress"],
        1,
        "github",
        false,
      );
      const calls: string[] = [];
      await executeCaptureBatch(
        b.id,
        async (step: any) => {
          calls.push(step.kind + ":" + (step.marketplace ?? "batch"));
          if (step.marketplace === "shopee")
            return { ok: false, error: "step_timeout" };
          if (step.marketplace) {
            await captured(b.id, step.marketplace);
            return { ok: true };
          }
          assert.equal((await store.publicStatus(b.id))?.phase, "triaging");
          return { ok: true, triage: summary };
        },
        store,
      );
      const result = await store.publicStatus(b.id);
      assert.equal(result?.status, "partial");
      assert.deepEqual(result?.triage, summary);
      assert.deepEqual(calls, [
        "capture:shopee",
        "capture:aliexpress",
        "triage:batch",
      ]);
    },
  );
  await scenario(
    "Captura e IA bem sucedidas encerram lote sem leitura do navegador",
    async () => {
      const b = await store.create("local", ["shopee"], 1, "github", false);
      await executeCaptureBatch(
        b.id,
        async (step: any) => {
          if (step.marketplace) {
            await captured(b.id, step.marketplace);
            return { ok: true };
          }
          return { ok: true, triage: summary };
        },
        store,
      );
      assert.equal((await store.read(b.id))?.status, "ok");
    },
  );
  await scenario(
    "Falha da IA fecha sua execução e preserva captura concluída",
    async () => {
      const b = await store.create("local", ["shopee"], 1, "local", false);
      await executeCaptureBatch(
        b.id,
        async (step: any) => {
          if (step.marketplace) {
            await captured(b.id, step.marketplace);
            return { ok: true };
          }
          await pg.query(
            "insert into garimpa.triage_run(tenant_id,status,metadata) values('local','running',$1)",
            [JSON.stringify({ captureBatchId: b.id })],
          );
          return { ok: false, error: "step_timeout" };
        },
        store,
      );
      assert.equal((await store.read(b.id))?.status, "partial");
      assert.equal(
        (await pg.query<any>("select status from garimpa.triage_run")).rows[0]
          .status,
        "error",
      );
    },
  );
  await scenario(
    "Timeout encerra filhos órfãos, libera próxima captura e impede escrita tardia",
    async () => {
      const b = await store.create("local", ["shopee"], 1, "local", false);
      const claimed = await store.claim(b.id, "owner");
      await captured(b.id, "shopee", "running");
      await pg.query(
        "update garimpa.capture_batch set metadata=jsonb_set(metadata,'{execution,deadline}',to_jsonb((now()-interval '1 minute')::text)) where id=$1",
        [b.id],
      );
      assert.deepEqual(await store.expire(), [b.id]);
      assert.deepEqual(await store.expire(), []);
      await assert.rejects(
        () => store.update(b.id, "owner", claimed!.metadata.execution!),
        /ownership_lost/,
      );
      assert.equal(
        (await pg.query<any>("select status from garimpa.capture_run")).rows[0]
          .status,
        "error",
      );
      assert.ok(await store.create("local", ["shopee"], 1, "local", false));
    },
  );
  await scenario(
    "Órfão legado sem consultas também expira e preserva metadata",
    async () => {
      await pg.exec(
        "insert into garimpa.capture_batch(tenant_id,requested_marketplaces,pages,started_at,metadata) values('local',array['shopee'],1,now()-interval '3 hours','{\"legacy\":true}')",
      );
      const result = await store.publicStatus();
      assert.equal(result?.status, "error");
      assert.equal(result?.error, "execution_timeout");
      assert.equal((await store.read())?.metadata.legacy, true);
    },
  );
  await scenario(
    "Falha no despacho só fecha lote ainda não iniciado",
    async () => {
      const b = await store.create("local", ["shopee"], 1, "local", false);
      await store.claim(b.id, "owner");
      await store.dispatchFailed(b.id);
      assert.equal((await store.read(b.id))?.status, "running");
    },
  );
  await scenario(
    "Mercado Livre sem consentimento não executa o coletor nem IA",
    async () => {
      const b = await store.create(
        "local",
        ["mercadolivre"],
        1,
        "github",
        false,
      );
      let calls = 0;
      await executeCaptureBatch(
        b.id,
        async () => {
          calls++;
          return { ok: true };
        },
        store,
      );
      assert.equal(calls, 0);
      assert.equal((await store.read(b.id))?.status, "error");
    },
  );
  await scenario(
    "Decisões de IA de lote encerrado são bloqueadas antes de qualquer escrita",
    async () => {
      const b = await store.create("local", ["shopee"], 1, "local", false);
      await store.dispatchFailed(b.id);
      await assert.rejects(
        () =>
          applyAutomatedTriageDecisions(
            [{}] as any,
            "local",
            undefined,
            factory,
            { id: b.id, workerId: "late" },
          ),
        /ownership_lost/,
      );
    },
  );
  await scenario(
    "ML com dono de contingência entra em awaiting_browser sem tentar automação (AC-027.2)",
    async () => {
      const b = await store.create("local", ["mercadolivre"], 1, "local", true, "owner");
      let captureCalls = 0;
      let triageCalls = 0;
      await executeCaptureBatch(b.id, async (step: any) => {
        if (step.kind === "capture") {
          captureCalls++;
          return { ok: true };
        }
        triageCalls++;
        return { ok: true, triage: summary };
      }, store);
      assert.equal(captureCalls, 0, "ML nunca deve chamar runStep(capture)");
      assert.equal(triageCalls, 0, "Sem ofertas importadas, triagem não executa");
      const waiting = await store.publicStatus(b.id);
      assert.equal(waiting?.status, "running");
      assert.equal(waiting?.phase, "awaiting_browser");
      assert.equal(waiting?.browser?.canContinue, true);

      const payload = browserPayload();
      const imported = await browserStore.complete(browserAccess, b.id, payload);
      assert.equal(imported.importedCount, 2);

      await executeCaptureBatch(b.id, async (step: any) => {
        assert.equal(step.kind, "triage");
        triageCalls++;
        return { ok: true, triage: summary };
      }, store);
      assert.equal(captureCalls, 0);
      assert.equal(triageCalls, 1);
      const result = await store.publicStatus(b.id);
      assert.equal(result?.status, "ok");
      assert.equal(result?.phase, "finished");
    },
  );
  await scenario(
    "Lote legado de ML sem contingência é rejeitado sem chamar runStep nem IA (AC-027.2)",
    async () => {
      const b = await store.create("local", ["mercadolivre"], 1, "local", true);
      let calls = 0;
      await executeCaptureBatch(b.id, async () => {
        calls++;
        return { ok: true };
      }, store);
      assert.equal(calls, 0, "ML sem contingência não deve chamar runStep");
      const result = await store.publicStatus(b.id);
      assert.equal(result?.status, "error");
      assert.equal(result?.error, "capture_failed");
    },
  );
  await scenario(
    "Lote misto legado com ML: zero chamadas ML, Shopee executa uma vez e aguarda navegador (AC-027.2)",
    async () => {
      const b = await store.create(
        "local",
        ["mercadolivre", "shopee"],
        1,
        "local",
        true,
        "owner",
      );
      const calls: string[] = [];
      await executeCaptureBatch(
        b.id,
        async (step: any) => {
          calls.push(step.kind + ":" + step.marketplace);
          if (step.marketplace === "shopee") {
            await captured(b.id, step.marketplace);
            return { ok: true };
          }
          return { ok: false };
        },
        store,
      );
      assert.deepEqual(calls, ["capture:shopee"], "Shopee chamada 1x e ML 0x");
      const waiting = await store.publicStatus(b.id);
      assert.equal(waiting.phase, "awaiting_browser");
      assert.equal(waiting.browser.canContinue, true);
      assert.equal(
        (await store.read(b.id)).metadata.execution.workerId,
        undefined,
      );
      assert.equal(JSON.stringify(waiting).includes("ownerAppUserId"), false);
      assert.equal(await browserStore.pending(browserAccess), b.id);
      await assert.rejects(
        () => browserStore.pending({ appUserId: "other", tenantId: "local" }),
        /browser_capture_forbidden/,
      );
      const payload = browserPayload();
      const imported = await browserStore.complete(
        browserAccess,
        b.id,
        payload,
      );
      assert.equal(imported.importedCount, 2);
      assert.equal(imported.queued, true);
      assert.equal((await store.publicStatus(b.id)).browser.canResume, true);
      assert.equal(
        (
          await pg.query<any>(
            "select count(*)::int as n from garimpa.price_observation",
          )
        ).rows[0].n,
        2,
      );
      const observation = (
        await pg.query<any>(
          "select o.*,r.parameters from garimpa.price_observation o join garimpa.capture_run r on r.id=o.capture_run_id limit 1",
        )
      ).rows[0];
      assert.equal(observation.parameters.operationBatchId, b.id);
      assert.equal(observation.capture_source, "bookmarklet");
      assert.equal(observation.offer_evidence.source.method, "browser");
      assert.equal(
        (await browserStore.complete(browserAccess, b.id, payload)).duplicate,
        true,
      );
      await assert.rejects(
        () =>
          browserStore.complete(browserAccess, b.id, {
            ...payload,
            products: [{ ...payload.products[0], priceCents: 100 }],
          }),
        /already_completed/,
      );
      await executeCaptureBatch(
        b.id,
        async (step: any) => {
          assert.equal(step.kind, "triage");
          calls.push("triage");
          return { ok: true, triage: summary };
        },
        store,
      );
      assert.equal((await store.read(b.id)).status, "ok");
      assert.deepEqual(calls, ["capture:shopee", "triage"]);
      assert.equal(
        (await browserStore.complete(browserAccess, b.id, payload)).queued,
        false,
      );
      assert.equal(
        await executeCaptureBatch(
          b.id,
          async () => {
            throw new Error("duplicate AI");
          },
          store,
        ),
        false,
      );
    },
  );
  await scenario(
    "Lote misto legado que omite ML conclui com status partial e triagem não usa ML ausente como sucesso (AC-027.2)",
    async () => {
      const b = await store.create(
        "local",
        ["mercadolivre", "shopee"],
        1,
        "local",
        true,
        "owner",
      );
      const calls: string[] = [];
      await executeCaptureBatch(
        b.id,
        async (step: any) => {
          calls.push(step.kind + ":" + (step.marketplace ?? "batch"));
          if (step.marketplace === "shopee") {
            await captured(b.id, step.marketplace);
            return { ok: true };
          }
          return { ok: true, triage: summary };
        },
        store,
      );
      assert.deepEqual(calls, ["capture:shopee"]);

      await browserStore.complete(browserAccess, b.id, null);

      await executeCaptureBatch(
        b.id,
        async (step: any) => {
          calls.push("triage");
          return { ok: true, triage: summary };
        },
        store,
      );
      assert.deepEqual(calls, ["capture:shopee", "triage"]);
      const result = await store.publicStatus(b.id);
      assert.equal(result.status, "partial");
      const ml = result.marketplaces.find((m: any) => m.marketplace === "mercadolivre");
      const shopee = result.marketplaces.find((m: any) => m.marketplace === "shopee");
      assert.equal(ml.status, "error");
      assert.equal(shopee.status, "ok");
    },
  );
  await scenario(
    "Importação rejeita outro dono/tenant, dispositivo revogado e lote que ainda captura",
    async () => {
      const b = await store.create(
        "local",
        ["mercadolivre"],
        1,
        "local",
        true,
        "owner",
      );
      const payload = browserPayload();
      await assert.rejects(
        () => browserStore.complete(browserAccess, b.id, payload),
        /not_waiting/,
      );
      await executeCaptureBatch(
        b.id,
        async () => {
          return { ok: false, error: "ml_access_verification_required" };
        },
        store,
      );
      await assert.rejects(
        () =>
          browserStore.complete(
            { appUserId: "other", tenantId: "local" },
            b.id,
            payload,
          ),
        /forbidden/,
      );
      await assert.rejects(
        () =>
          browserStore.complete(
            { appUserId: "owner", tenantId: "other" },
            b.id,
            payload,
          ),
        /forbidden/,
      );
      await pg.exec(
        "update garimpa.extension_device set revoked_at=now() where id='device'",
      );
      await assert.rejects(
        () =>
          browserStore.complete(
            { ...browserAccess, deviceId: "device" },
            b.id,
            payload,
          ),
        /forbidden/,
      );
      await pg.exec(
        "update garimpa.extension_device set revoked_at=null where id='device'",
      );
      assert.equal(
        (await pg.query<any>("select count(*)::int as n from garimpa.product"))
          .rows[0].n,
        0,
      );
      assert.equal(
        (
          await browserStore.complete(
            { ...browserAccess, deviceId: "device" },
            b.id,
            payload,
          )
        ).importedCount,
        2,
      );
      assert.equal(
        (
          await pg.query<any>(
            "select distinct capture_source from garimpa.price_observation",
          )
        ).rows[0].capture_source,
        "extension",
      );
    },
  );
  await scenario(
    "Falha na segunda oferta reverte produtos, observações e filho, preservando a espera",
    async () => {
      const b = await store.create(
        "local",
        ["mercadolivre"],
        1,
        "local",
        true,
        "owner",
      );
      await executeCaptureBatch(
        b.id,
        async () => {
          return { ok: false, error: "ml_access_verification_required" };
        },
        store,
      );
      const p = browserPayload();
      p.products[1].priceCents = -1; // Simulate an unexpected persistence failure after route validation.
      await assert.rejects(
        () => browserStore.complete(browserAccess, b.id, p),
        /check constraint/i,
      );
      for (const table of ["product", "price_observation", "capture_run"])
        assert.equal(
          (
            await pg.query<any>(
              `select count(*)::int as n from garimpa.${table}`,
            )
          ).rows[0].n,
          0,
        );
      assert.equal(
        (await store.read(b.id)).metadata.execution.phase,
        "awaiting_browser",
      );
    },
  );
  await scenario(
    "Lote vencido impede importação; omitir ML permite finalizar sem IA vazia",
    async () => {
      const b = await store.create(
        "local",
        ["mercadolivre"],
        1,
        "local",
        true,
        "owner",
      );
      await executeCaptureBatch(
        b.id,
        async () => {
          return { ok: false, error: "ml_access_verification_required" };
        },
        store,
      );
      await pg.query(
        "update garimpa.capture_batch set metadata=jsonb_set(metadata,'{execution,deadline}',to_jsonb((now()-interval '1 minute')::text)) where id=$1",
        [b.id],
      );
      await assert.rejects(
        () => browserStore.complete(browserAccess, b.id, browserPayload()),
        /not_waiting/,
      );
      await store.expire();
      const next = await store.create(
        "local",
        ["mercadolivre"],
        1,
        "local",
        true,
        "owner",
      );
      await executeCaptureBatch(
        next.id,
        async () => {
          return { ok: false, error: "ml_access_verification_required" };
        },
        store,
      );
      await browserStore.complete(browserAccess, next.id, null);
      assert.equal(
        (await browserStore.complete(browserAccess, next.id, null)).duplicate,
        true,
      );
      await executeCaptureBatch(
        next.id,
        async () => {
          throw new Error("empty AI forbidden");
        },
        store,
      );
      assert.equal((await store.read(next.id)).status, "error");
    },
  );
  console.log(`${passed} cenários PostgreSQL isolado passaram.`);
} finally {
  await pg.close();
}
