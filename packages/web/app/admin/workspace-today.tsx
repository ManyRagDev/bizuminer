import AdminLink from "../_components/admin-link.tsx";
import { workspaceOffers } from "../../lib/affiliate-workspace-db.ts";
import { listWorkDrafts } from "../../lib/work-draft-db.ts";
import { accountConnections } from "../../lib/account-connections.ts";
import type { AccountContext } from "../../lib/tenant-db.ts";
import OfertaCard from "./oferta-card.tsx";

export default async function WorkspaceToday({
  account,
}: {
  account: AccountContext;
}) {
  const [selection, work, connections] = await Promise.all([
    workspaceOffers(account),
    listWorkDrafts(account),
    accountConnections(account),
  ]);

  const ready = selection.offers.filter((o) => !o.blockers.whatsapp.length);
  const editing = work.drafts.filter(
    (d) => d.authorId === account.actorAppUserId && d.state === "editing"
  );
  const prepared = work.drafts.filter((d) => d.state === "prepared");
  const hasStore = connections.connections.some((c) => c.configured);

  const displayOffers = (ready.length ? ready : selection.offers).slice(0, 8);

  return (
    <div className="bm-workspace">
      {/* Top Header */}
      <header className="bm-page-heading bm-heading-row">
        <div>
          <p className="bm-eyebrow">Cockpit de vendas</p>
          <h1>
            Ofertas do dia.
            <br />
            <span>Prontas para copiar e postar.</span>
          </h1>
          <p>
            Zero burocracia: escolha o estilo, clique em copiar e mande para seu público.
          </p>
        </div>

        <div className="bm-actions">
          <AdminLink href="/pauta" className="bm-button secondary" title="Abrir mesa rápida para Stories e WhatsApp">
            📱 Pauta de Disparo
          </AdminLink>
          <AdminLink href="/admin/ofertas" className="bm-button">
            🔍 Explorar Catálogo →
          </AdminLink>
        </div>
      </header>

      {/* Quick Link Converter Bar */}
      <section className="bm-quick-converter">
        <span className="bm-eyebrow">Transformar link em indicação</span>
        <h3>Viu uma promoção no Mercado Livre ou Shopee e quer postar agora?</h3>
        <p className="bm-muted" style={{ margin: "2px 0 10px 0", fontSize: "13px" }}>
          Cole o link de qualquer produto para gerar a copy com seu link de afiliado e a arte do Story:
        </p>
        <form action="/admin/ofertas/adicionar" method="GET" className="bm-converter-form">
          <input
            type="url"
            name="url"
            required
            placeholder="Cole o link do produto aqui (ex: https://mercadolivre.com.br/...)"
          />
          <button type="submit" className="bm-button">
            Transformar em Oferta →
          </button>
        </form>
      </section>

      {/* Quick Stats Banner */}
      <div className="bm-stats">
        <AdminLink href="/admin/ofertas?estado=ready">
          <strong>{ready.length}</strong>
          <span>ofertas prontas hoje</span>
        </AdminLink>
        <AdminLink href="/admin/divulgacoes?estado=editing">
          <strong>{work.ready ? editing.length : "—"}</strong>
          <span>rascunhos em andamento</span>
        </AdminLink>
        <AdminLink href="/admin/resultados">
          <strong>Ver resultados</strong>
          <span>cliques e comissões</span>
        </AdminLink>
      </div>

      {/* Main 1-Click Offers Section */}
      <section>
        <div className="bm-section-heading" style={{ marginBottom: "16px" }}>
          <h2>
            {ready.length ? "🔥 Achados Quentes de Hoje" : "Ofertas Disponíveis"}
          </h2>
          <AdminLink href="/admin/ofertas">Ver todas as ofertas ({selection.offers.length}) →</AdminLink>
        </div>

        {displayOffers.length > 0 ? (
          <div className="bm-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: "20px" }}>
            {displayOffers.map((offer) => (
              <OfertaCard key={offer.candidate.id} offer={offer} />
            ))}
          </div>
        ) : (
          <div className="bm-empty">
            <h3>Nenhuma oferta encontrada no momento.</h3>
            <p>
              Cole o link de um produto que você quer divulgar ou use a Curadoria para aprovar mais itens.
            </p>
            <AdminLink href="/admin/ofertas/adicionar" className="bm-button">
              + Adicionar primeira oferta
            </AdminLink>
          </div>
        )}
      </section>

      {/* Footer Helper / Bio link reminder */}
      <section className="bm-card bm-help" style={{ marginTop: "36px" }}>
        <h2>💡 Dica de ouro: Sua Vitrine na Bio</h2>
        <p style={{ margin: "6px 0 12px 0", fontSize: "14px", color: "var(--ink-muted)" }}>
          Cada vez que você copia um link, ele traz o <b>Código da Bio (ex: #104)</b>. Coloque o link da sua vitrine na bio do Instagram ou TikTok para que seus seguidores achem as ofertas mesmo depois que os Stories sumirem.
        </p>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <a href="/" target="_blank" rel="noopener noreferrer" className="bm-button secondary">
            🌐 Ver minha vitrine pública ↗
          </a>
          <AdminLink href="/admin/configuracoes" className="bm-link-button">
            Configurar minha tag de afiliado →
          </AdminLink>
        </div>
      </section>
    </div>
  );
}
