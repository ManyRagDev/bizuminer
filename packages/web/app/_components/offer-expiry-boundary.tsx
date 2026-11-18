"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Observe whether an offer deadline has elapsed while the page remains open. */
export function useOfferExpired(validUntil?:string):boolean {
  const [expired,setExpired]=useState(false);
  useEffect(()=>{
    // The same component can receive a refreshed offer without a deadline
    // (for example when returning to a legacy policy). Clear the previous
    // deadline's state instead of leaving the replacement hidden forever.
    if (!validUntil) {setExpired(false);return;}
    const deadline=Date.parse(validUntil);
    let timer:ReturnType<typeof setTimeout>|undefined;
    const check=()=>{
      if (timer) clearTimeout(timer);
      if (!Number.isFinite(deadline) || Date.now()>=deadline) {setExpired(true);return;}
      setExpired(false);
      timer=setTimeout(check,Math.min(2_147_000_000,deadline-Date.now()+50));
    };
    check();
    document.addEventListener("visibilitychange",check);
    window.addEventListener("focus",check);
    return ()=>{if(timer) clearTimeout(timer);document.removeEventListener("visibilitychange",check);window.removeEventListener("focus",check);};
  },[validUntil]);
  return expired;
}

/** Keep an open detail page from presenting an expired offer as current. */
export default function OfferExpiryBoundary({validUntil,children,expiredContent}:{validUntil?:string;children:ReactNode;expiredContent?:ReactNode}) {
  const expired=useOfferExpired(validUntil);
  if (expired) return expiredContent ?? <section className="price-stale-warning" role="status">
    <strong>Preço atual não confirmado.</strong> Esta oferta precisa de uma nova conferência. Atualize a página para consultar o registro disponível.
  </section>;
  return children;
}
