import { Metadata } from "next";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getPageSession, isAffiliate } from "../../../lib/auth";
import { dealDetail, topDeals } from "../../../lib/db";
import { freshnessLabel, priceFreshness, priceSignal, seenAgo } from "../../../lib/deal-signal";
import { toVitrineProduct } from "../../../lib/deal-view";
import { marketplaceDef } from "../../../lib/marketplaces";
import { productShareDescription } from "../../../lib/product-share";
import { validUserId } from "../../../lib/member-contract";
import { savedProductIds, isWatching } from "../../../lib/member-db";
import AdminBadge from "../../_components/admin-badge";
import CopyProductLink from "../../_components/copy-product-link";
import DetailHeader from "../../_components/detail-header";
import DetailActions from "../../_components/detail-actions";
import CatalogBackLink from "../../_components/catalog-back-link";
import PriceHistory from "./price-history";
import { offerPriceLabel, offerPriceNote, formatOfferMoney } from "../../../lib/offer-price";
import RedirectBanner from "./redirect-banner";
import { campaignExitPath } from "../../../lib/campaign-exit";
import { productPreview, PRODUCT_PREVIEW_SIZE } from "../../../lib/product-preview";
import { shareBaseUrl } from "../../../lib/site-url";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }>; searchParams: Promise<{ direto?: string; c?: string }> };

// Metadata and the page body request the same product during one render. React
// keeps this result per request, avoiding a second public database transaction.
const getDealDetail = cache((slug: string) => dealDetail(slug));

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getDealDetail(slug);
  if (!detail) return { title: "Achado não encontrado | BizuMiner" };
  const title = `${detail.deal.displayTitle ?? detail.deal.title} | BizuMiner`;
  const description = productShareDescription(detail.deal);
  const preview = productPreview(toVitrineProduct(detail.deal));
  const image = { url: preview.path, ...PRODUCT_PREVIEW_SIZE, type: "image/png", alt: detail.deal.displayTitle ?? detail.deal.title };
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
  const relatedPromise = deal.category ? topDeals({ category: deal.category, limit: 6, sort: "signal" }) : Promise.resolve(null);
  const mp = marketplaceDef(deal.marketplace);
  const mpLabel = mp?.label ?? deal.marketplace;
  const mpCta = mp?.ctaLabel ?? `ver na ${mpLabel}`;
  const mpEvidence = mp?.evidenceLabel ?? `dados de ${mpLabel}`;
  const fresh = priceFreshness(deal.evidence_observed_at);
  const signal = fresh === "current" ? priceSignal({ priceCents: deal.price_cents, previousMinPriceCents: deal.previous_min_price_cents, observationCount: deal.observation_count, historyDays: deal.history_days, lowestVerified: deal.lowest_verified }) : { tone: "monitoring" as const, label: `última vez visto ${seenAgo(deal.evidence_observed_at)}` };
  const product = toVitrineProduct(deal);
  const uid = (await cookies()).get("bm_uid")?.value;
  const sessionPromise = getPageSession(validUserId(uid) ? uid : null);
  const [relatedPage, session] = await Promise.all([relatedPromise, sessionPromise]);
  const [isUserAdmin, savedIds, watching] = session
    ? await Promise.all([isAffiliate(session.authUser), savedProductIds(session.appUserId), isWatching(session.appUserId, deal.id)])
    : [false, [], false];
  const savedInAccount = savedIds.includes(deal.id);
  const related = relatedPage?.deals.filter((item) => item.id !== deal.id).slice(0, 4).map(toVitrineProduct) ?? [];

  return <main className="deal-page">
    {direto === "1" && <RedirectBanner slug={deal.slug} campaignCode={c} />}
    <DetailHeader
      actions={
        <>
          {isUserAdmin && <AdminBadge />}
          <CatalogBackLink />
        </>
      }
    />
    <article className="deal-layout">
      <section className="deal-visual"><div className="deal-image-wrap">{deal.image_url ? <Image src={deal.image_url} alt={product.title} fill priority sizes="(max-width: 820px) 100vw, 52vw" /> : <div className="image-placeholder"><Image src="/brand/bizuminer-icon-light.svg" alt="BizuMiner" width={48} height={48} /></div>}</div>{deal.category && <span className="deal-category">{deal.category}</span>}</section>
      <section className="deal-summary">
        <p className="eyebrow">Preço monitorado · {mpLabel}</p>
        <span className={`deal-signal ${signal.tone}`}>{signal.label}</span>
        <h1>{product.title}</h1>
        {(product.benefit || product.audience || product.purchaseContents || product.caveat) && <div className="deal-editorial-presentation">
          {product.benefit && <p><b>Por que vale conhecer:</b> {product.benefit}</p>}
          {product.audience && <p><b>Para quem faz sentido:</b> {product.audience}</p>}
          {product.purchaseContents && <p><b>O que vem:</b> {product.purchaseContents}</p>}
          {product.caveat && <p><b>Antes de comprar:</b> {product.caveat}</p>}
        </div>}
        {product.titleOrigin === "editorial" && <details><summary>Nome do produto na loja</summary><p>{product.sourceTitle}</p></details>}
        {(deal.rating_star !== null || deal.sales_label) && <p className="deal-evidence">{deal.rating_star !== null && <span>★ {deal.rating_star.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/5</span>}{deal.rating_star !== null && deal.sales_label && <i>·</i>}{deal.sales_label && <span>{deal.sales_label}</span>}<small>{mpEvidence}</small></p>}
        {fresh === "current" ? <div className="deal-price"><small>{deal.originalPriceKind === "source_claimed" && product.priceType === "exact" && product.currency && deal.original_price_cents && deal.original_price_cents > deal.price_cents ? formatOfferMoney(deal.original_price_cents, product.currency) : ""}</small><strong>{offerPriceLabel(product)}</strong>{freshnessLabel(deal.evidence_observed_at) && <em>{freshnessLabel(deal.evidence_observed_at)}</em>}</div> : <div className="deal-price deal-price-stale"><strong>preço atual não confirmado</strong><em>última captura: {offerPriceLabel(product)} · {seenAgo(deal.evidence_observed_at)}</em></div>}
        {offerPriceNote(product) && <p className="deal-evidence">{offerPriceNote(product)}</p>}
        {fresh !== "current" && (
          <div className="price-stale-warning" role="alert">
            ⚠️ <strong>Atenção:</strong> Esta oferta foi verificada {seenAgo(deal.evidence_observed_at)}. O preço e estoque podem ter variado no marketplace.
          </div>
        )}
        <a className="deal-cta" href={campaignExitPath(deal.slug, c)} target="_blank" rel="noreferrer sponsored">{mpCta} <span>↗</span></a>
        <CopyProductLink slug={deal.slug} title={product.title} previewUrl={`${shareBaseUrl().replace(/\/$/, "")}${productPreview(product).path}`} />
        <DetailActions product={product} initialSaved={savedInAccount} initialWatching={watching} isLoggedIn={!!session} cacheScope={session?.appUserId ?? null} />
        <p className="affiliate-disclosure">Link de afiliado: o BizuMiner pode receber comissão sem custo adicional para você.</p>
      </section>
    </article>
    <PriceHistory points={history} context={detail.history_context} totalCount={deal.observation_count} />
    {related.length > 0 && <section className="related-section" aria-labelledby="related-title"><div className="related-heading"><p className="eyebrow">Continue descobrindo</p><h2 id="related-title">Mais em {deal.category}</h2></div><div className="related-rail">{related.map((item) => <article key={item.id} className="related-card"><Link className="related-image" href={`/bizu/${item.slug}`} prefetch={false}>{item.imageUrl ? <Image src={item.imageUrl} alt={item.title} fill sizes="(max-width: 820px) 68vw, 22vw" /> : <div className="image-placeholder"><Image src="/brand/bizuminer-icon-light.svg" alt="BizuMiner" width={32} height={32} /></div>}</Link><p>{item.category}</p><h3><Link href={`/bizu/${item.slug}`} prefetch={false}>{item.title}</Link></h3><strong>{offerPriceLabel(item)}</strong><Link className="related-link" href={`/bizu/${item.slug}`} prefetch={false}>ver detalhes <span>→</span></Link></article>)}</div></section>}
    <div className="deal-sticky-cta"><a href={campaignExitPath(deal.slug, c)} target="_blank" rel="noreferrer sponsored">{mpCta} <span>↗</span></a></div>
  </main>;
}
