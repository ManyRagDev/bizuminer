"use client";

import { useState } from "react";

export default function MonitoringDispatchButton({ configured }: { configured: boolean }) {
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [runUrl, setRunUrl] = useState("");

  async function dispatch() {
    if (requesting || !configured) return;
    setRequesting(true);
    setError("");
    setRunUrl("");
    try {
      const response = await fetch("/api/admin/monitoring/dispatch", { method: "POST" });
      const result = await response.json() as { ok?: boolean; error?: string; url?: string };
      if (!response.ok || !result.ok) {
        setError(result.error === "run_in_progress"
          ? "Já existe uma execução em andamento."
          : "Não foi possível iniciar a rodada no GitHub.");
        return;
      }
      setRunUrl(result.url ?? "");
    } catch {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="admin-trigger">
      <button type="button" onClick={() => void dispatch()} disabled={!configured || requesting}>
        {requesting ? "Iniciando…" : "Iniciar Shopee e AliExpress agora"}
      </button>
      {!configured && <p>O disparo pelo painel aguarda uma credencial GitHub no servidor.</p>}
      {error && <p role="alert">{error}</p>}
      {runUrl && <p role="status">Rodada solicitada. <a href={runUrl} target="_blank" rel="noopener noreferrer">Acompanhar no GitHub ↗</a></p>}
    </div>
  );
}
