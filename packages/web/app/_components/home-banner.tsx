"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { VitrineProduct } from "../../lib/deal-view";

type Props = {
  product: VitrineProduct | null;
  selectionVersion: number | null;
  onProductClick: (productId: string) => void;
  preview?: boolean;
};

/** A capa só recebe um produto aprovado para esta apresentação. */
export default function HomeBanner({ product, selectionVersion, onProductClick, preview = false }: Props) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const featured = product?.imageUrl && product.imageUrl !== failedImage ? product : null;

  const Heading = preview ? "h3" : "h1";
  const headingId = preview ? "cover-preview-title" : "home-banner-title";

  return <section className={"home-banner " + (featured ? "home-banner-featured" : "home-banner-institutional")} id={preview ? undefined : "topo"} aria-labelledby={headingId}
    data-selection-version={selectionVersion ?? undefined} data-home-product={preview ? undefined : featured?.id} data-home-surface={featured && !preview ? "hero" : undefined}>
    <div className="home-banner-copy">
      <p className="home-banner-eyebrow"><span aria-hidden="true">✳</span> {featured ? "Um achado em destaque" : "BizuMiner · vale a descoberta"}</p>
      <Heading className="home-banner-title" id={headingId}>{featured ? featured.coverHeadline : <>Menos procura.<br /><em>Mais descobertas.</em></>}</Heading>
      <p className="home-banner-description">{featured ? featured.benefit : "Ideias úteis para a sua rotina. Preços e detalhes para escolher bem."}</p>
      {featured && <p className="home-banner-product-name">{featured.displayTitle}</p>}
      {preview ? <span className="home-banner-cta">Conhecer o achado <span aria-hidden="true">↗</span></span> : featured ? <Link className="home-banner-cta" href={"/bizu/" + featured.slug} prefetch={false} onClick={() => onProductClick(featured.id)}>
        Conhecer o achado <span aria-hidden="true">↗</span>
      </Link> : <a className="home-banner-cta" href="#explorar">Encontrar meu próximo bizu <span aria-hidden="true">↓</span></a>}
    </div>

    {featured ? <div className="home-banner-visual home-banner-photo">
      <span className="home-banner-visual-label" aria-hidden="true">Olha esse bizu.</span>
      <div className="home-banner-image">
        <Image key={featured.imageUrl} src={featured.imageUrl!} alt={featured.displayTitle || featured.title} fill priority
          sizes="(max-width: 540px) 35vw, (max-width: 820px) 38vw, (max-width: 1440px) 40vw, 600px"
          onError={() => setFailedImage(featured.imageUrl)} />
      </div>
      <span className="home-banner-spark" aria-hidden="true">✳</span>
    </div> : <div className="home-banner-visual home-banner-art" aria-hidden="true">
      <span className="home-banner-orbit" />
      <div className="home-banner-tag">
        <span className="home-banner-tag-hole" />
        <span className="home-banner-tag-kicker">pequenas descobertas</span>
        <b>bizu<span>!</span></b>
        <span className="home-banner-tag-line" />
        <span className="home-banner-tag-signature">bom pra sua rotina.</span>
      </div>
      <span className="home-banner-spark">✳</span>
      <span className="home-banner-art-note">tem coisa boa por aqui ↙</span>
    </div>}
  </section>;
}
