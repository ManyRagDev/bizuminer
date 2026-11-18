import { ARCHIVE_NOTICE, type ArchivedSharedLink } from "../../lib/shared-link-archive.ts";

export default function ArchivedSharedLinkPage({ link }: { link: ArchivedSharedLink }) {
  return <main className="deal-page">
    <header style={{ padding: "24px 0" }}><a href="/" aria-label="BizuMiner, início">BizuMiner</a></header>
    <article className="deal-layout">
      {link.imageUrl && <section className="deal-visual"><div className="deal-image-wrap">
        {/* The optional historical image is displayed directly; the server does not fetch marketplace assets. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={link.imageUrl} alt={link.title} loading="lazy" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div></section>}
      <section className="deal-summary">
        <p className="eyebrow">Compartilhado anteriormente · Shopee</p>
        <h1>{link.title}</h1>
        <p className="price-stale-warning">{ARCHIVE_NOTICE}</p>
        <p>Este link preserva um compartilhamento anterior. A oferta não está disponível enquanto suas condições atuais não forem novamente confirmadas.</p>
      </section>
    </article>
  </main>;
}

/** Text-only preview: never loads the historical product image or prices. */
export function ArchivedSharedLinkPreview({ title }: { title: string }) {
  return <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, backgroundColor: "#f3f0e8", color: "#151515", fontFamily: "Manrope" }}>
    <div style={{ display: "flex", fontSize: 28, color: "#5f5c55" }}>BizuMiner · Compartilhado anteriormente</div>
    <div style={{ display: "flex", fontSize: title.length > 100 ? 42 : 54, fontWeight: 800 }}>{title.length > 220 ? `${title.slice(0, 217)}…` : title}</div>
    <div style={{ display: "flex", fontSize: 32, color: "#5f5c55" }}>{ARCHIVE_NOTICE}</div>
  </div>;
}
