"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runAutomatedTriageAction } from "./actions.ts";
import { automatedTriageFailureMessage } from "../../../lib/triage-feedback.ts";

export default function TriageControl({ eligible }: { eligible: number }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  function run() {
    startTransition(async () => {
      try {
        const result = await runAutomatedTriageAction(100);
        setMessage(
          result.ok
            ? `Análise concluída: ${result.processed} produtos processados; ${result.approved} aprovados, ${result.held} retidos, ${result.rejected} rejeitados e ${result.annotatedPending} para revisão.`
            : automatedTriageFailureMessage(result.error),
        );
        router.refresh();
      } catch { setMessage("Não foi possível confirmar o resultado da análise. Confira o histórico antes de tentar novamente."); }
    });
  }
  if (eligible === 0 && !pending && !message) return null;
  return (
    <div className="curation-triage-control">
      <div>
        <strong>
          {eligible
            ? `${eligible === 100 ? "Pelo menos " : ""}${eligible} ${eligible === 1 ? "novo produto capturado aguardando triagem" : "novos produtos capturados aguardando triagem"}`
            : "Nenhum produto disponível para análise automática agora"}
        </strong>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--ink-muted, #71717a)" }}>
          {eligible
            ? "A análise usa os critérios da sua conta e pode deixar produtos para revisão. Aproveitar um produto na pauta depende também do preço e do link de afiliado."
            : "Verifique as pendências e a situação das capturas. Produtos ainda em processamento não aparecem nesta contagem."}
        </p>
      </div>
      {eligible > 0 && <button type="button" disabled={pending} onClick={run}>
        {pending ? "Analisando com IA…" : "Analisar capturas com IA"}
      </button>}
      {message && <div role="status"><p>{message}</p><a href="/admin/curadoria?aba=excecoes">Revisar pendências →</a>{" · "}<a href="/admin/curadoria?aba=pipeline">Ver histórico da análise</a></div>}
    </div>
  );
}
