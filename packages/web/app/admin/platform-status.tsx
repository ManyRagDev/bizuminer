export interface PlatformStatusRow {
  slug: string;
  label: string;
  captureMode: "manual" | "api";
  enabled: boolean;
  productCount: number;
  lastRun: { status: "running" | "ok" | "error"; startedAt: string; itemsCaptured: number } | null;
}

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * Resumo por plataforma na Visão geral (M4). Não faz chamada nenhuma — os
 * dados chegam prontos do servidor (`admin/page.tsx`), como o resto da página.
 */
export default function PlatformStatus({ rows }: { rows: PlatformStatusRow[] }) {
  return (
    <section className="admin-section" aria-labelledby="platform-status-title">
      <h2 id="platform-status-title">Plataformas</h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>plataforma</th>
              <th>captura</th>
              <th>estado</th>
              <th className="num">produtos ativos/recentes</th>
              <th>última rodagem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.slug}>
                <td>{row.label}</td>
                <td>{row.captureMode === "manual" ? "manual (bookmarklet/extensão)" : "API oficial"}</td>
                <td>
                  {row.captureMode === "manual" ? (
                    <span className="run-status ok">sempre disponível</span>
                  ) : (
                    <span className={`run-status ${row.enabled ? "ok" : "empty"}`}>{row.enabled ? "ligada" : "desligada"}</span>
                  )}
                </td>
                <td className="num">{row.productCount.toLocaleString("pt-BR")}</td>
                <td>
                  {row.lastRun
                    ? `${dateTime(row.lastRun.startedAt)} · ${row.lastRun.status} · ${row.lastRun.itemsCaptured} itens`
                    : row.captureMode === "manual"
                      ? "sem rodagem automatizada (captura manual)"
                      : "nunca rodou"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
