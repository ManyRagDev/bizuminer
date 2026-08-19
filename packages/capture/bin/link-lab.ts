#!/usr/bin/env node
/**
 * link-lab — experimento de atribuição do Mercado Livre.
 *
 * Busca produtos reais pela API, gera todos os candidatos a link de afiliado
 * e imprime para você clicar e conferir no portal.
 *
 * Uso:
 *   export ML_ACCESS_TOKEN="APP_USR-..."
 *   export ML_TRACKING_ID="seu-id-de-afiliado"
 *   node --experimental-strip-types bin/link-lab.ts "fone bluetooth"
 *
 * Opções:
 *   --limit N     quantos produtos buscar (padrão 3)
 *   --json        saída em JSON, para colar em planilha
 */

import {
  buildAllCandidates,
  LINK_STRATEGIES,
} from "../src/adapters/mercadolivre/affiliate-link.ts";
import {
  injectedParams,
  traceRedirects,
} from "../src/adapters/mercadolivre/link-trace.ts";

const ML_API = "https://api.mercadolibre.com";

interface SearchResult {
  results?: Array<{
    id?: string;
    title?: string;
    price?: number;
    permalink?: string;
  }>;
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

async function runTrace(startUrl: string) {
  console.log(`\n${"=".repeat(78)}`);
  console.log(`TRACE DE REDIRECTS — LINK DE CONTROLE`);
  console.log(`${"=".repeat(78)}\n`);
  console.log(`URL inicial: ${startUrl}\n`);

  const result = await traceRedirects(startUrl);

  for (const hop of result.hops) {
    const arrow = hop.final ? "→ FIM" : "→";
    console.log(`  [${hop.hop}] ${arrow} HTTP ${hop.status}`);
    console.log(`      ${hop.url}`);
    if (hop.location) {
      console.log(`      Location: ${hop.location}`);
    }
    console.log();
  }

  const injected = injectedParams(startUrl, result.finalUrl);

  console.log(`${"=".repeat(78)}`);
  console.log(`ANÁLISE`);
  console.log(`${"=".repeat(78)}`);
  console.log(`\n  URL final: ${result.finalUrl}\n`);

  const entries = Object.entries(result.finalParams);
  if (entries.length === 0) {
    console.log("  Nenhum parâmetro de query na URL final.");
  } else {
    console.log("  Parâmetros na URL final:");
    for (const [k, v] of entries) {
      const inj = injected.includes(k) ? "  ← INJETADO PELO ML" : "";
      console.log(`    ${k} = ${v}${inj}`);
    }
  }

  const mattish = entries.filter(([k]) =>
    /^(matt_|utm_|afiliad|track|ref|src)/i.test(k),
  );
  if (mattish.length > 0) {
    console.log(
      `\n  ★ SUSPEITOS DE ATRIBUIÇÃO encontrados acima — compare os valores\n    com o seu ID de afiliado e com o resultado do clique no portal.`,
    );
  } else {
    console.log(
      `\n  Nenhum parâmetro de atribuição visível na URL final.\n  Possíveis causas: atribuição feita por cookie do hop /sec/ (server-side),\n  ou por JS na página. Nesse caso, o caminho por URL pura não atribui e a\n  estratégia vira: descobrir como pedir o /sec/ — ver docs do experimento.`,
    );
  }
  console.log();
}

async function main() {
  // Modo trace:
  // rastrear a cadeia de redirects de um link de CONTROLE
  // (gerado manualmente no portal de afiliados) para descobrir quais
  // parâmetros o Mercado Livre injeta no caminho.
  //
  //   node --experimental-strip-types bin/link-lab.ts --trace "https://mercadolivre.com/sec/XXXX"
  const traceUrl = arg("trace");
  if (traceUrl) {
    return runTrace(traceUrl);
  }

  const token = process.env.ML_ACCESS_TOKEN;
  const trackingId = process.env.ML_TRACKING_ID;

  const keyword = process.argv.slice(2).find((a) => !a.startsWith("--"));

  if (!token || !trackingId || !keyword) {
    console.error(`
link-lab — experimento de atribuição do Mercado Livre

Faltando configuração. Defina:

  export ML_ACCESS_TOKEN="APP_USR-..."     token OAuth do DevCenter
  export ML_TRACKING_ID="..."              seu identificador de afiliado

E rode com um termo de busca:

  node --experimental-strip-types bin/link-lab.ts "fone bluetooth"
`);
    process.exit(1);
  }

  const limit = Number(arg("limit", "3"));
  const asJson = process.argv.includes("--json");

  const url = `${ML_API}/sites/MLB/search?q=${encodeURIComponent(keyword)}&limit=${limit}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
  });

  if (!res.ok) {
    console.error(`Falha na busca: HTTP ${res.status}`);
    if (res.status === 401) {
      console.error("Token inválido ou expirado — o access token dura 6 horas.");
    }
    console.error(await res.text().catch(() => ""));
    process.exit(1);
  }

  const data = (await res.json()) as SearchResult;
  const products = (data.results ?? []).filter((p) => p.id && p.permalink);

  if (products.length === 0) {
    console.error("Nenhum produto retornado para esse termo.");
    process.exit(1);
  }

  const rows = products.flatMap((p) =>
    buildAllCandidates({
      productUrl: p.permalink!,
      itemId: p.id!,
      trackingId,
      toolId: process.env.ML_TOOL_ID,
      subId: "linklab001",
    }).map((c) => ({
      produto: p.title?.slice(0, 40) ?? "",
      itemId: p.id!,
      preco: p.price,
      estrategia: c.strategyId,
      url: c.url,
    })),
  );

  if (asJson) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log(`\n${"=".repeat(78)}`);
  console.log(`EXPERIMENTO DE ATRIBUIÇÃO — MERCADO LIVRE`);
  console.log(`${"=".repeat(78)}`);
  console.log(`Termo: "${keyword}"`);
  console.log(`Produtos: ${products.length}  ·  Estratégias: ${LINK_STRATEGIES.length}`);
  console.log(`Total de links a testar: ${rows.length}\n`);

  for (const p of products) {
    console.log(`${"─".repeat(78)}`);
    console.log(`${p.title}`);
    console.log(`${p.id}  ·  R$ ${p.price?.toFixed(2).replace(".", ",")}`);
    console.log(`${"─".repeat(78)}`);

    const candidates = buildAllCandidates({
      productUrl: p.permalink!,
      itemId: p.id!,
      trackingId,
      toolId: process.env.ML_TOOL_ID,
      subId: "linklab001",
    });

    for (const c of candidates) {
      console.log(`\n  [${c.strategyId}]  ${c.description}`);
      console.log(`  ${c.url}`);
    }
    console.log();
  }

  console.log(`${"=".repeat(78)}`);
  console.log(`COMO TESTAR`);
  console.log(`${"=".repeat(78)}`);
  console.log(`
 1. Abra o portal de afiliados do Mercado Livre e anote o total de cliques atual.

 2. Gere pelo portal, MANUALMENTE, um link para o primeiro produto acima.
    Esse é o seu controle — é o único que você sabe que funciona.

 3. Numa janela anônima, sem cookie anterior, clique no link de controle.
    Aguarde alguns minutos e confirme que o clique apareceu no portal.
    Se não aparecer, o problema é o método de teste, não as estratégias.

 4. Uma estratégia por vez, em janela anônima nova a cada uma:
    clique, espere, confira o portal, anote se registrou.

 5. Registre o resultado na tabela abaixo.
`);

  console.log(`  ${"ESTRATÉGIA".padEnd(20)} ${"REGISTROU?".padEnd(12)} OBSERVAÇÃO`);
  console.log(`  ${"-".repeat(20)} ${"-".repeat(12)} ${"-".repeat(30)}`);
  console.log(`  ${"(controle portal)".padEnd(20)} ${"".padEnd(12)}`);
  for (const s of LINK_STRATEGIES) {
    console.log(`  ${s.id.padEnd(20)} ${"".padEnd(12)}`);
  }

  console.log(`
 Quando encontrar a que registra, marque verified: true nela em
 src/adapters/mercadolivre/affiliate-link.ts. É a única mudança necessária.

 Se NENHUMA registrar, o caminho por URL não atribui e partimos para a
 geração manual pelo portal com apoio da ferramenta.
`);
}

main().catch((err) => {
  console.error("Erro:", err instanceof Error ? err.message : err);
  process.exit(1);
});
