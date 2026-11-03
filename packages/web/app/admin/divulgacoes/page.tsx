import { pageAccount } from "../../../lib/page-account.ts";
import { listWorkDrafts } from "../../../lib/work-draft-db.ts";
import AdminLink from "../../_components/admin-link.tsx";
export const dynamic = "force-dynamic";
const labels = {
  editing: "Rascunho pessoal",
  review: "Enviado para revisão",
  prepared: "Pronto para publicar",
  published: "Publicação confirmada",
  archived: "Arquivado",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const c = await pageAccount();
  if (!c) return null;
  const work = await listWorkDrafts(c),
    { estado } = await searchParams;
  const drafts = work.drafts.filter((d) => !estado || d.state === estado);
  return (
    <div className="bm-workspace">
      <header className="bm-page-heading bm-heading-row">
        <div>
          <p className="bm-eyebrow">Divulgações</p>
          <h1>Da ideia à publicação.</h1>
          <p>
            Continue seus rascunhos, confira os materiais e veja o que já
            divulgou.
          </p>
        </div>
        <AdminLink href="/admin/ofertas" className="bm-button">
          + Preparar divulgação
        </AdminLink>
      </header>
      <div className="bm-actions">
        <div className="bm-actions">
          {[
            ["", "Todas"],
            ["editing", "Rascunhos"],
            ["review", "Em revisão"],
            ["prepared", "Prontas"],
            ["published", "Publicadas"],
          ].map(([state, label]) => (
            <AdminLink
              key={state}
              className="bm-button secondary"
              aria-current={(estado ?? "") === state ? "page" : undefined}
              href={`/admin/divulgacoes${state ? "?estado=" + state : ""}`}
            >
              {label}
            </AdminLink>
          ))}
        </div>
        <AdminLink href="/admin/marketing">
          Minha rotina de conteúdo →
        </AdminLink>
      </div>
      <p className="bm-muted">
        Rascunhos são pessoais. Materiais enviados para revisão ficam visíveis
        ao responsável. Publicações confirmadas compõem o histórico da conta.
      </p>
      {!work.ready && (
        <p className="bm-notice">
          O salvamento de rascunhos aguarda a habilitação desta capacidade na
          conta.
        </p>
      )}
      <div className="bm-draft-list">
        {drafts.map((d) => (
          <AdminLink
            key={d.id}
            href={`/admin/divulgacoes/${d.id}`}
            className="bm-card bm-draft-row"
          >
            <div>
              <span
                className={`bm-status ${d.state === "prepared" ? "ready" : ""}`}
              >
                {labels[d.state]}
              </span>
              <h2>{d.title || "Divulgação sem título"}</h2>
              <p className="bm-muted">
                {d.channel === "whatsapp"
                  ? "WhatsApp"
                  : d.channel === "stories"
                    ? "Stories"
                    : "Instagram"}{" "}
                · Atualizado em{" "}
                {new Date(d.updatedAt).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })}
              </p>
            </div>
            <span className="bm-text-link">Abrir →</span>
          </AdminLink>
        ))}
      </div>
      {!drafts.length && (
        <div className="bm-empty">
          <h2>
            {estado
              ? "Nenhum material nesta situação."
              : "Sua primeira divulgação começa aqui."}
          </h2>
          <p>
            Escolha uma oferta para preparar uma mensagem ou um Story. Você
            também pode criar um conteúdo livre.
          </p>
          <div className="bm-actions">
            <AdminLink href="/admin/ofertas" className="bm-button">
              Escolher oferta
            </AdminLink>
            <AdminLink href="/admin/divulgacoes/nova">
              Criar conteúdo livre
            </AdminLink>
          </div>
        </div>
      )}
      <details className="bm-card bm-help">
        <summary>Campanhas e conteúdos anteriores</summary>
        <p>
          Seus materiais anteriores continuam disponíveis. Você pode reutilizar
          o texto como um novo rascunho pessoal.
        </p>
        <div className="bm-actions">
          <AdminLink href="/admin/divulgacoes/importar">
            Reutilizar um conteúdo salvo
          </AdminLink>
          <AdminLink href="/admin/campanhas">Campanhas</AdminLink>
          <AdminLink href="/admin/marketing">Rotina e planejamento</AdminLink>
        </div>
      </details>
    </div>
  );
}
