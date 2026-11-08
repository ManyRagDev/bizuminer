import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cache } from "react";
import { readPublicPautaLink } from "../../../../lib/pauta-link-db.ts";
import AffiliateLink from "../../../_components/affiliate-link.tsx";
import DetailHeader from "../../../_components/detail-header.tsx";

export const preferredRegion = "gru1";
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };
const getOffer = cache((token: string) => readPublicPautaLink(token));

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const offer = await getOffer((await params).token);
  if (!offer) return { title: "Oferta indisponível | BizuMiner", robots: { index: false } };
  const title = `${offer.title} | BizuMiner`;
  const description = "Confira esta oferta do Mercado Livre selecionada pelo BizuMiner.";
  const images = [offer.imageUrl ?? "/og-bizuminer.jpg"];
  return { title, description, robots: { index: false }, openGraph: { title, description, images } };
}

export default async function PautaOfferPage({ params }: PageProps) {
  const { token } = await params;
  const offer = await getOffer(token);
  if (!offer) notFound();

  return (
    <main className="deal-page">
      <DetailHeader />
      <article className="confirmed-offer">
        <p className="eyebrow">Achado do BizuMiner · Mercado Livre</p>
        <h1>{offer.title}</h1>
        {offer.imageUrl && <Image className="confirmed-offer-image" src={offer.imageUrl} alt="" width={420} height={420} unoptimized />}
        <p>Confira o preço atual e as condições na loja.</p>
        <AffiliateLink
          href={`/go/pauta/${token}`} className="deal-cta" id={offer.id}
          name={offer.title} store="Mercado Livre"
        >
          Ver oferta no Mercado Livre <span aria-hidden="true">↗</span>
        </AffiliateLink>
        <p className="affiliate-disclosure">Este é um link de afiliado. O BizuMiner pode receber comissão pela compra.</p>
      </article>
    </main>
  );
}
