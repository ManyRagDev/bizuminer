"use client";

import { useAdminDraftState, useAdminDraftTransition } from "./draft-provider.tsx";
import type { ChangeEvent } from "react";
import {
  executeDispatchCycleAction,
  cancelDispatchJobAction,
  setDispatchControlAction,
  getDispatchDeskAction,
  scheduleDispatchAction,
  reconcileDispatchAction,
} from "./dispatch-actions.ts";

export default function DispatchPanel({ tenantId }: { tenantId: string }) {
  const [killSwitch, setKillSwitch] = useAdminDraftState<boolean>("dispatch-panel.killSwitch", true);
  const [lastResult, setLastResult] = useAdminDraftState<any>("dispatch-panel.lastResult", null);
  const [message, setMessage] = useAdminDraftState<string>("dispatch-panel.message", "");
  const [cancelJobId, setCancelJobId] = useAdminDraftState<string>("dispatch-panel.cancelJobId", "");
  const [cancelReason, setCancelReason] = useAdminDraftState<string>("dispatch-panel.cancelReason", "");
  const [pending, startTransition] = useAdminDraftTransition("dispatch-panel.pending");
  const [fields, setFields] = useAdminDraftState<Record<string, string>>("dispatch-panel.fields", { status: "failed" });
  const field = (name: string) => ({
    value: fields[name] ?? "", disabled: pending,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setFields(current => ({ ...current, [name]: value }));
    },
  });
  const clearFields = (names: string[]) => setFields(current => Object.fromEntries(
    Object.entries(current).filter(([name]) => !names.includes(name)),
  ));

  const handleRunCycle = () => {
    startTransition(async () => {
      setMessage("");
      const res = await executeDispatchCycleAction({
        tenantId,
        killSwitchActive: killSwitch,
      });
      if (res.ok) {
        setLastResult(res.result);
        if (res.result.preDispatchBlocked) {
          setMessage(
            `Disparo bloqueado por validação pré-I/O: ${res.result.error}`,
          );
        } else if (res.result.jobProcessed) {
          setMessage(
            `Job ${res.result.jobId} processado com status: ${res.result.status}`,
          );
        } else {
          setMessage("Nenhum job elegível na fila de disparo no momento.");
        }
      } else {
        setMessage(`Erro no ciclo do worker: ${res.error}`);
      }
    });
  };

  const handleCancelJob = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelJobId.trim()) return;
    startTransition(async () => {
      const res = await cancelDispatchJobAction({
        jobId: cancelJobId.trim(),
        reason: cancelReason.trim() || undefined,
        tenantId,
      });
      if (res.ok) {
        setMessage(`Job ${cancelJobId} cancelado com sucesso.`);
        setCancelJobId("");
        setCancelReason("");
      } else {
        setMessage(`Erro ao cancelar job: ${res.error}`);
      }
    });
  };

  return (
    <section
      className="admin-section"
      aria-labelledby="dispatch-worker-title"
      style={{
        marginTop: "1.5rem",
        borderTop: "1px solid #e0e0e0",
        paddingTop: "1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h2 id="dispatch-worker-title">
            Motor de Disparo Automatizado (Dispatch Worker)
          </h2>
          <p style={{ margin: 0, color: "#666" }}>
            Processamento com lease atômico, marcador persistido de I/O e
            validação estrita de fatos autorizados (CF-11 / CF-12 / G-SAFE).
          </p>
        </div>

        {/* Chave Kill Switch */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 0.75rem",
            background: killSwitch ? "#f8d7da" : "#d4edda",
            borderRadius: "4px",
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              cursor: "pointer",
              fontWeight: "bold",
              color: killSwitch ? "#721c24" : "#155724",
            }}
          >
            <input
              type="checkbox"
              disabled={pending}
              checked={killSwitch}
              onChange={(e) => {
                const value = e.target.checked;
                startTransition(async () => {
                  const r = await setDispatchControlAction({
                    tenantId,
                    killSwitch: value,
                  });
                  if (r.ok) {
                    setKillSwitch(value);
                    setMessage("Controle persistido para toda a conta.");
                  } else setMessage(r.error);
                });
              }}
            />
            {killSwitch
              ? "🚨 KILL SWITCH ATIVO (Disparos Bloqueados)"
              : "🟢 Kill Switch Desativado (Operação Normal)"}
          </label>
        </div>
      </div>

      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await getDispatchDeskAction(tenantId);
            if (r.ok) {
              setLastResult(r.data);
              setKillSwitch(r.data.controls[0]?.kill_switch ?? true);
            } else setMessage(r.error);
          })
        }
      >
        Atualizar agenda e controle
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          startTransition(async () => {
            const r = await setDispatchControlAction({
              tenantId,
              killSwitch: true,
              configuration: {
                maxPerWindow: Number(f.get("quota")),
                windowSeconds: Number(f.get("window")),
                cooldownSeconds: Number(f.get("cooldown")),
                windowAnchor: new Date(String(f.get("anchor"))).toISOString(),
              },
            });
            if (r.ok) clearFields(["quota", "window", "cooldown", "anchor"]);
            setMessage(
              r.ok
                ? "Política salva; novos envios continuam bloqueados."
                : r.error,
            );
          });
        }}
      >
        <h3>Política de envio aprovada</h3>
        <label>
          Limite por janela{" "}
          <input name="quota" {...field("quota")} type="number" min="1" required />
        </label>
        <label>
          Janela em segundos{" "}
          <input name="window" {...field("window")} type="number" min="1" required />
        </label>
        <label>
          Cooldown por público/canal em segundos{" "}
          <input name="cooldown" {...field("cooldown")} type="number" min="0" required />
        </label>
        <label>
          Âncora da janela{" "}
          <input name="anchor" {...field("anchor")} type="datetime-local" required />
        </label>
        <button disabled={pending}>Salvar política com bloqueio ativo</button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          startTransition(async () => {
            try {
              const r = await scheduleDispatchAction({
                tenantId,
                campaignPublicationId: String(f.get("publication")),
                kitRevisionId: String(f.get("revision")),
                destinationId: String(f.get("destination")),
                scheduledAt: new Date(String(f.get("when"))).toISOString(),
                idempotencyKey: crypto.randomUUID(),
              });
              if (r.ok) clearFields(["publication", "revision", "destination", "when"]);
              setMessage(r.ok ? "Agendamento registrado." : r.error);
            } catch (e) {
              setMessage(String(e));
            }
          });
        }}
      >
        <h3>Agendar revisão aprovada</h3>
        <label>
          Publicação <input name="publication" {...field("publication")} required />
        </label>
        <label>
          Revisão <input name="revision" {...field("revision")} required />
        </label>
        <label>
          Destino autorizado <input name="destination" {...field("destination")} required />
        </label>
        <label>
          Horário <input name="when" {...field("when")} type="datetime-local" required />
        </label>
        <button disabled={pending}>Agendar</button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          startTransition(async () => {
            const r = await reconcileDispatchAction({
              tenantId,
              jobId: String(f.get("job")),
              resolvedStatus: String(f.get("status")) as "succeeded" | "failed",
              note: String(f.get("note")),
              providerMessageId: String(f.get("proof")) || undefined,
              confirmedAt: f.get("confirmedAt")
                ? new Date(String(f.get("confirmedAt"))).toISOString()
                : undefined,
            });
            if (r.ok) clearFields(["job", "proof", "note", "confirmedAt"]);
            setMessage(r.ok ? "Reconciliação registrada." : r.error);
          });
        }}
      >
        <h3>Reconciliar envio incerto</h3>
        <input name="job" {...field("job")} aria-label="Job" required />
        <select name="status" {...field("status")}>
          <option value="failed">Não enviado, comprovado</option>
          <option value="succeeded">Enviado, comprovado</option>
        </select>
        <input name="proof" {...field("proof")} aria-label="Identificador do provedor" />
        <textarea
          name="note" {...field("note")}
          aria-label="Evidência da reconciliação"
          required
        />
        <label>
          Data observada da confirmação{" "}
          <input name="confirmedAt" {...field("confirmedAt")} type="datetime-local" />
        </label>
        <button disabled={pending}>Registrar reconciliação</button>
      </form>
      {message && (
        <p
          role="status"
          style={{
            margin: "0.75rem 0",
            padding: "0.5rem",
            background: "#f0f0f0",
            borderRadius: "4px",
            fontWeight: "bold",
          }}
        >
          {message}
        </p>
      )}

      <div
        style={{
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: "1rem",
        }}
      >
        <button type="button" onClick={handleRunCycle} disabled={pending}>
          {pending ? "Processando..." : "⚡ Executar Ciclo de Disparo Agora"}
        </button>

        {lastResult && (
          <span style={{ fontSize: "0.875rem", color: "#555" }}>
            Último ciclo: Job processado={String(lastResult.jobProcessed)},
            Bloqueado={String(Boolean(lastResult.preDispatchBlocked))}
          </span>
        )}
      </div>

      {/* Cancelamento manual de Job preso/indesejado */}
      <form
        onSubmit={handleCancelJob}
        style={{
          marginTop: "1rem",
          display: "flex",
          gap: "0.5rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <label>
          Cancelar Job ID:{" "}
          <input
            type="text"
            placeholder="UUID do job de disparo"
            value={cancelJobId}
            onChange={(e) => setCancelJobId(e.target.value)}
          />
        </label>
        <label>
          Motivo:{" "}
          <input
            type="text"
            placeholder="Razão do cancelamento"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
        </label>
        <button type="submit" disabled={pending || !cancelJobId.trim()}>
          Cancelar Job
        </button>
      </form>
    </section>
  );
}
