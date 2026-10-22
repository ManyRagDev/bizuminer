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
            ? `${eligible === 100 ? "Pelo menos " : ""}${eligible} ${eligible === 1 ? "produto disponível" : "produtos disponíveis"} para triagem`
            : "Nenhum produto elegível para triagem agora"}
        </strong>
        <p>
          {eligible
            ? "A IA avalia até 100 produtos da fila geral, de todas as lojas. Casos que exigem decisão humana ficam em Pendências."
            : "Os produtos retidos precisam de novas evidências ou revisão humana. Para ampliar o catálogo, capture novas ofertas."}
        </p>
      </div>
      <button type="button" disabled={pending || eligible === 0} onClick={run}>
        {pending ? "Avaliando…" : "Triar com IA"}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
