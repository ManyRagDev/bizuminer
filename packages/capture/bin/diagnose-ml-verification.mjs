/** Diagnóstico HTTP legado de ML: recusado antes de fetch, curl ou escrita (OS-032). */
console.log(JSON.stringify({
  ok: false,
  error: "manual_capture_only",
  message: "Use a extensão BizuMiner ou importe o bloco manual no painel.",
}));
process.exit(1);

// Diagnóstico histórico preservado, inalcançável enquanto a recusa acima vigorar.
const { execFile } = await import("node:child_process");
const { promisify } = await import("node:util");
const { writeFile } = await import("node:fs/promises");

const runFile = promisify(execFile);
const url = "https://www.mercadolivre.com.br/ofertas";
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const headers = { "user-agent": userAgent, accept: "text/html,*/*" };
const publicHeaders = ["date", "server", "content-type", "cache-control", "age", "vary", "x-cache", "via", "x-webcache-source", "oaiwebcache_hit"];
const report = {
  startedAt: new Date().toISOString(),
  target: url,
  environment: { node: process.versions.node, undici: process.versions.undici,
    proxyEnvironmentPresent: ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NODE_USE_ENV_PROXY", "GLOBAL_AGENT_HTTP_PROXY"].filter((key) => !!process.env[key]) },
  controls: { credentials: false, browserCookies: false, database: false, ingestion: false, ai: false,
    redirectsFollowed: false, intervalMs: 5000 },
  cases: [],
};
let anonymousCookies = [];
function sanitize(responseHeaders) {
  const location = responseHeaders.get("location");
  const target = location ? new URL(location, url) : undefined;
  const cookies = responseHeaders.getSetCookie?.() ?? [];
  return {
    location: target ? { origin: target.origin, path: target.pathname, queryKeys: [...target.searchParams.keys()] } : undefined,
    responseHeaders: Object.fromEntries(publicHeaders.filter((key) => responseHeaders.has(key)).map((key) => [key, responseHeaders.get(key)])),
    cookieNames: cookies.map((value) => value.split("=", 1)[0]),
  };
}
async function nodeCase(name, changes = {}) {
  const response = await fetch(url, {
    method: "GET", redirect: "manual", signal: AbortSignal.timeout(15_000),
    headers: { ...headers, ...changes },
  });
  const body = await response.text();
  if (name === "node_original") anonymousCookies = (response.headers.getSetCookie?.() ?? []).map((value) => value.split(";", 1)[0]);
  return { name, checkedAt: new Date().toISOString(), status: response.status,
    bytes: Buffer.byteLength(body), cards: (body.match(/poly-card--grid-card/g) ?? []).length,
    ...sanitize(response.headers) };
}
async function curlCase(name, protocol) {
  const { stdout } = await runFile("curl", [
    protocol, "--silent", "--show-error", "--max-time", "15",
    "--user-agent", userAgent, "--header", "Accept: text/html,*/*",
    "--dump-header", "-", "--output", "/dev/null",
    "--write-out", "\nDIAGNOSTIC_HTTP_VERSION=%{http_version}\n", url,
  ], { timeout: 18_000, maxBuffer: 128_000 });
  const blocks = stdout.split(/\r?\n\r?\n/).filter((part) => /^HTTP\//.test(part));
  const block = blocks.at(-1);
  if (!block) throw new Error("missing_headers");
  const lines = block.split(/\r?\n/);
  const responseHeaders = new Headers();
  for (const line of lines.slice(1)) {
    const index = line.indexOf(":");
    if (index > 0) responseHeaders.append(line.slice(0, index), line.slice(index + 1).trim());
  }
  return { name, checkedAt: new Date().toISOString(), status: Number(lines[0].match(/^HTTP\/\S+\s+(\d+)/)?.[1]),
    negotiatedProtocol: stdout.match(/DIAGNOSTIC_HTTP_VERSION=([^\s]+)/)?.[1], ...sanitize(responseHeaders) };
}
const cases = [
  ["node_original", () => nodeCase("node_original")],
  ["node_accept_language", () => nodeCase("node_accept_language", { "accept-language": "pt-BR,pt;q=0.9" })],
  ["node_honest_user_agent", () => nodeCase("node_honest_user_agent", { "user-agent": "BizuMiner-capture/0.1" })],
  ["node_standard_navigation_headers", () => nodeCase("node_standard_navigation_headers", {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "pt-BR,pt;q=0.9", "upgrade-insecure-requests": "1",
    "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "sec-fetch-site": "none", "sec-fetch-user": "?1",
  })],
  ["curl_http1", () => curlCase("curl_http1", "--http1.1")],
  ["curl_http2", () => curlCase("curl_http2", "--http2")],
  ["node_fresh_anonymous_cookies", () => anonymousCookies.length
    ? nodeCase("node_fresh_anonymous_cookies", { cookie: anonymousCookies.join("; ") })
    : Promise.resolve({ name: "node_fresh_anonymous_cookies", skipped: "first_response_issued_no_cookies" })],
  ["node_original_control", () => nodeCase("node_original_control")],
];
for (const [index, [name, run]] of cases.entries()) {
  if (index > 0) await new Promise((resolve) => setTimeout(resolve, 5000));
  try { report.cases.push(await run()); }
  catch { report.cases.push({ name, checkedAt: new Date().toISOString(), error: "request_failed" }); }
  console.error(`Diagnostic ${index + 1}/${cases.length}: ${name}`);
}
anonymousCookies = [];
report.finishedAt = new Date().toISOString();
const serialized = JSON.stringify(report, null, 2) + "\n";
const outputIndex = process.argv.indexOf("--output");
if (outputIndex !== -1) {
  const path = process.argv[outputIndex + 1];
  if (!path) throw new Error("output_path_required");
  await writeFile(path, serialized, { mode: 0o600 });
}
console.log(serialized);
