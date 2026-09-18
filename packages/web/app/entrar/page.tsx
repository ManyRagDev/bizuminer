import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPageAuth } from "../../lib/auth";
import { ThemeToggle } from "../theme-toggle";
import DetailHeader from "../_components/detail-header";
import GoogleButton from "./google-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entrar | BizuMiner",
  description: "Entre com sua conta Google para acessar sua área no BizuMiner.",
  robots: { index: false, follow: false },
};

/** A porta de volta para a bancada: login único com o Google. */
export default async function EntrarPage() {
  const user = await getPageAuth();
  if (user) redirect("/minha-area");

  return (
    <main className="auth-page">
      <DetailHeader
        actions={
          <>
            <ThemeToggle />
            <a href="/#achados">← voltar aos achados</a>
          </>
        }
      />

      <section className="auth-stage" aria-label="Entrar na sua área">
        <div className="auth-card">
          <p className="eyebrow">Sua bancada</p>
          <h1>Entrar na sua área</h1>
          <p className="auth-lead">
            Seus salvos, os itens de olho no preço e as recomendações — a mesma bancada, em qualquer aparelho.
          </p>

          <GoogleButton />

          <p className="auth-note">
            Sem senha para decorar: a conta é a do Google que você já usa. É também por ela que o dono reconhece
            quem tem acesso ao painel.
          </p>

          <aside className="auth-ticket" role="note">
            Seus salvos e acompanhamentos deste navegador entram na conta sozinhos — sem formulário, sem
            importação manual.
          </aside>
        </div>
      </section>
    </main>
  );
}
