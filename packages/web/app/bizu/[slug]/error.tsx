"use client";

import Link from "next/link";

export default function DealError({ reset }: { reset: () => void }) {
  return <main className="deal-page"><section className="history-card" role="alert">
    <h1>Não conseguimos carregar este achado agora.</h1>
    <p>Os dados da oferta estão temporariamente indisponíveis. Tente novamente para conferir o preço e o histórico.</p>
    <button type="button" onClick={reset}>Tentar novamente</button> <Link href="/#achados">Voltar aos achados</Link>
  </section></main>;
}
