import { test } from "node:test";
import assert from "node:assert/strict";
import {
  escapeTelegramMarkdownV2,
  TelegramDistributionAdapter,
  WebhookDistributionAdapter,
  getDistributionAdapter,
} from "../lib/distribution-channel-adapters.ts";

test("escapeTelegramMarkdownV2 escapes all Telegram special characters", () => {
  const raw = "Super Oferta! De R$ 100,00 por R$ 80,00 (Desconto de 20%) [Link] #promo +frete -juros.";
  const escaped = escapeTelegramMarkdownV2(raw);

  // Nenhum dos caracteres especiais pode aparecer sem barra invertida antes
  assert.ok(escaped.includes("\\!"));
  assert.ok(escaped.includes("\\("));
  assert.ok(escaped.includes("\\)"));
  assert.ok(escaped.includes("\\["));
  assert.ok(escaped.includes("\\]"));
  assert.ok(escaped.includes("\\#"));
  assert.ok(escaped.includes("\\+"));
  assert.ok(escaped.includes("\\-"));
  assert.ok(escaped.includes("\\."));
});

test("TelegramDistributionAdapter validates destination targets", async () => {
  const adapter = new TelegramDistributionAdapter();

  const validPublic = await adapter.validateDestination("@canal_bizuminer");
  assert.equal(validPublic.valid, true);

  const validChatId = await adapter.validateDestination("-1001234567890");
  assert.equal(validChatId.valid, true);

  const invalid = await adapter.validateDestination("canal_sem_arroba");
  assert.equal(invalid.valid, false);
});

test("TelegramDistributionAdapter handles 200 OK response from Bot API", async () => {
  const fakeFetch = async (url, options) => {
    assert.ok(url.includes("api.telegram.org"));
    assert.equal(options.method, "POST");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: { message_id: 998877 },
      }),
    };
  };

  const adapter = new TelegramDistributionAdapter(async () => "test-token-123", fakeFetch);
  const result = await adapter.sendApprovedRevision({
    destination: {
      id: "dest-1",
      targetRef: "@canal_teste",
      secretRef: "sec-tg",
    },
    text: "Oferta imperdível!",
    link: "https://bizuminer.com/p/abc1",
    idempotencyKey: "idem-tg-001",
  });

  assert.equal(result.kind, "sent");
  assert.equal(result.providerMessageId, "998877");
});

test("TelegramDistributionAdapter handles rate-limiting (429)", async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 429,
    json: async () => ({
      ok: false,
      error_code: 429,
      description: "Too Many Requests: retry after 45",
      parameters: { retry_after: 45 },
    }),
  });

  const adapter = new TelegramDistributionAdapter(async () => "test-token-123", fakeFetch);
  const result = await adapter.sendApprovedRevision({
    destination: { id: "dest-1", targetRef: "@canal_teste" },
    text: "Oferta",
    link: "https://bizuminer.com/p/abc1",
    idempotencyKey: "idem-tg-002",
  });

  assert.equal(result.kind, "rejected");
  assert.equal(result.code, "RATE_LIMITED");
  assert.equal(result.retryable, true);
  assert.equal(result.retryAfterSeconds, 45);
});

test("TelegramDistributionAdapter aborts before transport if signal was cancelled", async () => {
  const controller = new AbortController();
  controller.abort();

  const adapter = new TelegramDistributionAdapter();
  const result = await adapter.sendApprovedRevision({
    destination: { id: "dest-1", targetRef: "@canal_teste" },
    text: "Oferta",
    link: "https://bizuminer.com/p/abc1",
    idempotencyKey: "idem-tg-003",
    signal: controller.signal,
  });

  assert.equal(result.kind, "unknown");
  assert.equal(result.reason, "ABORTED_BEFORE_TRANSPORT");
});

test("WebhookDistributionAdapter validates HTTPS targets and signs payload with HMAC", async () => {
  let capturedHeaders = {};
  let capturedBody = "";

  const fakeFetch = async (url, options) => {
    capturedHeaders = options.headers;
    capturedBody = options.body;
    return {
      ok: true,
      status: 200,
    };
  };

  const adapter = new WebhookDistributionAdapter(async () => "my-secret-key", fakeFetch);

  // Validação de URL
  assert.equal((await adapter.validateDestination("http://insecure.com")).valid, false);
  assert.equal((await adapter.validateDestination("https://webhook.site/abc")).valid, true);

  // Envio
  const result = await adapter.sendApprovedRevision({
    destination: {
      id: "wh-1",
      targetRef: "https://webhook.site/abc",
      secretRef: "wh-sec",
    },
    text: "Oferta webhook",
    link: "https://bizuminer.com/p/abc1",
    idempotencyKey: "idem-wh-001",
  });

  assert.equal(result.kind, "sent");
  assert.ok(capturedHeaders["X-BizuMiner-Signature"].startsWith("sha256="));
  assert.equal(capturedHeaders["X-Idempotency-Key"], "idem-wh-001");
  assert.ok(capturedBody.includes("Oferta webhook"));
});

test("getDistributionAdapter resolves configured channels or throws on unsupported", () => {
  const tg = getDistributionAdapter("telegram");
  assert.equal(tg.channel, "telegram");

  const wh = getDistributionAdapter("webhook");
  assert.equal(wh.channel, "webhook");

  assert.throws(() => getDistributionAdapter("smoke_signal"), /não suportado/);
});

test("BUG-006: absent or revoked resolver never inherits env secrets or performs HTTP",async()=>{
 process.env.TELEGRAM_BOT_TOKEN="synthetic-house";process.env.WEBHOOK_SIGNING_SECRET="synthetic-house";
 let calls=0;const noIo=async()=>{calls++;throw new Error("unexpected transport")};
 for(const make of [r=>new TelegramDistributionAdapter(r,noIo),r=>new WebhookDistributionAdapter(r,noIo)]) for(const resolver of [undefined,async()=>null,async()=>{throw new Error("revoked")}]) {
   const result=await make(resolver).sendApprovedRevision({destination:{id:"d",targetRef:"https://example.invalid",secretRef:"revoked"},text:"x",link:"https://example.invalid/p/code",idempotencyKey:"test"});
   assert.equal(result.kind,"rejected");assert.equal(result.retryable,false);
 }
 assert.equal(calls,0);
});
test("BUG-007: built-in module supports persisted telegram_channel and legacy alias",()=>{
 assert.equal(getDistributionAdapter("telegram_channel").channel,"telegram_channel");assert.equal(getDistributionAdapter("telegram").channel,"telegram");
});
test("Telegram success must carry provider proof; missing message id stays unknown",async()=>{
 const a=new TelegramDistributionAdapter(async()=>"synthetic",async()=>Response.json({ok:true}));
 assert.equal((await a.sendApprovedRevision({destination:{id:"d",targetRef:"@synthetic_channel"},text:"x",link:"https://example.invalid",idempotencyKey:"proof"})).kind,"unknown");
});

test('BUG-008: webhook Retry-After seconds and HTTP date reach the retry policy; invalid headers fall back',async()=>{
 const now=Date.parse('2026-10-18T12:00:00Z');
 for(const [header,seconds] of [['600',600],['0',0],['Sun, 18 Oct 2026 12:10:00 GMT',600],['Sun, 18 Oct 2026 11:59:00 GMT',0],[null,30],['invalid',30],['-1',30],['Infinity',30],['999999999999999999999',30]]) {
  const adapter=new WebhookDistributionAdapter(async()=> 'SYNTHETIC',async()=>Response.json({},{status:429,headers:header===null?{}:{'Retry-After':header}}),()=>now);
  const result=await adapter.sendApprovedRevision({destination:{id:'synthetic',targetRef:'https://fixture.invalid/hook'},text:'x',link:'https://fixture.invalid/p/code',idempotencyKey:'retry-header'});
  assert.equal(result.kind,'rejected');assert.equal(result.retryable,true);assert.equal(result.retryAfterSeconds,seconds,`header ${header}`);
 }
});
