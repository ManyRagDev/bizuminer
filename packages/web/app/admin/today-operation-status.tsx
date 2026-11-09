"use client";

import { useEffect, useState } from "react";
import { marketplaceDef } from "../../lib/marketplaces.ts";
import type { TodayActivity, TodayStatus } from "../../lib/today-operation.ts";
import AdminLink from "../_components/admin-link.tsx";
import styles from "./today-operation-status.module.css";

const storesList = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" });
const channels = [["whatsapp", "WhatsApp"], ["stories", "Stories"]] as const;
const labels: Record<TodayActivity["kind"], string> = {
  queued: "Captura na fila de execução",
  capture: "Capturando ofertas",
  browser: "Mercado Livre aguarda a extensão no navegador",
  triage: "IA avaliando ofertas",
  monitoring: "Atualizando preços",
};

export default function TodayOperationStatus({ tenantId }: { tenantId: string }) {
  const [result, setResult] = useState<TodayStatus | "error" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function refresh() {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/admin/operacao", {
          cache: "no-store", headers: { "x-bm-account": tenantId }, signal: controller.signal,
        });
        if (!response.ok) throw new Error("status_unavailable");
        const value = await response.json() as TodayStatus;
        if (!controller.signal.aborted) setResult(value);
      } catch {
        if (!controller.signal.aborted) setResult("error");
      } finally {
        inFlight = false;
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 20_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [tenantId]);

  const status = result === "error" ? null : result;
  const waitingForBrowser = status?.activities.some(activity => activity.kind === "browser");
  const inProgress = status?.activities.some(activity => activity.kind !== "browser");
  const hasIssue = Boolean(status?.issues.length);
  const ready = status && channels.some(([channel]) => (status.pauta[channel]?.count ?? 0) > 0);
  const bothKnown = status && channels.every(([channel]) => status.pauta[channel] !== null);
  const hasActiveChannel = status && channels.some(([channel]) => status.pauta[channel]?.active);
  let title = "Nenhuma rodagem em andamento";
  if (result === "error") title = "Status indisponível no momento";
  else if (!status) title = "Consultando a operação…";
  else if (waitingForBrowser) title = "Sua ação é necessária";
  else if (inProgress) title = "Operação em andamento";
  else if (hasIssue) title = "Rodagem precisa de atenção";
  else if (ready && bothKnown) title = "Tudo pronto";
  const account = encodeURIComponent(tenantId);

  return <section className={styles.banner} aria-label="Operação e Pauta">
    <div>
      <p className="eyebrow">Operação agora</p>
      <div role="status">
        <strong className={styles.title}>{title}</strong>
        {status?.activities.map(({ kind, marketplaces }) => {
          const stores = marketplaces.map(store => marketplaceDef(store)?.label ?? store);
          const showStores = kind === "queued" || kind === "capture" || kind === "monitoring";
          return <p key={kind}>{labels[kind]}{showStores && stores.length > 0 && ` · ${storesList.format(stores)}`}</p>;
        })}
        {status?.issues.map(issue => <p key={issue}>{issue}</p>)}
      </div>
      {waitingForBrowser && <AdminLink href={`/admin?aba=visao-geral&conta=${account}#captura-hoje`}>Continuar captura</AdminLink>}
      {hasIssue && !waitingForBrowser && <AdminLink href={`/admin?aba=rodagens&conta=${account}`}>Conferir rodagens</AdminLink>}
    </div>
    <div>
      <p className="eyebrow">Pauta</p>
      {status && channels.map(([channel, label]) => {
        const state = status.pauta[channel];
        const count = state?.count ?? 0;
        return <div key={channel} className={styles.channel}>
          <p><strong>{label}</strong> · {state === null ? "Consulta indisponível"
            : !state.active ? "Canal inativo"
              : count === 0 ? "Sem ofertas prontas"
                : count === 1 ? "1 oferta pronta" : `${count} ofertas prontas`}</p>
          {count > 0 && <AdminLink href={`/pauta?conta=${account}&canal=${channel}`}>Abrir {label}</AdminLink>}
        </div>;
      })}
      {bothKnown && !ready && (hasActiveChannel
        ? <AdminLink href={`/admin/curadoria?aba=excecoes&conta=${account}`}>Revisar pendências</AdminLink>
        : <AdminLink href={`/admin/curadoria?aba=selecao&conta=${account}`}>Conferir configuração dos canais</AdminLink>)}
      {status && !bothKnown && !ready && <AdminLink href={`/pauta?conta=${account}`}>Abrir Pauta</AdminLink>}
      {!status && <p>{result === "error" ? "Abra a Pauta para conferir as ofertas." : "Consultando as ofertas prontas…"}</p>}
      {result === "error" && <AdminLink href={`/pauta?conta=${account}`}>Abrir Pauta</AdminLink>}
    </div>
  </section>;
}
