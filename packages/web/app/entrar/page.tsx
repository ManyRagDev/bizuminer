import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPageAuth } from "../../lib/auth";
import { authLoginMethods, sanitizeNext } from "../../lib/auth-contract";
import { ThemeToggle } from "../theme-toggle";
import DetailHeader from "../_components/detail-header";
import GoogleButton from "./google-button";
import PasswordForm from "./password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entrar | BizuMiner",
  description: "Entre com sua conta para acessar sua área no BizuMiner.",
  robots: { index: false, follow: false },
};

/** Mantém o produto de origem durante a entrada na conta. */
export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const query = await searchParams;
  const next = sanitizeNext(query.next);
  const methods = authLoginMethods(process.env.AUTH_LOGIN_MODE);
  const user = await getPageAuth();
  if (user) redirect(next);

  return (
    <main className="auth-page">
      <DetailHeader
        actions={
          <>
            <ThemeToggle />
            <a href={next.startsWith("/bizu/") ? next : "/#achados"}>← voltar</a>
          </>
        }
      />

      <section className="auth-stage" aria-label="Entrar na sua área">
        <div className="auth-card">
          <p className="eyebrow">Sua área</p>
          <h1>Entrar na sua área</h1>
          <p className="auth-lead">
            Consulte seus salvos e acompanhe mudanças de preço com a mesma conta, em qualquer aparelho.
          </p>

          {methods.password && <PasswordForm next={next} failed={query.erro === "credenciais"} />}
          {methods.google && <>
            {methods.password && <p className="auth-note">Ou entre com Google:</p>}
            <GoogleButton />
            <p className="auth-note">Entre com a conta Google que você já usa, sem criar outra senha.</p>
          </>}
          {!methods.google && !methods.password && <p className="auth-error" role="alert">A entrada está indisponível neste ambiente.</p>}

          <aside className="auth-ticket" role="note">
            Na sua área, você pode escolher sincronizar os salvos desta sessão com a conta.
          </aside>
        </div>
      </section>
    </main>
  );
}
