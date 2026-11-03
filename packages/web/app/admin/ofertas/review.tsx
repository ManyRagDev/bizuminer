"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  EDITORIAL_DIMENSIONS,
  type EditorialCandidate,
  type EditorialDimensions,
} from "../../../lib/editorial-selection.ts";
import {
  saveEditorialAssessmentAction,
  submitCurationDecision,
} from "../curadoria/actions.ts";
import { workspaceError } from "../../../lib/affiliate-workspace-contract.ts";
export default function OfferReview({
  candidate: c,
}: {
  candidate: EditorialCandidate;
}) {
  const [message, setMessage] = useState(""),
    [busy, start] = useTransition(),
    router = useRouter(),
    a = c.assessment;
  if (c.curationStatus === "pending")
    return (
      <section>
        <p>
          Esta oferta entrou agora e ainda não passou pela revisão inicial.
          Confira se o anúncio é adequado, útil e seguro para seu público.
        </p>
        <button
          className="bm-button secondary"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await submitCurationDecision({
                productId: c.id,
                decision: "approve",
              });
              setMessage(
                r.ok
                  ? "Oferta admitida para avaliação. Agora confira a opção e o mérito da indicação."
                  : "Não foi possível registrar a revisão.",
              );
              if (r.ok) router.refresh();
            })
          }
        >
          Conferi o anúncio e aprovo para avaliação
        </button>
        {message && <p role="status">{message}</p>}
      </section>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        start(async () => {
          const dimensions = Object.fromEntries(
            EDITORIAL_DIMENSIONS.map((v) => [
              v.id,
              {
                level: String(d.get(v.id)),
                reason: String(d.get(v.id + "Reason")),
              },
            ]),
          ) as EditorialDimensions;
          const result = await saveEditorialAssessmentAction({
            expectedTenantId: c.tenantId,
            productId: c.id,
            evidenceFingerprint: c.evidenceFingerprint,
            expectedAssessmentId: a?.id ?? null,
            dimensions,
            audience: String(d.get("audience")),
            benefit: String(d.get("benefit")),
            purchaseContents: String(d.get("contents")),
            publicRationale: String(d.get("rationale")),
            criticalDoubts: String(d.get("doubts"))
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
            maxPriceCents: Math.round(Number(d.get("maxPrice")) * 100),
            comparativeBasis: a?.comparativeBasis ?? null,
          });
          setMessage(
            result.ok
              ? "Avaliação salva. Os canais foram reavaliados."
              : workspaceError(new Error(result.error)),
          );
          if (result.ok) router.refresh();
        });
      }}
    >
      <fieldset disabled={busy}>
        <div className="bm-grid">
          <label>
            Para quem é útil?
            <textarea
              name="audience"
              required
              minLength={3}
              maxLength={1000}
              defaultValue={a?.audience}
            />
          </label>
          <label>
            Qual problema resolve?
            <textarea
              name="benefit"
              required
              minLength={3}
              maxLength={1000}
              defaultValue={a?.benefit}
            />
          </label>
        </div>
        <label>
          O que a pessoa recebe nesta compra?
          <textarea
            name="contents"
            required
            minLength={3}
            maxLength={1000}
            defaultValue={a?.purchaseContents ?? c.purchaseContents}
          />
        </label>
        <label>
          Por que você recomenda esta oferta?
          <textarea
            name="rationale"
            required
            minLength={3}
            maxLength={2000}
            defaultValue={a?.publicRationale}
          />
        </label>
        <p>
          A indicação direta precisa de evidência forte nos cinco critérios.
          Marque o que você consegue sustentar.
        </p>
        <div className="bm-grid">
          {EDITORIAL_DIMENSIONS.map((v) => (
            <div key={v.id}>
              <label>
                {v.label}
                <select
                  name={v.id}
                  defaultValue={a?.dimensions[v.id].level ?? "unknown"}
                >
                  <option value="unknown">Ainda não sei</option>
                  <option value="weak">Evidência fraca</option>
                  <option value="adequate">Atende ao básico</option>
                  <option value="strong">Bem sustentado</option>
                  <option value="exceptional">Destaque excepcional</option>
                </select>
              </label>
              <label>
                {v.prompt}
                <textarea
                  name={v.id + "Reason"}
                  required
                  minLength={3}
                  maxLength={1000}
                  defaultValue={a?.dimensions[v.id].reason}
                />
              </label>
            </div>
          ))}
        </div>
        <label>
          Até qual preço esta indicação faz sentido? (R$)
          <input
            type="number"
            step="0.01"
            min="0.01"
            required
            name="maxPrice"
            defaultValue={((a?.maxPriceCents ?? c.priceCents) / 100).toFixed(2)}
          />
        </label>
        <label>
          O que ainda precisa ser esclarecido? Uma dúvida por linha
          <textarea
            name="doubts"
            maxLength={4000}
            defaultValue={a?.criticalDoubts.join("\n")}
          />
        </label>
        <button className="bm-button secondary" type="submit">
          {busy ? "Salvando…" : "Salvar avaliação"}
        </button>
      </fieldset>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
