"use client";
import { useState, useTransition } from "react";
import { governanceAction, recoverArtifactAction } from "./actions.ts";
export default function GovernanceWorkspace({
  evidence,
}: {
  evidence: unknown;
}) {
  const [message, setMessage] = useState(""),
    [pending, start] = useTransition();
  return (
    <section>
      <h1>Revisão e aprovação de políticas</h1>
      <p>
        Amostra e métricas não ratificam políticas automaticamente. Aprovar
        exige responsabilidade editorial, método e evidências da conta.
        Calibração sintética permanece identificada e não ativa E3.
      </p>
      <form
        action={(f) =>
          start(async () => {
            const r = await governanceAction({
              kind: String(f.get("kind")) as Parameters<
                typeof governanceAction
              >[0]["kind"],
              version: String(f.get("version")),
              payload: String(f.get("payload")),
            });
            setMessage(r.ok ? JSON.stringify(r.result) : (r.error ?? "Falha"));
          })
        }
      >
        <label>
          Operação{" "}
          <select name="kind">
            <option value="rubric">Ratificar rubrica</option>
            <option value="calibration">Registrar EXP-02 revisado</option>
            <option value="price_draft">
              Criar política de preço em rascunho
            </option>
            <option value="price_approve">Aprovar política de preço</option>
          </select>
        </label>
        <label>
          Versão <input name="version" required />
        </label>
        <label>
          Evidências e método em JSON{" "}
          <textarea name="payload" rows={10} required />
        </label>
        <button disabled={pending}>Registrar decisão</button>
      </form>
      <form
        action={(f) =>
          start(async () => {
            const r = await recoverArtifactAction(String(f.get("artifact")));
            setMessage(
              r.ok
                ? "Objeto privado verificado e disponível."
                : (r.error ?? "Falha"),
            );
          })
        }
      >
        <h2>Recuperar upload interrompido</h2>
        <p>
          A recuperação confirma tamanho e integridade do objeto privado
          existente. Arquivo ausente ou divergente continua pendente.
        </p>
        <label>
          ID do arquivo <input name="artifact" required />
        </label>
        <button disabled={pending}>Verificar objeto existente</button>
      </form>
      <p role="status">{message}</p>
      <details>
        <summary>Formato dos registros</summary>
        <pre>
          {JSON.stringify(
            {
              rubric: {
                reviewIds: ["ID de cada revisão de produto distinto"],
                method: {
                  cohort: "Definição e janela da amostra",
                  minUnits: "Quantidade aprovada entre 30 e 50",
                  minAgreementRate: "Taxa explicitamente aprovada entre 0 e 1",
                  rationale: "Justificativa do responsável",
                },
              },
              calibration: {
                observationIds: ["IDs reais da conta"],
                sourceRef: "UUID de arquivo privado do relatório editorial",
                synthetic: true,
                results: {
                  experiment: "EXP-02",
                  reviewed: true,
                  cases: [
                    {
                      observationId: "ID da observação própria",
                      expectedState: "E0 | E1 | E2 | E3",
                    },
                  ],
                },
              },
              price_approve: {
                calibrationRunId: "UUID do EXP-02 aprovado, não sintético",
              },
            },
            null,
            2,
          )}
        </pre>
      </details>
      <h2>Evidências disponíveis nesta conta</h2>
      <pre style={{ whiteSpace: "pre-wrap" }}>
        {JSON.stringify(evidence, null, 2)}
      </pre>
    </section>
  );
}
