import type { PublicOfferHistory } from "../../lib/public-offer-db.ts";

export default function HistoricalOffer({ offer,optionRequested=false }: { offer:PublicOfferHistory;optionRequested?:boolean }) {
  const money=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value/100);
  const price=offer.priceCents===null ? null : offer.priceType==='range' && offer.priceMaxCents!==null
    ? `${money(offer.priceCents)} a ${money(offer.priceMaxCents)}` : offer.priceType==='from'
      ? `A partir de ${money(offer.priceCents)}` : money(offer.priceCents);
  const date=offer.observedAt ? new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"long",timeStyle:"short"}).format(new Date(offer.observedAt)) : null;
  return <main className="deal-page">
    <header style={{padding:"24px 0"}}><a href="/" aria-label="BizuMiner, início">BizuMiner</a></header>
    <article className="deal-layout">
      {offer.imageUrl ? <section className="deal-visual"><div className="deal-image-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={offer.imageUrl} alt={offer.title} loading="lazy" referrerPolicy="no-referrer" style={{width:"100%",height:"100%",objectFit:"contain"}} />
      </div></section> : null}
      <section className="deal-summary"><p className="eyebrow">Registro anterior · {offer.marketplace}</p><h1>{offer.title}</h1>
        <p className="price-stale-warning">{optionRequested ? "A opção deste link precisa de uma nova conferência." : "Preço e disponibilidade atuais ainda não foram confirmados."}</p>
        {!optionRequested && price && date ? <p>Último preço observado: <strong>{price}</strong> em {date}.</p> : <p>Não há preço comparável confirmado para apresentar neste registro.</p>}
        <p>O histórico permanece disponível. A oferta volta a ser indicada quando houver uma nova conferência válida.</p>
      </section>
    </article>
  </main>;
}
