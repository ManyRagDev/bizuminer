"use client";

import Link from "next/link";

export default function SiteError({reset}:{reset:()=>void}) {
  return <main className="deal-page"><section className="history-card" role="alert">
    <h1>Não conseguimos carregar os achados agora.</h1>
    <p>Os dados estão temporariamente indisponíveis. Tente novamente para conferir as ofertas atuais.</p>
    <button type="button" onClick={reset}>Tentar novamente</button>{" "}
    <Link href="/">Voltar ao início</Link>
  </section></main>;
}
