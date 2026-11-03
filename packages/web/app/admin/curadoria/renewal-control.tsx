"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { startHomepageRenewalAction, refreshHomepageRenewalAction } from "./actions.ts";
import type { HomepageRenewalState, homepageRenewalReadiness } from "../../../lib/homepage-renewal.ts";

const date = (value: string) => new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
}).format(new Date(value));
const outcomes = {
  not_started: "Nenhuma tentativa registrada.", published: "Uma nova seleção foi publicada.",
  unchanged: "As ofertas foram conferidas; a seleção foi mantida.", awaiting_review: "Aguardando produtos aptos para a composição.",
  manual_edition: "A edição escolhida manualmente continua no controle, dentro da sua vigência.",
  failed: "A última atualização falhou. Tente novamente; os itens continuam sujeitos à validade do preço.",
};

export default function RenewalControl({ state, readiness, canManage }: {
  state: HomepageRenewalState;
  readiness: ReturnType<typeof homepageRenewalReadiness>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  function run(enable: boolean) {
    startTransition(async () => {
      try {
        const response = await (enable ? startHomepageRenewalAction() : refreshHomepageRenewalAction());
        if (!response.ok) {
          setMessage(response.error === "forbidden" ? "Apenas o responsável pela conta pode ativar ou atualizar a renovação." : "Não foi possível atualizar a renovação. Tente novamente.");
          return;
        }
        const result = response.result;
        setMessage(!result.ready ? "A atualização não foi concluída. Tente novamente."
          : "blocked" in result && result.blocked === "no_qualified_products" ? "Renovação habilitada. A primeira edição será publicada quando houver produtos aptos. Confira as revisões abaixo."
          : "blocked" in result && result.blocked ? "Ative a renovação para iniciar a composição diária."
          : result.changed ? `Seleção atualizada com ${result.count} produtos.` : "Conferência concluída. A seleção foi mantida até a próxima renovação ou mudança nas ofertas.");
        router.refresh();
      } catch { setMessage("Não foi possível concluir a atualização. Tente novamente."); }
    });
  }
  return <section className="curation-renewal" aria-labelledby="renewal-title">
    <p className="eyebrow">Rotina da pauta</p>
    <h2 id="renewal-title">{state.outcome === "manual_edition" ? "Edição editorial manual no controle" : state.enabled ? state.renewedAt ? "Renovação diária habilitada" : "Renovação habilitada · aguardando primeira edição" : "Ativar a renovação diária"}</h2>
    <p>Até 24 produtos aprovados, com variedade de usos, lojas e faixas de preço. A cada 24 horas, até um quarto da seleção pode ser substituído por ofertas aptas de mérito semelhante. Produtos já apresentados podem voltar após um intervalo, sem reabrir ofertas vencidas ou reprovadas.</p>
    <p><strong>{readiness.qualified} produtos aptos</strong> entre {readiness.candidates} candidatos recentes. A composição atual comporta {readiness.editionCount} produtos após limitar repetições.</p>
    {state.renewedAt && <p>Última renovação: <time dateTime={state.renewedAt}>{date(state.renewedAt)}</time> (São Paulo). Próxima avaliação da composição: {state.renewAfter ? date(state.renewAfter) : "a definir"}. A execução ocorre na rodada programada seguinte.</p>}
    <p role={state.outcome === "failed" ? "alert" : undefined}>{outcomes[state.outcome]} {state.lastAttemptAt && <>Última tentativa: {date(state.lastAttemptAt)} (São Paulo).</>}</p>
    {!readiness.qualified && <p>Os produtos do catálogo de transição ainda podem aparecer na pauta. A renovação exige evidências suficientes ou uma avaliação editorial completa; habilitar a rotina mantém essa exigência.</p>}
    {!state.schemaReady && <p role="alert">A estrutura da renovação ainda precisa ser instalada neste ambiente.</p>}
    <div className="curation-review-actions">
      <button type="button" disabled={pending || !state.schemaReady || !canManage} onClick={() => run(!state.enabled)}>
        {pending ? "Conferindo…" : state.enabled ? "Conferir ofertas e atualizar" : "Habilitar renovação diária"}
      </button>
      <a href="/admin?aba=captura-manual">Capturar novos candidatos</a>
    </div>
    {message && <p role="status">{message}</p>}
    {readiness.reasons.length > 0 && <details>
      <summary>O que impede os produtos de entrar na renovação</summary>
      <ul>{readiness.reasons.map(({ reason, count }) => <li key={reason}>{count} produtos: {reason}</li>)}</ul>
      <p>Uma avaliação editorial registra público, utilidade, valor, confiança e clareza da compra. Ela precisa ser conferida pelo editor; campos ausentes na captura permanecem desconhecidos.</p>
      <ul>{readiness.reviewProducts.map(product => <li key={product.id}>
        <Link prefetch={false} href={`/admin/curadoria?aba=selecao&revisar=${encodeURIComponent(product.id)}`}>{product.title} · revisar</Link>
        <p>{product.blockers.join(" ")}</p>
      </li>)}</ul>
    </details>}
  </section>;
}
