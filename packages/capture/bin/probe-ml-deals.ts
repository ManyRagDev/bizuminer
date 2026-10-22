/** Probe legado de ML, permanentemente recusado antes de carregar o adapter (OS-032). */
import { mlAutomatedCaptureEnabled } from "../src/automated-capture.ts";

if (!mlAutomatedCaptureEnabled()) {
  console.log(JSON.stringify({
    ok: false,
    kind: "manual_capture_only",
    message: "Use a extensão BizuMiner ou importe o bloco manual no painel.",
    requests: [],
  }));
  process.exit(1);
}

// Código legado preservado; só seria carregado após o gate, sempre falso.
const { MercadoLivreDealsAdapter } = await import("../src/adapters/mercadolivre/deals.ts");
const { CaptureError } = await import("../src/errors.ts");

const requests: Array<{ status: number; finalOrigin: string; finalPath: string; bytes: number; cards: number }> = [];
const fetchImpl: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const html = await response.clone().text();
  const finalUrl = new URL(response.url);
  requests.push({
    status: response.status,
    finalOrigin: finalUrl.origin,
    finalPath: finalUrl.pathname,
    bytes: Buffer.byteLength(html),
    cards: (html.match(/poly-card--grid-card/g) ?? []).length,
  });
  return response;
};
const adapter = new MercadoLivreDealsAdapter({ fetchImpl });
try {
  const page = await adapter.fetchOffers(
    { marketplace: "mercadolivre", secret: {} },
    {},
    { runId: "read-only-probe", log: () => {}, signal: AbortSignal.timeout(20_000) },
  );
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ok: true, offers: page.offers.length, requests }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(), ok: false,
    kind: error instanceof CaptureError ? error.kind : "probe_failed",
    requests,
  }, null, 2));
  process.exitCode = 1;
}
