"use client";

import { useEffect, useRef, useState } from "react";
import { DIRECT_COUNTDOWN_SECONDS, flagKey, nextCountdown, shouldFire } from "../../../lib/direct-flow";

/**
 * Banner de passagem do link direto (`?direto=1`): redireciona para o
 * Mercado Livre (via `/go/[slug]`, que grava o clique afiliado) após 3s.
 * - Qualquer interação (toque, tecla, rolagem) cancela e mantém a página.
 * - Botão "quero ficar aqui" tem o foco inicial: quem quer ficar, fica.
 * - Flag de sessão: depois do primeiro redirecionamento, o botão voltar não
 *   recai num loop — a página mostra estado estático e não redireciona de novo.
 * - Sem animação de contagem (números trocados por estado): `prefers-reduced-motion`
 *   não exige tratamento especial, não há movimento além da mudança de texto.
 */
export default function RedirectBanner({ slug }: { slug: string }) {
  const [countdown, setCountdown] = useState(DIRECT_COUNTDOWN_SECONDS);
  const [redirected, setRedirected] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (sessionStorage.getItem(flagKey(slug)) === "1") {
      setRedirected(true);
      return;
    }

    const cancel = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      setDismissed(true);
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const event of events) {
      window.addEventListener(event, cancel, { passive: true, capture: true });
    }

    const timer = window.setInterval(() => {
      setCountdown((current) => {
        const next = nextCountdown(current);
        if (shouldFire(next) && !doneRef.current) {
          doneRef.current = true;
          sessionStorage.setItem(flagKey(slug), "1");
          window.location.assign(`/go/${slug}`);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
      for (const event of events) {
        window.removeEventListener(event, cancel, { capture: true });
      }
    };
  }, [slug]);

  if (dismissed) return null;

  return (
    <div className="direct-banner" role="note" aria-live="polite">
      {redirected ? (
        <>
          <p>Este dispositivo já foi redirecionado para o Mercado Livre. Sem repeteco.</p>
          <div className="direct-actions">
            <a href={`/go/${slug}`}>ir de novo ↗</a>
            <button type="button" onClick={() => setDismissed(true)}>continuar no BizuMiner</button>
          </div>
        </>
      ) : (
        <>
          <p>Redirecionando para o Mercado Livre em <b>{countdown}</b>…</p>
          <div className="direct-actions">
            <button type="button" autoFocus onClick={() => setDismissed(true)}>quero ficar aqui</button>
          </div>
        </>
      )}
    </div>
  );
}
