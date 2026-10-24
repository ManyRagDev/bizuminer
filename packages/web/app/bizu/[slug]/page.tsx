import { Metadata } from "next";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getPageSession, isAffiliate } from "../../../lib/auth";
import { dealDetail, topDeals } from "../../../lib/db";
import { getEditorialProductPresentation } from "../../../lib/editorial-selection-db";
import { freshnessLabel, priceFreshness, priceNarrative, priceSignal, seenAgo } from "../../../lib/deal-signal";
import { toVitrineProduct } from "../../../lib/deal-view";
import { marketplaceDef } from "../../../lib/marketplaces";
import { productShareDescription } from "../../../lib/product-share";
import { validUserId } from "../../../lib/member-contract";
import { savedProductIds } from "../../../lib/member-db";
import AdminBadge from "../../_components/admin-badge";
import CopyProductLink from "../../_components/copy-product-link";
import DetailHeader from "../../_components/detail-header";
import SaveDealButton from "./save-deal-button";
import RedirectBanner from "./redirect-banner";
import { campaignExitPath } from "../../../lib/campaign-exit";
import { productPreview, PRODUCT_PREVIEW_SIZE } from "../../../lib/product-preview";
import { shareBaseUrl } from "../../../lib/site-url";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }>; searchParams: Promise<{ direto?: string; c?: string }> };

// Metadata and the page body request the same product during one render. React
// keeps this result per request, avoiding a second public database transaction.
const getDealDetail = cache((slug: string) => dealDetail(slug));

const brl = (cents: number) => (cents / 100)
  .toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });

function Chart({ points }: { points: Array<{ price_cents: number; observed_at: Date | string }> }) {
  if (points.length < 2) {
    return <div className="history-empty">Ainda não há variação suficiente para desenhar uma curva. Mostramos cada registro real conforme ele chega.</div>;
  }
  const prices = points.map((point) => point.price_cents);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const range = Math.max(high - low, 1);
  const path = points.map((point, index) => {
    const x = 5 + (index / (points.length - 1)) * 90;
    const y = 88 - ((point.price_cents - low) / range) * 72;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  return <svg className="price-chart" viewBox="0 0 100 100" role="img" aria-label={`Histórico disponível: mínimo de ${brl(low)} e máximo de ${brl(high)}`} preserveAspectRatio="none"><path className="price-chart-grid" d="M5 88H95 M5 52H95 M5 16H95" /><path className="price-chart-line" d={path} /></svg>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getDealDetail(slug);
  if (!detail) return { title: "Achado não encontrado | BizuMiner" };
  const title = `${detail.deal.title} | BizuMiner`;
  const description = productShareDescription(detail.deal);
  const preview = productPreview(toVitrineProduct(detail.deal));
  const image = { url: preview.path, ...PRODUCT_PREVIEW_SIZE, type: "image/png", alt: detail.deal.title };
  return {
    title,
    description,
    // The metadata and pauta use the same versioned image URL. The explicit
    // route preserves old URLs without Next adding a separate build hash.
    openGraph: { title, description, url: `/bizu/${slug}`, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function DealPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { direto, c } = await searchParams;
  const detail = await getDealDetail(slug);
  if (!detail) notFound();

  const { deal, price_history: history } = detail;
  const editorialPromise = getEditorialProductPresentation(deal.id);
  const relatedPromise = deal.category ? topDeals({ category: deal.category, limit: 6, sort: "signal" }) : Promise.resolve(null);
  const mp = marketplaceDef(deal.marketplace);
  const mpLabel = mp?.label ?? deal.marketplace;
  const mpCta = mp?.ctaLabel ?? `ver na ${mpLabel}`;
  const mpEvidence = mp?.evidenceLabel ?? `dados de ${mpLabel}`;
  const fresh = priceFreshness(deal.evidence_observed_at);
  const signal = fresh === "current" ? priceSignal({ priceCents: deal.price_cents, previousMinPriceCents: deal.previous_min_price_cents, observationCount: deal.observation_count, historyDays: deal.history_days, lowestVerified: deal.lowest_verified }) : { tone: "monitoring" as const, label: `última vez visto ${seenAgo(deal.evidence_observed_at)}` };
  const low = history.length ? Math.min(...history.map((point) => point.price_cents)) : null;
  const high = history.length ? Math.max(...history.map((point) => point.price_cents)) : null;
  const product = toVitrineProduct(deal);
  const uid = (await cookies()).get("bm_uid")?.value;
  const sessionPromise = getPageSession(validUserId(uid) ? uid : null);
  const [editorial, relatedPage, session] = await Promise.all([editorialPromise, relatedPromise, sessionPromise]);
  const [isUserAdmin, savedIds] = session
    ? await Promise.all([isAffiliate(session.authUser), savedProductIds(session.appUserId)])
    : [false, []];
  const savedInAccount = savedIds.includes(deal.id);
  const related = relatedPage?.deals.filter((item) => item.id !== deal.id).slice(0, 4).map(toVitrineProduct) ?? [];

  return <main className="deal-page">
    {direto === "1" && <RedirectBanner slug={deal.slug} campaignCode={c} />}
    <DetailHeader
      actions={
        <>
          {isUserAdmin && <AdminBadge />}
          <Link href="/#achados">← voltar aos achados</Link>
          <SaveDealButton product={product} initialSaved={savedInAccount} />
        </>
      }
    />
    <article className="deal-layout">
      <section className="deal-visual"><div className="deal-image-wrap">{deal.image_url ? <Image src={deal.image_url} alt={deal.title} fill priority sizes="(max-width: 820px) 100vw, 52vw" /> : <div className="image-placeholder"><Image src="/brand/bizuminer-icon-light.svg" alt="BizuMiner" width={48} height={48} /></div>}</div>{deal.category && <span className="deal-category">{deal.category}</span>}</section>
      <section className="deal-summary">
        <p className="eyebrow">Preço monitorado · {mpLabel}</p>
        <span className={`deal-signal ${signal.tone}`}>{signal.label}</span>
        <h1>{deal.title}</h1>
        {editorial && <div className="deal-editorial-presentation">
          <p><b>Por que indicamos:</b> {editorial.editorialRationale}</p>
          {editorial.editorialPurchaseContents && <p><b>O que vem:</b> {editorial.editorialPurchaseContents}</p>}
          {editorial.editorialContext && <p>{editorial.editorialContext}</p>}
        </div>}
        {(deal.rating_star !== null || deal.sales_label) && <p className="deal-evidence">{deal.rating_star !== null && <span>★ {deal.rating_star.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/5</span>}{deal.rating_star !== null && deal.sales_label && <i>·</i>}{deal.sales_label && <span>{deal.sales_label}</span>}<small>{mpEvidence}</small></p>}
        {fresh === "current" ? <div className="deal-price"><small>{deal.original_price_cents && deal.original_price_cents > deal.price_cents ? brl(deal.original_price_cents) : ""}</small><strong>{brl(deal.price_cents)}</strong>{freshnessLabel(deal.evidence_observed_at) && <em>{freshnessLabel(deal.evidence_observed_at)}</em>}</div> : <div className="deal-price deal-price-stale"><strong>preço atual não confirmado</strong><em>última captura: {brl(deal.price_cents)} · {seenAgo(deal.evidence_observed_at)}</em></div>}
        {fresh !== "current" && (
          <div className="price-stale-warning" role="alert">
            ⚠️ <strong>Atenção:</strong> Esta oferta foi verificada {seenAgo(deal.evidence_observed_at)}. O preço e estoque podem ter variado no marketplace.
          </div>
        )}
        <a className="deal-cta" href={campaignExitPath(deal.slug, c)} target="_blank" rel="noreferrer sponsored">{mpCta} <span>↗</span></a>
        <CopyProductLink slug={deal.slug} title={deal.title} previewUrl={`${shareBaseUrl().replace(/\/$/, "")}${productPreview(product).path}`} />
        <p className="affiliate-disclosure">Link de afiliado: o BizuMiner pode receber comissão sem custo adicional para você.</p>
      </section>
    </article>
    <section className="history-section" aria-labelledby="history-title"><div><p className="eyebrow">Histórico disponível</p><h2 id="history-title">Preço com contexto, não só com etiqueta.</h2><p>Há {deal.observation_count} registro{deal.observation_count === 1 ? "" : "s"} do anúncio em {deal.history_days} dia{deal.history_days === 1 ? "" : "s"} de acompanhamento. A alegação de menor preço exige a mesma configuração confirmada, moeda e condições comparáveis, além de cobertura e frescor suficientes pela política homologada. Quando não há essa comprovação, não apresentamos uma alegação de recorde.</p></div><div className="history-card"><Chart points={history} /><dl><div><dt>menor preço observado no anúncio</dt><dd>{low === null ? "—" : brl(low)}</dd></div><div><dt>maior preço observado no anúncio</dt><dd>{high === null ? "—" : brl(high)}</dd></div><div><dt>última atualização</dt><dd>{freshnessLabel(deal.evidence_observed_at) ?? "sem data"}</dd></div></dl></div></section>
    {related.length > 0 && <section className="related-section" aria-labelledby="related-title"><div className="related-heading"><p className="eyebrow">Continue descobrindo</p><h2 id="related-title">Mais em {deal.category}</h2></div><div className="related-rail">{related.map((item) => <article key={item.id} className="related-card"><Link className="related-image" href={`/bizu/${item.slug}`} prefetch={false}>{item.imageUrl ? <Image src={item.imageUrl} alt={item.title} fill sizes="(max-width: 820px) 68vw, 22vw" /> : <div className="image-placeholder"><Image src="/brand/bizuminer-icon-light.svg" alt="BizuMiner" width={32} height={32} /></div>}</Link><p>{item.category}</p><h3><Link href={`/bizu/${item.slug}`} prefetch={false}>{item.title}</Link></h3><strong>{brl(item.priceCents)}</strong><Link className="related-link" href={`/bizu/${item.slug}`} prefetch={false}>ver detalhes <span>→</span></Link></article>)}</div></section>}
    <div className="deal-sticky-cta"><a href={campaignExitPath(deal.slug, c)} target="_blank" rel="noreferrer sponsored">{mpCta} <span>↗</span></a></div>
  </main>;
}
