import type { VitrineProduct } from "./deal-view.ts";
import { productPreview } from "./product-preview.ts";

type PreviewDependencies = {
  loadProduct(slug: string): Promise<VitrineProduct | null>;
  render(product: VitrineProduct, now: Date): Promise<Response>;
};

// Images are public. Omitting credentials lets a local pauta warm the same
// canonical production URL that will be requested by the sharing crawler.
const PUBLIC_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "X-BizuMiner-Preview, X-BizuMiner-Preview-Ttl, Age",
  "Cache-Control": "no-store",
};

export async function serveProductPreview(request: Request, slug: string, dependencies: PreviewDependencies, now = new Date()) {
  // Always use the public eligibility projection, including for stale versions
  // and hints generated from an authenticated account's editorial selection.
  const product = await dependencies.loadProduct(slug);
  if (!product) return new Response("Oferta indisponível", { status: 404, headers: PUBLIC_HEADERS });
  const preview = productPreview(product, now);
  const url = new URL(request.url);
  if (url.search !== `?v=${preview.version}`) {
    return new Response(null, { status: 302, headers: { ...PUBLIC_HEADERS, Location: preview.path } });
  }
  const response = await dependencies.render(product, now);
  for (const [key, value] of Object.entries(PUBLIC_HEADERS)) response.headers.set(key, value);
  const cacheable = response.ok && response.headers.get("X-BizuMiner-Preview") === "ready";
  const ttl = cacheable ? preview.cacheSeconds : 0;
  response.headers.set("X-BizuMiner-Preview-Ttl", String(ttl));
  if (ttl > 0) {
    response.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    response.headers.set("Vercel-CDN-Cache-Control", `public, s-maxage=${ttl}`);
  }
  return response;
}
