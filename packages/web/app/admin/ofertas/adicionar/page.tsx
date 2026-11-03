"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminFetch } from "../../draft-provider.tsx";
import { sourceProduct } from "../../../../lib/affiliate-workspace-contract.ts";
import AdminLink from "../../../_components/admin-link.tsx";
export default function Page() {
  const fetch = useAdminFetch(),
    router = useRouter(),
    [url, setUrl] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [requestId] = useState(() => crypto.randomUUID()),
    source = sourceProduct(url);
  return (
    <div className="bm-workspace">
      <AdminLink href="/admin/ofertas">← Ofertas</AdminLink>
      <header className="bm-page-heading">
        <p className="bm-eyebrow">Adicionar oferta</p>
        <h1>Encontrou algo que vale indicar?</h1>
        <p>
          Abra o produto na loja e traga o link completo. A oferta será
          conferida antes de qualquer divulgação.
        </p>
      </header>
      <section className="bm-card">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            setBusy(true);
            try {
              const r = await fetch("/api/admin/workspace", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "registerOffer",
                    url,
                    title: String(d.get("title")),
                    priceCents: Math.round(Number(d.get("price")) * 100),
                    requestId,
                  }),
                }),
                v = await r.json();
              if (!r.ok) throw new Error(v.error);
              router.push("/admin/ofertas/" + v.productId);
            } catch (e) {
              setMessage(
                e instanceof Error ? e.message : "Não foi possível adicionar.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Link completo do produto
              <input
                type="url"
                required
                value={url}
                maxLength={2000}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
            {url && !source && (
              <p className="bm-notice">
                Use o endereço da página do produto no Mercado Livre, Shopee ou
                AliExpress. Abra links encurtados na loja antes de copiar.
              </p>
            )}
            <label>
              Nome do produto que você está vendo
              <input name="title" required minLength={3} maxLength={500} />
            </label>
            <label>
              Preço que aparece no anúncio (R$)
              <input
                name="price"
                required
                type="number"
                min="0.01"
                step="0.01"
                max="1000000"
              />
            </label>
            <p className="bm-muted">
              Anotar o preço do anúncio não confirma uma opção de compra. Cor,
              tamanho, quantidade e condições serão conferidos no próximo passo.
            </p>
            <button className="bm-button" type="submit" disabled={!source}>
              Adicionar e conferir →
            </button>
          </fieldset>
        </form>
        {message && <p role="status">{message}</p>}
      </section>
      <details className="bm-card bm-help">
        <summary>Receber ofertas das lojas ou usar a extensão</summary>
        <p>
          As conexões de Shopee e AliExpress usam as APIs oficiais. No Mercado
          Livre, a captura ocorre a partir da página aberta por você.
        </p>
        <div className="bm-actions">
          <AdminLink href="/admin/onboarding">Minhas conexões</AdminLink>
          <AdminLink href="/admin?aba=captura-manual">
            Capturar a página que abri
          </AdminLink>
          <AdminLink href="/admin?aba=rodagens">
            Recebimento de ofertas
          </AdminLink>
        </div>
      </details>
    </div>
  );
}
