"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";

/**
 * Início do fluxo OAuth (PKCE). O redirectTo aponta para /auth/callback com o
 * `next` sanitizado pela página de origem; o code_verifier fica em cookie e o
 * callback server-side troca o código pela sessão e roda o merge.
 */
export default function GoogleButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function entrar() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      );
      const next = new URLSearchParams(window.location.search).get("next") ?? "/minha-area";
      // O `next` viaja em cookie, NÃO na query do redirectTo: o GoTrue casa a
      // URL do redirectTo com a lista de Redirect URLs do projeto — query extra
      // quebrava a correspondência exata e o fluxo caía no fallback (Site URL).
      // Cookie: 5 min, SameSite=Lax; o /auth/callback lê, sanitiza e apaga.
      document.cookie = `bm_auth_next=${encodeURIComponent(next)}; path=/; SameSite=Lax; max-age=300`;
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    } catch {
      setBusy(false);
      setError(true);
    }
  }

  return (
    <div className="auth-google">
      {error && <p className="auth-error" role="alert">Não deu para abrir o Google agora. Tente de novo.</p>}
      <button type="button" className="auth-google-button" disabled={busy} onClick={() => void entrar()}>
        <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        <b>{busy ? "abrindo o Google…" : "continuar com Google"}</b>
      </button>
    </div>
  );
}
