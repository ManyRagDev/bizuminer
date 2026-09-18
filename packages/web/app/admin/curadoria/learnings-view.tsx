import type { CurationLearningsData } from "../../../lib/curation-db.ts";

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function LearningsView({
  learnings,
}: {
  learnings: CurationLearningsData;
}) {
  const total = learnings.totalDecisions;
  const pct = (val: number) => (total > 0 ? `${Math.round((val / total) * 100)}%` : "0%");

  return (
    <section className="curation-learnings-view">
      <header className="learnings-head">
        <p className="eyebrow">Aprendizados e Observabilidade Editorial</p>
        <h2>Histórico consolidado de decisões humanas</h2>
        <p>Dados auditáveis gravados em cada revisão, preservando motivos e textos livres para evolução das regras.</p>
      </header>

      <div className="learnings-stats-grid">
        <div className="learning-stat-card primary">
          <span className="stat-label">Decisões registradas</span>
          <strong>{learnings.totalDecisions.toLocaleString("pt-BR")}</strong>
          <small>Eventos com auditoria completa</small>
        </div>
        <div className="learning-stat-card">
          <span className="stat-label">Taxa de compressão</span>
          <strong>{learnings.compressionRatio}×</strong>
          <small>Produtos por decisão humana</small>
        </div>
        <div className="learning-stat-card success">
          <span className="stat-label">Aprovados</span>
          <strong>{learnings.approvedCount.toLocaleString("pt-BR")}</strong>
          <small>{pct(learnings.approvedCount)} do total decidido</small>
        </div>
        <div className="learning-stat-card danger">
          <span className="stat-label">Rejeitados</span>
          <strong>{learnings.rejectedCount.toLocaleString("pt-BR")}</strong>
          <small>{pct(learnings.rejectedCount)} do total decidido</small>
        </div>
        <div className="learning-stat-card warning">
          <span className="stat-label">Saturação de família</span>
          <strong>{learnings.heldSaturationCount.toLocaleString("pt-BR")}</strong>
          <small>Itens redundantes retidos sem rejeição</small>
        </div>
        <div className="learning-stat-card">
          <span className="stat-label">Falta de evidência</span>
          <strong>{learnings.heldEvidenceCount.toLocaleString("pt-BR")}</strong>
          <small>Ofertas fracas ou sem histórico suficiente</small>
        </div>
      </div>

      <section className="learnings-other-section">
        <header className="learnings-other-head">
          <h3>Padrões livres registrados em “Outro” ({learnings.otherReasons.length})</h3>
          <p>Textos livres de 3 a 1000 caracteres digitados pelos curadores. Indicam novos critérios e exceções para formalização futura.</p>
        </header>

        {learnings.otherReasons.length === 0 ? (
          <p className="quiet">Nenhum motivo "Outro" registrado até o momento.</p>
        ) : (
          <div className="learnings-other-list">
            {learnings.otherReasons.map((item) => (
              <article key={item.eventId} className="learning-other-card">
                <header className="other-card-header">
                  <span className={`decision-tag ${item.decision}`}>{item.decision === "reject" ? "Rejeitado" : "Em espera"}</span>
                  <span className="other-date">{dateFormat.format(new Date(item.createdAt))}</span>
                </header>
                <h4 className="other-product-title">{item.title}</h4>
                <blockquote className="other-quote">
                  “{item.reasonDetail}”
                </blockquote>
                <small className="other-meta">Produto: {item.productId.slice(0, 10)}… · Evento: {item.eventId}</small>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
