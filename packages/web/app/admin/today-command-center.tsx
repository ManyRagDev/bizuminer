import type { WorkbenchPage } from "../../lib/workbench-contract.ts";
import type { StoreHealth } from "../../lib/today-operation.ts";
import WorkbenchInteractiveTable from "./workbench-interactive-table.tsx";

interface TodayCommandCenterProps {
  autoPublish: boolean;
  minScore: number;
  captureDoneToday: boolean;
  triageDoneToday: boolean;
  approvedToday: number;
  eligibleTriage?: number;
  selectionReady: boolean;
  selectionLabel: string;
  awaiting: number;
  held: number;
  deferred: number;
  auditRemaining: number;
  workbenchPage?: WorkbenchPage | null;
  storesHealth?: StoreHealth[];
}

export default function TodayCommandCenter(props: TodayCommandCenterProps) {
  const pending = props.awaiting + props.held;
  return (
    <section className="today-command-center" aria-labelledby="today-title">
      <header className="today-command-header">
        <div>
          <p className="eyebrow">Operação de hoje</p>
          <h1 id="today-title">
            {props.selectionReady
              ? "Seleção de destaques disponível"
              : pending
                ? "Resolva as pendências ou capture novas ofertas"
                : "Capture ofertas para ampliar a seleção"}
          </h1>
          <p>
            {props.selectionLabel}. Aprovação no catálogo e escolha dos
            destaques têm contagens próprias.
          </p>
        </div>
        <div
          className={`autopilot-status ${props.autoPublish ? "active" : "paused"}`}
        >
          <span>
            {props.autoPublish
              ? "Aprovação automática ativa"
              : "Aprovação humana"}
          </span>
          <small>
            {props.autoPublish
              ? `Aprova notas a partir de ${props.minScore}`
              : "A IA recomenda e você decide"}
          </small>
        </div>
      </header>
      <ol className="today-workflow" aria-label="Estado real da operação">
        <li className={props.captureDoneToday ? "done" : ""}>
          <span className="workflow-step-mark">1</span>
          <div>
            <strong>Descoberta</strong>
            <small>
              {props.captureDoneToday
                ? "ofertas capturadas hoje"
                : "sem descoberta concluída hoje"}
            </small>
          </div>
        </li>
        <li className={props.triageDoneToday ? "done" : ""}>
          <span className="workflow-step-mark">2</span>
          <div>
            <strong>Triagem inicial</strong>
            <small>
              {props.eligibleTriage && props.eligibleTriage > 0
                ? `${props.eligibleTriage} ${props.eligibleTriage === 1 ? "novo capturado" : "novos capturados"} aguardando IA`
                : props.triageDoneToday
                  ? `${props.approvedToday} aprovados na última rodada de hoje`
                  : "sem rodada concluída hoje"}
            </small>
          </div>
        </li>
        <li className={pending === 0 ? "done" : ""}>
          <span className="workflow-step-mark">3</span>
          <div>
            <strong>Pendências</strong>
            <small>
              {pending === 0
                ? "todas resolvidas hoje"
                : `${props.awaiting} aguardando · ${props.held} retidos`}
            </small>
          </div>
        </li>
        <li className={props.selectionReady ? "done" : ""}>
          <span className="workflow-step-mark">4</span>
          <div>
            <strong>Seleção de destaques</strong>
            <small>{props.selectionLabel}</small>
          </div>
        </li>
      </ol>
      <div className="today-primary-action">
        {props.eligibleTriage && props.eligibleTriage > 0 ? (
          <a
            href="/admin/curadoria?aba=selecao"
            style={{ background: "#7c3aed", color: "#fff", fontWeight: 600 }}
          >
            ⚡ Triar {props.eligibleTriage} produtos com IA →
          </a>
        ) : (
          <a href="/admin/curadoria?aba=selecao">Abrir curadoria →</a>
        )}
        <a href="#captura-hoje">Capturar ofertas</a>
        {pending > 0 && (
          <a href="#bancada-hoje" style={{ background: "transparent", color: "var(--accent, #0070f3)", border: "1px solid var(--accent, #0070f3)" }}>
            Resolver pendências na bancada ({pending}) ↓
          </a>
        )}
      </div>
      <p className="curation-muted">
        O cron acompanha preços de produtos conhecidos. Qualidade da IA é uma
        amostra opcional
        {props.auditRemaining > 0
          ? ` com ${props.auditRemaining} produtos disponíveis para conferir`
          : ""}
        ; você pode{" "}
        <a href="/admin/curadoria?aba=auditoria">conferi-la separadamente</a>.
      </p>

      {props.storesHealth && props.storesHealth.length > 0 && (
        <section className="today-stores-health" aria-label="Saúde da pauta por loja">
          <div className="today-stores-health-header">
            <div>
              <h3>Saúde da Pauta & Próximas Rodagens</h3>
              <p>
                A pauta prioriza ofertas recentes (&lt;3h). Se uma loja ficar sem rodagem recente ou virar a meia-noite,
                suas ofertas perdem prioridade para evitar que promoções encerradas cheguem ao grupo.
              </p>
            </div>
            <a href="/pauta" className="today-stores-pauta-link" target="_blank" rel="noreferrer">
              Ver Pauta ao Vivo ↗
            </a>
          </div>
          <div className="today-stores-grid">
            {props.storesHealth.map((store) => (
              <div
                key={store.marketplace}
                className={`today-store-card today-store-card-${store.status}`}
              >
                <div className="today-store-card-header">
                  <strong>{store.name}</strong>
                  <span className={`today-store-badge today-store-badge-${store.status}`}>
                    <span className="today-store-dot" />
                    {store.status === "fresh" ? "Em dia" : store.status === "warm" ? "Atenção" : "Exige rodagem"}
                  </span>
                </div>
                <div className="today-store-card-metrics">
                  <div className="today-store-metric-row">
                    <span className="today-store-metric-label">Última captura:</span>
                    <span
                      className="today-store-metric-value"
                      title={store.lastCaptureAt ? new Date(store.lastCaptureAt).toLocaleString("pt-BR") : "Nunca"}
                    >
                      {store.lastCaptureAgo}
                    </span>
                  </div>
                  <div className="today-store-metric-row">
                    <span className="today-store-metric-label">Ofertas &lt;3h na pauta:</span>
                    <span className="today-store-metric-value">
                      <b>{store.freshApprovedCount}</b> aprovadas ({store.freshCount} total)
                    </span>
                  </div>
                </div>
                <div className="today-store-card-action">
                  <a
                    href={store.actionUrl}
                    target={store.actionUrl.startsWith("http") ? "_blank" : undefined}
                    rel={store.actionUrl.startsWith("http") ? "noreferrer" : undefined}
                    className={`today-store-btn ${store.status === "stale" ? "urgent" : ""}`}
                  >
                    {store.actionLabel}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {props.workbenchPage && (
        <WorkbenchInteractiveTable initialPage={props.workbenchPage} />
      )}
    </section>
  );
}
