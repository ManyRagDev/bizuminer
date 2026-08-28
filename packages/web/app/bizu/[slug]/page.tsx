import { Metadata } from "next";
import { cookies } from "next/headers";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getPageSession } from "../../../lib/auth";
import { dealDetail, topDeals } from "../../../lib/db";
import { freshnessLabel, priceFreshness, priceNarrative, priceSignal, seenAgo } from "../../../lib/deal-signal";
import { toVitrineProduct } from "../../../lib/deal-view";
import { marketplaceDef } from "../../../lib/marketplaces";
import { validUserId } from "../../../lib/member-contract";
import { savedProductIds } from "../../../lib/member-db";
import SaveDealButton from "./save-deal-button";
import RedirectBanner from "./redirect-banner";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }>; searchParams: Promise<{ direto?: string }> };

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
  const detail = await dealDetail(slug);
  if (!detail) return { title: "Achado não encontrado | BizuMiner" };
  const title = `${detail.deal.title} | BizuMiner`;
  // Antes era uma frase fixa, igual em toda oferta compartilhada — o preview
  // no WhatsApp não dizia preço nem loja. Agora carrega os dois fatos que
  // mudam a decisão de quem recebe o link. O desconto declarado fica de fora
  // de propósito: é alegação do vendedor, não medição nossa.
  const store = marketplaceDef(detail.deal.marketplace)?.label ?? detail.deal.marketplace;
  const price = (detail.deal.price_cents / 100).toLocaleString("pt-BR", {
    style: "currency", currency: "BRL",
    maximumFractionDigits: detail.deal.price_cents % 100 === 0 ? 0 : 2,
  }).replace(/ /g, " ");
  const description = `${price} na ${store} · preço monitorado pelo BizuMiner.`;
  return {
    title,
    description,
    // Sem isto, o preview no WhatsApp/Telegram mostrava o título genérico do
    // site (herdado do layout raiz) ao lado da foto do produto — o card fica
    // com a foto certa mas o texto errado. og:image continua vindo sozinho
    // da convenção opengraph-image.tsx; aqui só título/descrição/url.
    openGraph: { title, description, url: `/bizu/${slug}` },
    twitter: { title, description },
  };
}

export default async function DealPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { direto } = await searchParams;
  const detail = await dealDetail(slug);
  if (!detail) notFound();

  const { deal, price_history: history } = detail;
  const fresh = priceFreshness(deal.evidence_observed_at);
  const signal = fresh === "current" ? priceSignal({ priceCents: deal.price_cents, previousMinPriceCents: deal.previous_min_price_cents, observationCount: deal.observation_count, historyDays: deal.history_days, lowestVerified: deal.lowest_verified }) : { tone: "monitoring" as const, label: `última vez visto ${seenAgo(deal.evidence_observed_at)}` };
  const low = history.length ? Math.min(...history.map((point) => point.price_cents)) : null;
  const high = history.length ? Math.max(...history.map((point) => point.price_cents)) : null;
  const product = toVitrineProduct(deal);
  const uid = (await cookies()).get("bm_uid")?.value;
  const session = await getPageSession(validUserId(uid) ? uid : null);
  const savedInAccount = session ? (await savedProductIds(session.appUserId)).includes(deal.id) : false;
  const relatedPage = deal.category ? await topDeals({ category: deal.category, limit: 6, sort: "signal" }) : null;
  const related = relatedPage?.deals.filter((item) => item.id !== deal.id).slice(0, 4).map(toVitrineProduct) ?? [];

  return <main className="deal-page">
    {direto === "1" && <RedirectBanner slug={deal.slug} />}
    <header className="detail-header"><a className="brand" href="/" aria-label="BizuMiner, início"><Image src="/brand/bizuminer-icon-light.svg" alt="" aria-hidden="true" width={32} height={32} priority className="brand-mark-img" /><span className="brand-name"><b>Bizu</b><i>Miner</i></span></a><div className="detail-header-actions"><a href="/#achados">← voltar aos achados</a><SaveDealButton product={product} initialSaved={savedInAccount} /></div></header>
    <article className="deal-layout">
      <section className="deal-visual"><div className="deal-image-wrap">{deal.image_url ? <Image src={deal.image_url} alt={deal.title} fill priority sizes="(max-width: 820px) 100vw, 52vw" /> : <div className="image-placeholder"><Image src="/brand/bizuminer-icon-light.svg" alt="BizuMiner" width={48} height={48} /></div>}</div>{deal.category && <span className="deal-category">{deal.category}</span>}</section>
      <section className="deal-summary">
        <p className="eyebrow">Preço monitorado · Mercado Livre</p>
        <span className={`deal-signal ${signal.tone}`}>{signal.label}</span>
        <h1>{deal.title}</h1>
        {(deal.rating_star !== null || deal.sales_label) && <p className="deal-evidence">{deal.rating_star !== null && <span>★ {deal.rating_star.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/5</span>}{deal.rating_star !== null && deal.sales_label && <i>·</i>}{deal.sales_label && <span>{deal.sales_label}</span>}<small>evidências do Mercado Livre</small></p>}
        <p className="deal-narrative"><b>Histórico do preço:</b> {priceNarrative({ priceCents: deal.price_cents, previousMinPriceCents: deal.previous_min_price_cents, observationCount: deal.observation_count, historyDays: deal.history_days, lowestVerified: deal.lowest_verified }, brl)}</p>
        {fresh === "current" ? <div className="deal-price"><small>{deal.original_price_cents && deal.original_price_cents > deal.price_cents ? brl(deal.original_price_cents) : ""}</small><strong>{brl(deal.price_cents)}</strong>{freshnessLabel(deal.evidence_observed_at) && <em>{freshnessLabel(deal.evidence_observed_at)}</em>}</div> : <div className="deal-price deal-price-stale"><strong>preço atual não confirmado</strong><em>última captura: {brl(deal.price_cents)} · {seenAgo(deal.evidence_observed_at)}</em></div>}
        <a className="deal-cta" href={`/go/${deal.slug}`} target="_blank" rel="noreferrer sponsored">ver oferta no Mercado Livre <span>↗</span></a>
        <p className="affiliate-disclosure">Link de afiliado: o BizuMiner pode receber comissão sem custo adicional para você.</p>
      </section>
    </article>
    <section className="history-section" aria-labelledby="history-title"><div><p className="eyebrow">Histórico disponível</p><h2 id="history-title">Preço com contexto, não só com etiqueta.</h2><p>Há {deal.observation_count} registro{deal.observation_count === 1 ? "" : "s"} em {deal.history_days} dia{deal.history_days === 1 ? "" : "s"} de acompanhamento. O destaque de menor preço só aparece após pelo menos 3 registros distribuídos em 7 dias.</p></div><div className="history-card"><Chart points={history} /><dl><div><dt>menor registro disponível</dt><dd>{low === null ? "—" : brl(low)}</dd></div><div><dt>maior registro disponível</dt><dd>{high === null ? "—" : brl(high)}</dd></div><div><dt>última atualização</dt><dd>{freshnessLabel(deal.evidence_observed_at) ?? "sem data"}</dd></div></dl></div></section>
    {related.length > 0 && <section className="related-section" aria-labelledby="related-title"><div className="related-heading"><p className="eyebrow">Continue descobrindo</p><h2 id="related-title">Mais em {deal.category}</h2></div><div className="related-rail">{related.map((item) => <article key={item.id} className="related-card"><a className="related-image" href={`/bizu/${item.slug}`}>{item.imageUrl ? <Image src={item.imageUrl} alt={item.title} fill sizes="(max-width: 820px) 68vw, 22vw" /> : <div className="image-placeholder"><Image src="/brand/bizuminer-icon-light.svg" alt="BizuMiner" width={32} height={32} /></div>}</a><p>{item.category}</p><h3><a href={`/bizu/${item.slug}`}>{item.title}</a></h3><strong>{brl(item.priceCents)}</strong><a className="related-link" href={`/bizu/${item.slug}`}>ver detalhes <span>→</span></a></article>)}</div></section>}
    <div className="deal-sticky-cta"><a href={`/go/${deal.slug}`} target="_blank" rel="noreferrer sponsored">ver no Mercado Livre <span>↗</span></a></div>
  </main>;
}
