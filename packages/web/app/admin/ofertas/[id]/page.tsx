import { pageAccount } from "../../../../lib/page-account.ts";
import { workspaceOffers } from "../../../../lib/affiliate-workspace-db.ts";
import { notFound } from "next/navigation";
import OfferConfirmation from "../../curadoria/offer-confirmation.tsx";
import OfferReview from "../review.tsx";
import AdminLink from "../../../_components/admin-link.tsx";
import { offerPriceLabel } from "../../../../lib/offer-price.ts";
import PrepareLink from "../prepare-link.tsx";
import { validDraftId } from "../../../../lib/affiliate-workspace-contract.ts";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rascunho?: string }>;
}) {
  const c = await pageAccount();
  if (!c) return null;
  const { id } = await params,
    { offers } = await workspaceOffers(c, id),
    offer = offers.find((o) => o.candidate.id === id);
  if (!offer) notFound();
  const p = offer.candidate;
  const { rascunho } = await searchParams,
    selectedDraft = validDraftId(rascunho) ? rascunho : null;
  return (
    <div className="bm-workspace">
      <AdminLink href="/admin/ofertas">← Ofertas</AdminLink>
      <header className="bm-page-heading">
        <p className="bm-eyebrow">Conferir e preparar</p>
        <h1>{p.displayTitle ?? p.title}</h1>
        <p>{p.assessment?.benefit ?? p.benefit}</p>
      </header>
      <div className="bm-split">
        <section className="bm-card">
          <h2>O que você vai indicar</h2>
          <p className="bm-price">{offerPriceLabel(p)}</p>
          <dl>
            <dt>Opção</dt>
            <dd>{p.offerOptionLabel ?? "Precisa de conferência"}</dd>
            <dt>O que vem</dt>
            <dd>{p.purchaseContents ?? "Ainda não informado"}</dd>
            <dt>Condições</dt>
            <dd>{p.offerConditions || "Confira as condições desta compra."}</dd>
            <dt>Última conferência</dt>
            <dd>
              {p.evidenceObservedAt
                ? new Date(p.evidenceObservedAt).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })
                : "Sem conferência"}
            </dd>
          </dl>
          <a
            href={p.productUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            Abrir na loja ↗
          </a>
          <OfferConfirmation candidate={p} />
          {p.curationStatus === "approved" &&
            offer.blockers.whatsapp.some((b) =>
              b.includes("link de afiliado"),
            ) && <PrepareLink productId={p.id} />}
        </section>
        <section className="bm-card">
          <h2>Preparar minha divulgação</h2>
          <p>
            Você confere o material e publica no seu canal. A campanha é
            opcional.
          </p>
          {(["whatsapp", "stories"] as const).map((channel) => (
            <div className="bm-channel" key={channel}>
              <h3>
                {channel === "whatsapp" ? "WhatsApp" : "Story para Instagram"}
              </h3>
              {offer.blockers[channel].length ? (
                <>
                  <p className="bm-status pending">O que falta</p>
                  <ul>
                    {offer.blockers[channel].map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  <AdminLink href="/admin/configuracoes">
                    Ver público e canais →
                  </AdminLink>
                </>
              ) : (
                <AdminLink
                  className="bm-button"
                  href={`/admin/divulgacoes/${selectedDraft ?? "nova"}?produto=${id}&canal=${channel}`}
                >
                  Preparar {channel === "whatsapp" ? "mensagem" : "Story"} →
                </AdminLink>
              )}
            </div>
          ))}
        </section>
      </div>
      <details
        className="bm-card bm-help"
        open={!p.assessment || p.curationStatus === "pending"}
      >
        <summary>Por que vale indicar? · Revisar avaliação</summary>
        <p>
          Registre quem se beneficia, o que recebe e quais evidências sustentam
          sua indicação.
        </p>
        <OfferReview candidate={JSON.parse(JSON.stringify(p))} />
      </details>
      <details className="bm-card">
        <summary>Mais opções para esta oferta</summary>
        <AdminLink href={`/admin/curadoria?aba=selecao&revisar=${id}`}>
          Revisão editorial completa
        </AdminLink>
        <p>
          <AdminLink href={`/admin/campanhas?productId=${id}`}>
            Organizar em uma campanha
          </AdminLink>
        </p>
      </details>
    </div>
  );
}
