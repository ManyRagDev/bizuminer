import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { confirmedOfferDetail } from "../../../../lib/confirmed-offer-db.ts";
import { offerPriceLabel } from "../../../../lib/offer-price.ts";
import { productPreview } from "../../../../lib/product-preview.ts";
import { shareBaseUrl } from "../../../../lib/site-url.ts";
import { marketplaceDef } from "../../../../lib/marketplaces.ts";
import PriceHistory from "../../../bizu/[slug]/price-history.tsx";

export const dynamic="force-dynamic";
type Props={params:Promise<{slug:string;option:string}>;searchParams:Promise<{c?:string}>};
const load=cache((slug:string,option:string)=>confirmedOfferDetail(slug,option));
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {slug,option}=await params,detail=await load(slug,option);
  if(!detail)return {title:"Oferta indisponível | BizuMiner",robots:{index:false,follow:false}};
  const product=detail.product,title=`${product.displayTitle ?? product.title} | BizuMiner`;
  const description=`${offerPriceLabel(product)} · ${product.purchaseContents ?? product.offerOptionLabel}. ${product.offerConditions ?? ""}`;
  return {title,description,openGraph:{title,description,images:[`${shareBaseUrl()}${productPreview(product).path}`]},twitter:{card:"summary_large_image",title,description,images:[`${shareBaseUrl()}${productPreview(product).path}`]}};
}
export default async function ConfirmedOfferPage({params,searchParams}:Props){
  const {slug,option}=await params,detail=await load(slug,option);
  if(!detail)notFound();
  const p=detail.product,{c}=await searchParams;
  const go=`/go/${encodeURIComponent(slug)}?opcao=${encodeURIComponent(option)}${c ? `&c=${encodeURIComponent(c)}`:""}`;
  return <main className="confirmed-offer">
    <Link href="/" prefetch={false}>← Explorar achados</Link>
    <article>
      <p className="eyebrow">Opção de compra conferida · {marketplaceDef(p.marketplace)?.label ?? p.marketplace}</p>
      <h1>{p.displayTitle ?? p.title}</h1>
      {p.imageUrl && <Image className="confirmed-offer-image" src={p.imageUrl} alt={p.displayTitle ?? p.title} width={420} height={420} priority/>}
      <p><b>Opção indicada:</b> {p.offerOptionLabel}</p><p><b>O que vem:</b> {p.purchaseContents}</p>
      <div className="deal-price"><strong>{offerPriceLabel(p)}</strong><em>Conferido em {new Date(String(p.evidenceObservedAt)).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})} (São Paulo).</em></div>
      {p.offerConditions && <p><b>Condições observadas:</b> {p.offerConditions}</p>}
      <p>Na loja, selecione <b>{p.offerOptionLabel}</b>. O anúncio pode abrir sem a opção selecionada. Confira o frete e o total para seu endereço antes de concluir.</p>
      <a className="deal-cta" href={go} target="_blank" rel="noreferrer sponsored">Conferir esta opção na loja ↗</a>
      <p className="affiliate-disclosure">Link de afiliado: o BizuMiner pode receber comissão sem custo adicional para você.</p>
    </article>
    <PriceHistory points={detail.priceHistory} context={detail.historyContext} totalCount={detail.historyContext.totalCount}/>
  </main>;
}
