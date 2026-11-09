"use client";

import { useState } from "react";
import type { GA4DashboardData } from "../../../lib/ga4-reporting.ts";

interface Props {
  initialData: GA4DashboardData | null;
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return "0s";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatPagePath(path: string): { label: string; isBizu: boolean } {
  if (path === "/") return { label: "Página Inicial (Vitrine)", isBizu: false };
  if (path.startsWith("/bizu/")) {
    const slug = path.replace("/bizu/", "");
    return { label: `Oferta: ${slug}`, isBizu: true };
  }
  if (path.startsWith("/p/")) return { label: `Link Curto: ${path}`, isBizu: true };
  if (path.startsWith("/admin")) return { label: `Painel Admin (${path})`, isBizu: false };
  return { label: path, isBizu: false };
}

export default function GA4MetricsPanel({ initialData }: Props) {
  const [data, setData] = useState<GA4DashboardData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/analytics?refresh=1");
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const json = await res.json();
      if (json.ok && json.data) {
        setData(json.data);
      } else {
        throw new Error(json.error || "Falha ao atualizar dados");
      }
    } catch (err: any) {
      setError(err?.message || "Não foi possível atualizar agora.");
    } finally {
      setLoading(false);
    }
  };

  if (!data) {
    return (
      <section className="bm-card" style={{ marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2>📊 Audiência e Tráfego do Site</h2>
            <p className="bm-muted" style={{ margin: "4px 0 0" }}>
              As credenciais do Google Analytics 4 (GA4) ainda não foram vinculadas ou estão pendentes de leitura.
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="bm-button secondary"
            style={{ fontSize: "13px", padding: "8px 14px" }}
          >
            {loading ? "Testando..." : "Testar Conexão"}
          </button>
        </div>
      </section>
    );
  }

  const { overview, topPages, trafficSources, events, fetchedAt, propertyId } = data;
  const l30 = overview.last30Days;
  const l7 = overview.last7Days;
  const today = overview.today;

  return (
    <section className="bm-card" style={{ marginTop: "32px" }}>
      {/* Header with Title and Realtime Indicator */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "12px",
          borderBottom: "1px solid var(--line)",
          paddingBottom: "16px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h2 style={{ margin: 0 }}>📊 Audiência e Tráfego do Site</h2>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: overview.realtimeUsers > 0 ? "#ecfdf5" : "#f1f5f9",
                color: overview.realtimeUsers > 0 ? "#059669" : "#64748b",
                border: `1px solid ${overview.realtimeUsers > 0 ? "#a7f3d0" : "#cbd5e1"}`,
                borderRadius: "16px",
                padding: "3px 10px",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: overview.realtimeUsers > 0 ? "#10b981" : "#94a3b8",
                  boxShadow:
                    overview.realtimeUsers > 0 ? "0 0 0 2px rgba(16, 185, 129, 0.3)" : "none",
                }}
              />
              {overview.realtimeUsers}{" "}
              {overview.realtimeUsers === 1 ? "usuário ativo agora" : "usuários ativos agora"}
            </span>
          </div>
          <p className="bm-muted" style={{ margin: "4px 0 0", fontSize: "13px" }}>
            Métricas oficiais do Google Analytics 4 · Propriedade ID <code>{propertyId}</code>
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {error && <span style={{ color: "#b91c1c", fontSize: "12px" }}>{error}</span>}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="bm-button secondary"
            style={{ fontSize: "13px", padding: "6px 12px", height: "auto" }}
            title={`Última sincronização: ${new Date(fetchedAt).toLocaleTimeString("pt-BR")}`}
          >
            {loading ? "Sincronizando..." : "↻ Atualizar GA4"}
          </button>
        </div>
      </div>

      {/* 30 Days KPI Cards */}
      <div
        className="bm-stats"
        style={{
          margin: "20px 0 24px",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "12px",
        }}
      >
        <div style={{ padding: "16px" }}>
          <strong>{l30.pageViews.toLocaleString("pt-BR")}</strong>
          <span>Visualizações (30d)</span>
          <small style={{ marginTop: "4px", fontSize: "11px", color: "var(--ink-muted)" }}>
            {l7.pageViews} nos últ. 7 dias · {today.pageViews} hoje
          </small>
        </div>
        <div style={{ padding: "16px" }}>
          <strong>{l30.activeUsers.toLocaleString("pt-BR")}</strong>
          <span>Visitantes Únicos (30d)</span>
          <small style={{ marginTop: "4px", fontSize: "11px", color: "var(--ink-muted)" }}>
            {l7.activeUsers} nos últ. 7 dias · {today.activeUsers} hoje
          </small>
        </div>
        <div style={{ padding: "16px" }}>
          <strong>{l30.sessions.toLocaleString("pt-BR")}</strong>
          <span>Sessões no Site (30d)</span>
          <small style={{ marginTop: "4px", fontSize: "11px", color: "var(--ink-muted)" }}>
            {l7.sessions} nos últ. 7 dias · {today.sessions} hoje
          </small>
        </div>
        <div style={{ padding: "16px" }}>
          <strong>{formatDuration(l30.avgSessionDurationSec)}</strong>
          <span>Tempo Médio no Site</span>
          <small style={{ marginTop: "4px", fontSize: "11px", color: "var(--ink-muted)" }}>
            Duração da visita
          </small>
        </div>
        <div style={{ padding: "16px" }}>
          <strong>{l30.bounceRatePct.toFixed(1)}%</strong>
          <span>Taxa de Rejeição</span>
          <small style={{ marginTop: "4px", fontSize: "11px", color: "var(--ink-muted)" }}>
            Visitas sem interação
          </small>
        </div>
      </div>

      {/* Two Column Breakdown: Top Pages and Traffic Sources */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "20px",
          marginTop: "16px",
        }}
      >
        {/* Col 1: Top Pages */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <h3 style={{ fontSize: "15px", margin: "0 0 12px 0", fontWeight: 700 }}>
            📄 Páginas e Ofertas mais acessadas
          </h3>
          {topPages.length > 0 ? (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {topPages.map((p, idx) => {
                const info = formatPagePath(p.path);
                return (
                  <li
                    key={p.path}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: idx < topPages.length - 1 ? "1px solid var(--line)" : "none",
                      fontSize: "13px",
                    }}
                  >
                    <div style={{ minWidth: 0, paddingRight: "8px" }}>
                      <span
                        style={{
                          fontWeight: 700,
                          marginRight: "6px",
                          color: "var(--ink-muted)",
                          fontSize: "11px",
                        }}
                      >
                        #{idx + 1}
                      </span>
                      <span
                        style={{
                          fontWeight: 600,
                          color: info.isBizu ? "#2563eb" : "var(--ink)",
                          wordBreak: "break-all",
                        }}
                        title={p.path}
                      >
                        {info.label}
                      </span>
                    </div>
                    <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <span style={{ fontWeight: 700 }}>{p.pageViews}</span>{" "}
                      <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>views</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="bm-muted" style={{ margin: 0, fontSize: "13px" }}>
              Nenhuma visualização de página registrada ainda.
            </p>
          )}
        </div>

        {/* Col 2: Traffic Sources */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <h3 style={{ fontSize: "15px", margin: "0 0 12px 0", fontWeight: 700 }}>
            🧭 Origem do Tráfego (Canais)
          </h3>
          {trafficSources.length > 0 ? (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {trafficSources.map((s, idx) => (
                <li
                  key={`${s.channel}-${s.sourceMedium}-${idx}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0",
                    borderBottom:
                      idx < trafficSources.length - 1 ? "1px solid var(--line)" : "none",
                    fontSize: "13px",
                  }}
                >
                  <div>
                    <strong style={{ display: "block" }}>{s.channel}</strong>
                    <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
                      {s.sourceMedium}
                    </span>
                  </div>
                  <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <span style={{ fontWeight: 700 }}>{s.sessions}</span>{" "}
                    <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>sessões</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="bm-muted" style={{ margin: 0, fontSize: "13px" }}>
              Nenhum canal de tráfego detectado ainda.
            </p>
          )}
        </div>
      </div>

      {/* Row 3: Events Recorded by BizuMiner in GA4 */}
      {events.length > 0 && (
        <div
          style={{
            marginTop: "20px",
            paddingTop: "16px",
            borderTop: "1px solid var(--line)",
          }}
        >
          <h3 style={{ fontSize: "14px", margin: "0 0 10px 0", fontWeight: 700 }}>
            🎯 Eventos registrados pelo BizuMiner no GA4
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {events.map((ev) => (
              <span
                key={ev.eventName}
                style={{
                  background: "var(--surface-sunken, #f8fafc)",
                  border: "1px solid var(--line)",
                  borderRadius: "8px",
                  padding: "4px 10px",
                  fontSize: "12px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <code style={{ fontSize: "11px" }}>{ev.eventName}</code>
                <strong style={{ color: "var(--ink)" }}>{ev.count}</strong>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
