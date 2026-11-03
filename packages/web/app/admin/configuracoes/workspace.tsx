"use client";
import { useState } from "react";
import { useAdminFetch } from "../draft-provider.tsx";
import { configureChannelAction } from "../curadoria/recommendation-actions.ts";
import { defaultChannelPolicy } from "../../../lib/recommendation-policy.ts";
import { workspaceError } from "../../../lib/affiliate-workspace-contract.ts";
export default function Settings({
  tenantId,
  owner,
  initial,
}: {
  tenantId: string;
  owner: boolean;
  initial: {
    ready: boolean;
    audience: string;
    version: number;
    channels: any[];
  };
}) {
  const fetch = useAdminFetch(),
    [audience, setAudience] = useState(initial.audience),
    [version, setVersion] = useState(initial.version),
    [channels, setChannels] = useState(initial.channels),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <>
      <section className="bm-card bm-help">
        <h2>Para quem você indica?</h2>
        <p>
          Explique necessidades, interesses e limites de preço. Cada material
          guarda a versão usada na preparação.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await fetch("/api/admin/workspace", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "audience",
                    audience,
                    expectedVersion: version,
                  }),
                }),
                v = await r.json();
              if (!r.ok) throw new Error(v.error);
              setVersion((v) => v + 1);
              setNotice("Público salvo. Novos materiais usarão esta versão.");
            } catch (e) {
              setNotice(
                e instanceof Error ? e.message : "Não foi possível salvar.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={!owner || !initial.ready || busy}>
            <label>
              Meu público
              <textarea
                required
                minLength={5}
                maxLength={1000}
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Ex.: pessoas que querem organizar a casa com soluções práticas e acessíveis."
              />
            </label>
            <button className="bm-button secondary" type="submit">
              Salvar público
            </button>
          </fieldset>
        </form>
      </section>
      <section className="bm-card bm-help">
        <h2>Onde você quer divulgar?</h2>
        <p>
          A seleção respeita a clareza da compra, a força da indicação e o
          intervalo entre publicações.
        </p>
        {(["whatsapp", "stories"] as const).map((channel) => {
          const c = channels.find((c) => c.channel === channel),
            policy = c?.policy ?? defaultChannelPolicy(channel);
          return (
            <div className="bm-channel" key={channel}>
              <h3>{channel === "whatsapp" ? "WhatsApp" : "Stories"}</h3>
              <p className="bm-muted">
                {c?.enabled ? "Ativo" : "Ainda não ativado"} · Intervalo entre
                repetições: {policy.repeatHours} horas.
              </p>
              <button
                className="bm-button secondary"
                disabled={!owner || !initial.ready || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await configureChannelAction({
                      expectedTenantId: tenantId,
                      channel,
                      expectedVersion: c?.version ?? null,
                      enabled: !c?.enabled,
                      policy,
                      manualOrder: c?.manual_order ?? null,
                      validUntil: null,
                    });
                    if (!r.ok) throw new Error(r.error);
                    setChannels((all) => [
                      ...all.filter((v) => v.channel !== channel),
                      {
                        ...c,
                        channel,
                        enabled: !c?.enabled,
                        policy,
                        version: (c?.version ?? 0) + 1,
                      },
                    ]);
                    setNotice("Canal atualizado.");
                  } catch (e) {
                    setNotice(workspaceError(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {c?.enabled ? "Desativar canal" : "Ativar canal"}
              </button>
            </div>
          );
        })}
        <p className="bm-muted">
          Só o responsável da conta pode alterar estas escolhas.
        </p>
      </section>
      {notice && (
        <p role="status" className="bm-notice">
          {notice}
        </p>
      )}
      {!initial.ready && (
        <p className="bm-notice">
          As configurações do novo painel aguardam habilitação no ambiente.
        </p>
      )}
    </>
  );
}
