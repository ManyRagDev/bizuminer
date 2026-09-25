import type { GithubMonitoringRun } from "../../lib/github-monitoring";
import MonitoringDispatchButton from "./monitoring-dispatch-button";

const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit",
  year: "numeric", hour: "2-digit", minute: "2-digit",
}).format(new Date(value));

function runLabel(run: GithubMonitoringRun): { label: string; className: string } {
  if (run.status !== "completed") return { label: "em andamento", className: "running" };
  if (run.conclusion === "success") return { label: "concluída", className: "ok" };
  if (run.conclusion === "skipped") return { label: "ignorada", className: "empty" };
  return { label: run.conclusion === "cancelled" ? "cancelada" : "falhou", className: "error" };
}

function captureLabel(capture: GithubMonitoringRun["captures"][number]): string {
  const store = capture.marketplace === "shopee" ? "Shopee" : capture.marketplace === "aliexpress" ? "AliExpress" : capture.marketplace;
  if (capture.status === "running") return `${store}: em andamento`;
  if (capture.status === "error") return `${store}: falha (${capture.failed})`;
  if (capture.attempted === 0) return `${store}: nenhum item elegível`;
  return `${store}: ${capture.matched}/${capture.attempted} preços confirmados${capture.priceChanges ? `, ${capture.priceChanges} alterações` : ""}`;
}

function skipLabel(skip: GithubMonitoringRun["skips"][number]): string {
  const store = skip.marketplace === "shopee" ? "Shopee" : skip.marketplace === "aliexpress" ? "AliExpress" : skip.marketplace;
  return `${store}: ${skip.reason === "account_suspended" ? "conta suspensa" : "pausada no painel"}`;
}

export default function GithubMonitoringPanel({
  runs, error, dispatchConfigured,
}: { runs: GithubMonitoringRun[]; error: boolean; dispatchConfigured: boolean }) {
  return (
    <section className="admin-section" aria-labelledby="github-monitoring-title">
      <h2 id="github-monitoring-title">Acompanhamento agendado · conta da casa</h2>
      <p>O estado da execução vem do GitHub. Os preços confirmados vêm do banco. Uma execução concluída pode não ter encontrado produtos elegíveis.</p>
      <MonitoringDispatchButton configured={dispatchConfigured} />
      <p><a href="https://github.com/ManyRagDev/bizuminer/actions/workflows/monitor-prices.yml" target="_blank" rel="noopener noreferrer">Iniciar acompanhamento no GitHub ↗</a> <span>É necessário entrar no GitHub com acesso ao repositório.</span></p>
      {error ? (
        <p className="admin-message admin-message--notice" role="status">O histórico do GitHub está indisponível no momento. O histórico das capturas abaixo continua disponível.</p>
      ) : runs.length === 0 ? (
        <p className="member-empty">Ainda não há execuções deste agendamento.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Início</th><th>Tipo</th><th>GitHub</th><th>Captura de preços</th><th>Detalhes</th></tr></thead>
            <tbody>
              {runs.map((run) => {
                const state = runLabel(run);
                return (
                  <tr key={run.id}>
                    <td>{dateTime(run.createdAt)}</td>
                    <td>{run.event === "schedule" ? "agendada" : run.event === "workflow_dispatch" ? "manual" : run.event}</td>
                    <td><span className={`run-status ${state.className}`}>{state.label}</span></td>
                    <td>{run.captures.length + run.skips.length > 0
                      ? [...run.captures.map(captureLabel), ...run.skips.map(skipLabel)].join(" · ")
                      : run.conclusion === "skipped" ? "nenhuma captura iniciada" : "sem relatório vinculado"}</td>
                    <td><a href={run.url} target="_blank" rel="noopener noreferrer">Ver execução ↗</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
