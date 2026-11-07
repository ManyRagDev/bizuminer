"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runAutomatedTriageAction } from "./actions.ts";

export default function TriageControl({ eligible }: { eligible: number }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  function run() {
    startTransition(async () => {
      const result = await runAutomatedTriageAction(100);
      setMessage(
        result.ok
          ? `${result.processed} decisões: ${result.approved} aprovados, ${result.held} retidos, ${result.rejected} rejeitados e ${result.annotatedPending} para revisão.`
          : result.error === "triage_in_progress"
            ? "Já existe uma triagem em andamento."
            : "A triagem não terminou. Consulte o histórico para verificar o erro.",
      );
      router.refresh();
    });
  }
  return (
    <div className="curation-triage-control">
      <div>
        <strong>
          {eligible
            ? `${eligible === 100 ? "Pelo menos " : ""}${eligible} ${eligible === 1 ? "novo produto capturado aguardando triagem" : "novos produtos capturados aguardando triagem"}`
            : "Nenhum produto novo para triagem agora"}
        </strong>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--ink-muted, #71717a)" }}>
          {eligible
            ? "A IA analisa as ofertas capturadas pelas lojas, descarta lixo/peças industriais e aprova os achadinhos de qualidade para a vitrine."
            : "Todas as capturas recentes já foram analisadas. Capture novas ofertas ou revise casos pendentes na fila."}
        </p>
      </div>
      <button type="button" disabled={pending || eligible === 0} onClick={run} style={{ fontWeight: 600 }}>
        {pending ? "Analisando com IA…" : "⚡ Triar produtos com IA"}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
