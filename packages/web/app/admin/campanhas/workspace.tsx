"use client";
import { selectAccountAction } from "../account-actions.ts";
import { useState, useTransition } from "react";
import { commercialIssueMessage } from "../../../lib/commercial-messages";
import { useRouter } from "next/navigation";
import type { UserAccountMembership } from "../../../lib/account-context";
import type { KitSnapshot, KitMaterial } from "../../../lib/commerce-contract";
import {
  generateKitArtifactAction,
  createCampaignAction,
  createCommercialKitDraftAction,
  validateCommercialKitRevisionAction,
  approveCommercialKitAction,
  revalidateKitBeforeExportAction,
  markPublicationExportedAction,
  confirmPublicationAction,
  reviseCommercialKitAction,
} from "../marketing/kit-actions";

type Publication = {
  id: string;
  status: string;
  version: number;
  channel: string;
  kit_id: string;
  kit_version: number;
  kit_status: string;
  snapshot: KitSnapshot;
  materials: KitMaterial[];
  code: string;
};
type Desk = {
  campaigns: {
    id: string;
    name: string;
    objective: string;
    status: string;
    version: number;
  }[];
  products: { id: string; title: string }[];
  publications: Publication[];
};
const labels: Record<string, string> = {
  draft: "Rascunho",
  validating: "Validado, aguarda aprovação",
  needs_revision: "Precisa de revisão",
  approved: "Aprovado",
  invalidated: "Invalidado",
  planned: "Planejada",
  ready: "Pronta",
  exported: "Exportada",
  published_confirmed: "Publicação confirmada",
  cancelled: "Cancelada",
  expired: "Vencida",
};
export default function CampaignDesk({
  accounts,
  tenantId,
  owner,
  desk,
  initialProductId,
  initialOpportunityId,
  initialChannel,
  initialAudienceKey,
}: {
  accounts: UserAccountMembership[];
  tenantId: string;
  owner: boolean;
  desk: Desk;
  initialProductId?: string;
  initialOpportunityId?: string;
  initialChannel?: string;
  initialAudienceKey?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [renders, setRenders] = useState<Record<string, string>>({});
  async function perform(
    work: () => Promise<{ ok: boolean; error?: string; data?: unknown }>,
  ) {
    try {
      const result = await work();
      setMessage(
        result.ok
          ? "Operação registrada."
          : (result.error ?? "Operação não concluída."),
      );
      router.refresh();
    } catch {
      setMessage(
        "Não foi possível concluir a operação. Atualize a página e tente novamente.",
      );
    }
  }
  function formValue(data: FormData, name: string) {
    return String(data.get(name) ?? "").trim();
  }
  async function copy(pub: Publication) {
    const prepared = await revalidateKitBeforeExportAction({
      tenantId,
      publicationId: pub.id,
      expectedVersion: pub.version,
    });
    if (!prepared.ok) {
      setMessage(prepared.error);
      return;
    }
    try {
      await navigator.clipboard.writeText(
        prepared.data.text.replaceAll(
          `/p/${prepared.data.code}`,
          `${window.location.origin}/p/${prepared.data.code}`,
        ),
      );
    } catch {
      setMessage("Não foi possível copiar. Nenhuma exportação foi registrada.");
      return;
    }
    const saved = await markPublicationExportedAction({
      tenantId,
      publicationId: pub.id,
      expectedVersion: pub.version,
      requestId: crypto.randomUUID(),
    });
    setMessage(
      !saved.ok
        ? saved.error
        : saved.data.exported
          ? "Material copiado. Confirme a publicação depois de postar."
          : "Os fatos mudaram. Revise o material copiado antes de publicar.",
    );
    router.refresh();
  }
  return (
    <section className="admin-panel">
      <h1>Campanhas</h1>
      <p>Prepare, revise e acompanhe a divulgação da sua conta.</p>
      <div
        style={{
          display: "flex",
          gap: "1rem",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        <label>
          Conta{" "}
          <select
            value={tenantId}
            onChange={async (e) => {
              const target = e.target.value;
              if ((await selectAccountAction(target)).ok) {
                router.push(
                  `/admin/campanhas?conta=${encodeURIComponent(target)}`,
                );
                router.refresh();
              }
            }}
          >
            {accounts.map((a) => (
              <option key={a.affiliateId} value={a.tenantId}>
                {a.displayName}
              </option>
            ))}
          </select>
        </label>
        <a
          href="/admin/curadoria?aba=radar"
          style={{
            fontSize: "0.875rem",
            textDecoration: "none",
            color: "#0070f3",
          }}
        >
          📡 Radar de oportunidades →
        </a>
        <a
          href={`/admin/financeiro?conta=${encodeURIComponent(tenantId)}`}
          style={{
            fontSize: "0.875rem",
            textDecoration: "none",
            color: "#0070f3",
          }}
        >
          💰 Resultados e comissões →
        </a>
      </div>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {owner && (
        <form
          action={(data) =>
            start(() =>
              perform(() =>
                createCampaignAction({
                  tenantId,
                  name: formValue(data, "name"),
                  objective: formValue(data, "objective"),
                  audience: formValue(data, "audience"),
                  requestId: crypto.randomUUID(),
                }),
              ),
            )
          }
        >
          <h2>Nova campanha</h2>
          <label>
            Nome <input name="name" required maxLength={200} />
          </label>
          <label>
            Objetivo <input name="objective" required />
          </label>
          <label>
            Público <input name="audience" required />
          </label>
          <button disabled={pending}>Criar campanha</button>
        </form>
      )}
      {desk.campaigns.length > 0 && (
        <form
          action={(data) =>
            start(() =>
              perform(() =>
                createCommercialKitDraftAction({
                  tenantId,
                  campaignId: formValue(data, "campaign"),
                  productId: formValue(data, "product"),
                  channel: formValue(data, "channel"),
                  reason: formValue(data, "reason"),
                  opportunityId: formValue(data, "opportunityId") || initialOpportunityId || undefined,
                  requestId: crypto.randomUUID(),
                }),
              ),
            )
          }
        >
          <h2>Preparar material</h2>
          {initialOpportunityId && (
            <input type="hidden" name="opportunityId" value={initialOpportunityId} />
          )}
          <label>
            Campanha{" "}
            <select name="campaign">
              {desk.campaigns
                .filter((c) => c.status !== "archived")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Oferta{" "}
            <select
              name="product"
              required
              defaultValue={initialProductId ?? ""}
            >
              {desk.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Canal{" "}
            <select name="channel" defaultValue={initialChannel ?? "whatsapp_channel"}>
              <option value="whatsapp_channel">
                WhatsApp, publicação manual
              </option>
              <option value="telegram_channel">
                Telegram, publicação manual
              </option>
              <option value="instagram_stories">
                Instagram Stories, publicação manual
              </option>
            </select>
          </label>
          <label>
            Por que recomendar ao público?{" "}
            <textarea name="reason" required maxLength={4000} />
          </label>
          <button disabled={pending || !desk.products.length}>
            Criar rascunho
          </button>
        </form>
      )}
      <h2>Materiais e divulgação</h2>
      {!desk.publications.length && <p>Ainda não há materiais preparados.</p>}
      {desk.publications.map((pub) => (
        <article key={pub.id} className="admin-card">
          <h3>{pub.snapshot.title}</h3>
          <p>
            {pub.channel} · {labels[pub.kit_status] ?? pub.kit_status} ·{" "}
            {labels[pub.status] ?? pub.status}
          </p>
          <div>
            <button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await generateKitArtifactAction({
                    tenantId,
                    kitId: pub.kit_id,
                    expectedVersion: pub.kit_version,
                  });
                  if (r.ok) {
                    setRenders((v) => ({ ...v, [pub.id]: r.data.id }));
                    setMessage("Prévia privada gerada para esta revisão.");
                  } else setMessage(r.error);
                })
              }
            >
              Gerar prévia Story
            </button>
            {renders[pub.id] && (
              <>
                <img
                  src={`/api/admin/artifacts/${renders[pub.id]}?conta=${encodeURIComponent(tenantId)}&preview=1`}
                  alt={`Prévia privada de ${pub.snapshot.title}`}
                  width="270"
                  height="480"
                />
                <button
                  disabled={pending || pub.kit_status !== "approved"}
                  onClick={() =>
                    start(async () => {
                      try {
                        const response = await fetch(
                          `/api/admin/artifacts/${renders[pub.id]}?conta=${encodeURIComponent(tenantId)}`,
                        );
                        if (!response.ok)
                          throw new Error(
                            "A revisão mudou ou não está aprovada.",
                          );
                        const url = URL.createObjectURL(await response.blob()),
                          link = document.createElement("a");
                        link.href = url;
                        link.download = "bizu-story.png";
                        link.click();
                        URL.revokeObjectURL(url);
                        const r = await markPublicationExportedAction({
                          tenantId,
                          publicationId: pub.id,
                          expectedVersion: pub.version,
                          requestId: crypto.randomUUID(),
                        });
                        setMessage(
                          r.ok
                            ? "Download solicitado. Confirme a publicação somente após postar."
                            : r.error,
                        );
                        router.refresh();
                      } catch (e) {
                        setMessage(String(e));
                      }
                    })
                  }
                >
                  Baixar arte aprovada
                </button>
              </>
            )}
          </div>
          <form
            action={(f) =>
              start(async () => {
                try {
                  const file = f.get("asset");
                  if (!(file instanceof File)) return;
                  const upload = new FormData();
                  upload.set("file", file);
                  upload.set("tenantId", tenantId);
                  upload.set("kind", "kit_asset");
                  upload.set("rightsStatus", String(f.get("rights")));
                  upload.set("rightsSource", String(f.get("source")));
                  upload.set("channels", pub.channel);
                  const response = await fetch("/api/admin/artifacts/upload", {
                      method: "POST",
                      body: upload,
                    }),
                    artifact = await response.json();
                  if (!response.ok) throw new Error(artifact.error);
                  const r = await reviseCommercialKitAction({
                    tenantId,
                    kitId: pub.kit_id,
                    expectedVersion: pub.kit_version,
                    copy: pub.materials[0]?.shortCopy ?? "",
                    assetId: artifact.id,
                    requestId: crypto.randomUUID(),
                  });
                  setMessage(
                    r.ok
                      ? "Imagem vinculada em nova revisão. Valide e aprove novamente."
                      : r.error,
                  );
                  router.refresh();
                } catch (e) {
                  setMessage(String(e));
                }
              })
            }
          >
            <label>
              Imagem própria ou licenciada{" "}
              <input
                name="asset"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
              />
            </label>
            <label>
              Direito de uso{" "}
              <select name="rights">
                <option value="owned">Material próprio</option>
                <option value="licensed">Licença documentada</option>
              </select>
            </label>
            <label>
              Proveniência e autorização para este canal{" "}
              <input name="source" required />
            </label>
            <button disabled={pending || !owner}>
              Vincular em nova revisão
            </button>
          </form>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {pub.materials[0]?.shortCopy}
          </pre>
          <a href={`/p/${pub.code}`} target="_blank" rel="noreferrer">
            Ver oferta
          </a>
          {!["published_confirmed", "cancelled"].includes(pub.status) && (
            <>
              <form
                action={(data) =>
                  start(() =>
                    perform(() =>
                      reviseCommercialKitAction({
                        tenantId,
                        kitId: pub.kit_id,
                        expectedVersion: pub.kit_version,
                        copy: formValue(data, "copy"),
                        requestId: crypto.randomUUID(),
                      }),
                    ),
                  )
                }
              >
                <label>
                  Editar texto{" "}
                  <textarea
                    name="copy"
                    required
                    defaultValue={pub.materials[0]?.shortCopy}
                  />
                </label>
                <button disabled={pending}>Salvar nova revisão</button>
              </form>
              <button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await validateCommercialKitRevisionAction({
                      tenantId,
                      kitId: pub.kit_id,
                      expectedVersion: pub.kit_version,
                      requestId: crypto.randomUUID(),
                    });
                    setMessage(
                      !r.ok
                        ? r.error
                        : r.data.valid
                          ? "Validação concluída. Aguarda aprovação humana."
                          : `Revisão necessária: ${r.data.blockers.map(commercialIssueMessage).join(" ")}`,
                    );
                    router.refresh();
                  })
                }
              >
                Validar
              </button>
              <button
                disabled={pending || pub.kit_status !== "validating"}
                onClick={() =>
                  start(() =>
                    perform(() =>
                      approveCommercialKitAction({
                        tenantId,
                        kitId: pub.kit_id,
                        expectedVersion: pub.kit_version,
                        requestId: crypto.randomUUID(),
                      }),
                    ),
                  )
                }
              >
                Aprovar esta revisão
              </button>
            </>
          )}
          {["ready", "exported"].includes(pub.status) && (
            <>
              <button disabled={pending} onClick={() => start(() => copy(pub))}>
                Copiar material
              </button>
              <button
                disabled={pending}
                onClick={() =>
                  start(() =>
                    perform(() =>
                      confirmPublicationAction({
                        tenantId,
                        publicationId: pub.id,
                        expectedVersion: pub.version,
                        requestId: crypto.randomUUID(),
                      }),
                    ),
                  )
                }
              >
                Confirmar que publiquei
              </button>
            </>
          )}
          {pub.status === "exported" && <p>Exportar não confirma postagem.</p>}
          {pub.status === "published_confirmed" && (
            <p>Postagem confirmada manualmente pelo operador.</p>
          )}
        </article>
      ))}
    </section>
  );
}
