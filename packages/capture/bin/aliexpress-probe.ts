#!/usr/bin/env node
/**
 * aliexpress-probe — espiga de verificação da AliExpress Open Platform (M5).
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * `docs/tecnico/plano-multiplataforma.md` (M5) registra uma incógnita: os
 * tutoriais em `tutoriais/` são conceituais — listam endpoints e capacidades,
 * mas **não trazem o algoritmo de assinatura nem o fluxo de `access_token`**.
 * A AliExpress usa o esquema TOP (Taobao Open Platform), que tem variantes
 * incompatíveis entre si: muda o gateway, muda o formato do timestamp, muda
 * como a string base é montada, muda o algoritmo do hash.
 *
 * Escrever o adapter assumindo uma variante é a forma clássica de queimar
 * dias: o código compila, o teste unitário com mock passa, e só a chamada
 * real revela `Invalid signature`. (Precedente nesta mesma sessão: a Shopee
 * rejeitou `subId` com hífen — nada disso aparecia sem credencial real.)
 *
 * Então este script NÃO assume nada. Ele enumera as variantes plausíveis,
 * dispara uma chamada real de cada, e imprime a resposta crua de cada uma.
 * Quem decide qual está certa é a API, não o autor do código.
 *
 * O QUE FAZER COM O RESULTADO
 *
 * A variante que devolver um produto é a especificação a implementar em
 * `packages/capture/src/adapters/aliexpress/`. Enquanto nenhuma devolver,
 * não existe adapter para escrever — existe credencial/escopo a resolver
 * no console da AliExpress.
 *
 * Uso:
 *   node --env-file=../web/.env.local --experimental-strip-types bin/aliexpress-probe.ts
 *   node --env-file=../web/.env.local --experimental-strip-types bin/aliexpress-probe.ts --keyword "fone bluetooth"
 *
 * Variáveis (em packages/web/.env.local):
 *   ALIEXPRESS_APP_KEY       obrigatória
 *   ALIEXPRESS_APP_SECRET    obrigatória
 *   ALIEXPRESS_TRACKING_ID   opcional — algumas contas exigem no product.query
 *   ALIEXPRESS_ACCESS_TOKEN  opcional — se o escopo da conta exigir OAuth
 *
 * Segurança: o segredo NUNCA é impresso. A assinatura derivada aparece
 * truncada só para permitir comparar execuções.
 */

import {
  baseString,
  datetimeGmt8,
  signHmacSha256,
  signMd5Wrapped,
} from "../src/adapters/aliexpress/signing.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const APP_KEY = process.env.ALIEXPRESS_APP_KEY;
const APP_SECRET = process.env.ALIEXPRESS_APP_SECRET;
const TRACKING_ID = process.env.ALIEXPRESS_TRACKING_ID;
const ACCESS_TOKEN = process.env.ALIEXPRESS_ACCESS_TOKEN;

if (!APP_KEY || !APP_SECRET) {
  console.error(
    "[bloqueado] ALIEXPRESS_APP_KEY e/ou ALIEXPRESS_APP_SECRET ausentes.\n" +
      "Nenhuma requisição foi feita.\n\n" +
      "Configure em packages/web/.env.local:\n" +
      "  ALIEXPRESS_APP_KEY=...\n" +
      "  ALIEXPRESS_APP_SECRET=...\n" +
      "  ALIEXPRESS_TRACKING_ID=...      (opcional, mas provável)\n" +
      "  ALIEXPRESS_ACCESS_TOKEN=...     (opcional, se o escopo exigir OAuth)",
  );
  process.exit(1);
}

const KEYWORD = flag("keyword") ?? "fone bluetooth";
const METHOD = "aliexpress.affiliate.product.query";

interface Dialect {
  readonly name: string;
  readonly hypothesis: string;
  readonly gateway: string;
  readonly build: () => Record<string, string>;
}

/** Parâmetros de negócio — iguais em todas as variantes. page_size=1: só
 *  precisamos provar que UM produto volta, não gastar cota. */
function businessParams(): Record<string, string> {
  const p: Record<string, string> = {
    keywords: KEYWORD,
    page_no: "1",
    page_size: "1",
    target_currency: "BRL",
    target_language: "PT",
    ship_to_country: "BR",
  };
  if (TRACKING_ID) p.tracking_id = TRACKING_ID;
  return p;
}

function commonParams(timestamp: string, signMethod: string): Record<string, string> {
  const p: Record<string, string> = {
    app_key: APP_KEY!,
    method: METHOD,
    format: "json",
    v: "2.0",
    sign_method: signMethod,
    timestamp,
    ...businessParams(),
  };
  if (ACCESS_TOKEN) p.access_token = ACCESS_TOKEN;
  return p;
}

const SYNC_GATEWAY = "https://api-sg.aliexpress.com/sync";
const REST_GATEWAY = "https://api-sg.aliexpress.com/rest";

/**
 * As hipóteses. Cada uma é uma combinação COERENTE (gateway + timestamp +
 * algoritmo + montagem da base) — não um produto cartesiano cego, porque
 * essas dimensões andam juntas nas variantes reais do TOP.
 */
const DIALECTS: Dialect[] = [
  {
    name: "sync-md5-datetime",
    hypothesis: "TOP clássico: /sync, MD5 com segredo envolvendo a base, timestamp 'yyyy-MM-dd HH:mm:ss' em GMT+8",
    gateway: SYNC_GATEWAY,
    build: () => {
      const params = commonParams(datetimeGmt8(), "md5");
      return { ...params, sign: signMd5Wrapped(baseString(params), APP_SECRET!) };
    },
  },
  {
    name: "sync-hmac-datetime",
    hypothesis: "/sync com HMAC-SHA256, timestamp em datetime GMT+8",
    gateway: SYNC_GATEWAY,
    build: () => {
      const params = commonParams(datetimeGmt8(), "hmac-sha256");
      return { ...params, sign: signHmacSha256(baseString(params), APP_SECRET!) };
    },
  },
  {
    name: "sync-hmac-epoch",
    hypothesis: "/sync com HMAC-SHA256, timestamp em epoch milissegundos",
    gateway: SYNC_GATEWAY,
    build: () => {
      const params = commonParams(String(Date.now()), "hmac-sha256");
      return { ...params, sign: signHmacSha256(baseString(params), APP_SECRET!) };
    },
  },
  {
    name: "sync-md5-epoch",
    hypothesis: "/sync com MD5 envolvido, timestamp em epoch milissegundos",
    gateway: SYNC_GATEWAY,
    build: () => {
      const params = commonParams(String(Date.now()), "md5");
      return { ...params, sign: signMd5Wrapped(baseString(params), APP_SECRET!) };
    },
  },
  {
    name: "rest-hmac-epoch-path",
    hypothesis: "Gateway /rest: base da assinatura prefixada pelo caminho da API (estilo mais novo)",
    gateway: `${REST_GATEWAY}/aliexpress/affiliate/product/query`,
    build: () => {
      const params = commonParams(String(Date.now()), "hmac-sha256");
      // Nesta variante o `method` sai dos parâmetros (vira caminho na URL).
      delete params.method;
      const path = "/aliexpress/affiliate/product/query";
      return { ...params, sign: signHmacSha256(baseString(params, path), APP_SECRET!) };
    },
  },
];

/**
 * Interpreta a resposta. A AliExpress devolve HTTP 200 mesmo em erro de
 * assinatura, então o status HTTP não basta — igual à Shopee com GraphQL.
 */
function interpret(body: string): { ok: boolean; verdict: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, verdict: "resposta não é JSON" };
  }

  const asRecord = parsed as Record<string, unknown>;

  // Formato de erro do TOP.
  const errorResponse = asRecord.error_response as Record<string, unknown> | undefined;
  if (errorResponse) {
    const code = errorResponse.code ?? errorResponse.sub_code ?? "?";
    const msg = errorResponse.sub_msg ?? errorResponse.msg ?? "sem mensagem";
    return { ok: false, verdict: `erro TOP [${String(code)}]: ${String(msg)}` };
  }

  // Procura qualquer indício de produto no payload, sem assumir o caminho
  // exato — o formato de sucesso é justamente o que queremos descobrir.
  const flat = JSON.stringify(parsed);
  const hasProducts = /product_id|productId|product_title|products/i.test(flat);
  if (hasProducts) return { ok: true, verdict: "resposta contém campos de produto" };

  return { ok: false, verdict: "sem erro explícito, mas nenhum produto reconhecido" };
}

async function probe(dialect: Dialect): Promise<boolean> {
  console.log(`\n${"─".repeat(72)}`);
  console.log(`▶ ${dialect.name}`);
  console.log(`  hipótese: ${dialect.hypothesis}`);

  let params: Record<string, string>;
  try {
    params = dialect.build();
  } catch (err) {
    console.log(`  ✗ falhou ao montar: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }

  // A assinatura aparece truncada: suficiente para comparar execuções,
  // insuficiente para qualquer uso indevido. O segredo nunca é impresso.
  console.log(`  sign (8 primeiros): ${String(params.sign).slice(0, 8)}…`);
  console.log(`  gateway: ${dialect.gateway}`);

  const body = new URLSearchParams(params).toString();

  let response: Response;
  const startedAt = Date.now();
  try {
    response = await fetch(dialect.gateway, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    console.log(`  ✗ falha de rede: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }

  const text = await response.text();
  const { ok, verdict } = interpret(text);

  console.log(`  HTTP ${response.status} em ${Date.now() - startedAt}ms`);
  console.log(`  veredito: ${ok ? "✓ SUCESSO" : "✗"} ${verdict}`);
  console.log(`  resposta crua (800 chars):`);
  console.log(`  ${text.slice(0, 800).replace(/\n/g, "\n  ")}`);

  return ok;
}

console.log("AliExpress — espiga de verificação (M5)");
console.log(`app_key: ${APP_KEY.slice(0, 6)}…  tracking_id: ${TRACKING_ID ?? "(ausente)"}  access_token: ${ACCESS_TOKEN ? "presente" : "(ausente)"}`);
console.log(`método: ${METHOD}  ·  keyword: "${KEYWORD}"  ·  page_size: 1`);

const vencedoras: string[] = [];
for (const dialect of DIALECTS) {
  const ok = await probe(dialect);
  if (ok) vencedoras.push(dialect.name);
  // Respiro entre chamadas: cota da AliExpress é escassa e não há motivo
  // para disparar cinco requisições no mesmo instante.
  await new Promise((r) => setTimeout(r, 1200));
}

console.log(`\n${"═".repeat(72)}`);
if (vencedoras.length > 0) {
  console.log(`✓ Variante(s) aceita(s) pela API: ${vencedoras.join(", ")}`);
  console.log("  → esta é a especificação a implementar no adapter (M5).");
  process.exit(0);
}

console.log("✗ Nenhuma variante foi aceita.");
console.log("  Isso NÃO significa que o código está errado — significa que ainda");
console.log("  não sabemos a especificação. Próximos passos, nesta ordem:");
console.log("   1. Conferir no console da AliExpress Open Platform se o app tem");
console.log("      a API de afiliados (AE-Affiliate) aprovada — escopo não liberado");
console.log("      costuma devolver erro de permissão, não de assinatura.");
console.log("   2. Ler a mensagem de erro acima: 'Invalid signature' é problema de");
console.log("      algoritmo; 'permission denied'/'ISV' é problema de escopo/conta.");
console.log("   3. Se o erro pedir token, gerar o access_token via OAuth e reexecutar");
console.log("      com ALIEXPRESS_ACCESS_TOKEN definido.");
process.exit(1);
