"use client";

import { useState, useTransition } from "react";
import { approveTodaySuggestedAction } from "./curadoria/actions";

export default function EmergencyApproval({
  count,
  examples,
}: {
  count: number;
  examples: string[];
}) {
  const [available, setAvailable] = useState(count);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  if (available === 0) return null;

  function approve() {
    const confirmed = window.confirm(
      `Aprovar ${available} candidato(s) nota 3 da triagem de hoje? Bloqueados, rejeitados e itens em espera não serão alterados.`,
    );
    if (!confirmed) return;
    setMessage("");
    startTransition(async () => {
      const result = await approveTodaySuggestedAction();
      if (!result.ok) {
        setMessage("Não foi possível aprovar a seleção sugerida.");
        return;
      }
      setAvailable(0);
      setMessage(`${result.approved} candidato(s) de hoje foram publicados por decisão excepcional.`);
    });
  }

  return (
    <div className="emergency-approval">
      <div>
        <strong>Sem tempo para revisar os candidatos restantes?</strong>
        <p>
          Há {available} candidato(s) nota 3 de hoje. Esta ação não inclui bloqueios de segurança nem muda o corte permanente.
          {examples.length > 0 ? ` Exemplos: ${examples.join("; ")}.` : ""}
        </p>
      </div>
      <button type="button" disabled={isPending} onClick={approve}>
        {isPending ? "Aprovando…" : `Aprovar candidatos restantes de hoje (${available})`}
      </button>
      {message && <span role="status">{message}</span>}
    </div>
  );
}
