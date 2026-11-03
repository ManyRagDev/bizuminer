"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import AdminLink from "../../_components/admin-link.tsx";
import {
  useAdminFetch,
  useAdminDraftState,
  useAdminAccount,
} from "../draft-provider.tsx";
import type {
  WorkDraft,
  WorkspaceOffer,
  DraftInput,
} from "../../../lib/affiliate-workspace-contract.ts";
import { offerPriceLabel } from "../../../lib/offer-price.ts";
import { kitMessage } from "../../../lib/kit-message.ts";
const payload = (d: WorkDraft): DraftInput => ({
  id: d.id,
  expectedVersion: d.version,
  kind: d.kind,
  channel: d.channel,
  title: d.title,
  productId: d.productId,
  optionKey: d.optionKey,
  sourceUrl: d.sourceUrl,
  content: d.content,
  legacyRef: d.legacyRef,
});
const signature = (d: WorkDraft) =>
  JSON.stringify({ ...payload(d), expectedVersion: 0 });
export default function DraftEditor({
  initial,
  offer,
  publication,
  ready,
  owner,
  own,
  bindingChannel,
}: {
  initial: WorkDraft;
  offer: WorkspaceOffer | null;
  publication?: any;
  ready: boolean;
  owner: boolean;
  own: boolean;
  bindingChannel?: "whatsapp" | "stories";
}) {
  const fetch = useAdminFetch(),
    router = useRouter();
  const account = useAdminAccount();
  const [draft, setDraft] = useAdminDraftState<WorkDraft>(
      `work:${initial.id}`,
      initial,
    ),
    [status, setStatus] = useState(
      initial.version ? "Salvo na sua conta" : "Ainda não salvo",
    ),
    [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState<WorkDraft | null>(null),
    [notice, setNotice] = useState(""),
    [output, setOutput] = useState(""),
    [artifact, setArtifact] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const latest = useRef(draft),
    version = useRef(draft.version),
    saved = useRef(initial.version ? signature(initial) : ""),
    saving = useRef(false),
    mounted = useRef(true);
  latest.current = draft;
  const editing = own && draft.state === "editing",
    dirty = signature(draft) !== saved.current;
  const save = useCallback(async () => {
    if (!ready || !own || latest.current.state !== "editing" || saving.current)
      return false;
    const creating = version.current === 0;
    const current = latest.current,
      sig = signature(current);
    if (sig === saved.current) return true;
    saving.current = true;
    if (mounted.current) setStatus("Salvando…");
    try {
      const body = JSON.stringify({
        ...payload(current),
        expectedVersion: version.current,
      });
      const r = await fetch("/api/admin/work-drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: new TextEncoder().encode(body).byteLength <= 60000,
          signal: AbortSignal.timeout(15000),
        }),
        v = await r.json();
      if (!r.ok) {
        if (r.status === 409) {
          const fresh = await fetch("/api/admin/work-drafts?id=" + current.id),
            f = await fresh.json();
          if (f.draft && mounted.current) setConflict(f.draft);
        }
        throw new Error(v.error);
      }
      version.current = v.draft.version;
      saved.current = sig;
      setDraft((local) =>
        local.version > v.draft.version
          ? local
          : {
              ...local,
              version: v.draft.version,
              updatedAt: v.draft.updatedAt,
            },
      );
      if (
        creating &&
        mounted.current &&
        window.location.pathname === "/admin/divulgacoes/nova"
      )
        window.history.replaceState(
          null,
          "",
          "/admin/divulgacoes/" + current.id,
        );
      if (mounted.current)
        setStatus(
          signature(latest.current) === sig
            ? "Salvo na sua conta"
            : "Há alterações para salvar",
        );
      return true;
    } catch (e) {
      if (mounted.current) {
        setStatus("Alterações ainda não salvas");
        setNotice(e instanceof Error ? e.message : "Não foi possível salvar.");
      }
      return false;
    } finally {
      saving.current = false;
    }
  }, [fetch, ready, own, setDraft]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const cached = latest.current;
    if (initial.version > cached.version) {
      if (signature(cached) !== signature(initial)) {
        setConflict(initial);
        setNotice(
          "Há uma versão mais recente salva em outra sessão. Compare antes de continuar.",
        );
      } else {
        version.current = initial.version;
        saved.current = signature(initial);
        setDraft(initial);
      }
    }
  }, [initial, setDraft]);
  useEffect(() => {
    if (!saving.current && draft.version > version.current)
      version.current = draft.version;
  }, [draft.version]);
  useEffect(() => {
    if (!editing || !dirty || conflict) return;
    setStatus("Há alterações para salvar");
    // Accepted edits finish saving after leaving a pane. Debounce replacement
    // cancels the old timer; a real unmount retains the last queued write.
    let timer: ReturnType<typeof setTimeout>;
    const write = () => {
      if (saving.current) {
        timer = setTimeout(write, 200);
        return;
      }
      void save();
    };
    timer = setTimeout(write, 800);
    return () => {
      queueMicrotask(() => {
        if (mounted.current) clearTimeout(timer);
      });
    };
  }, [draft, editing, dirty, conflict, save]);
  useEffect(() => {
    const leaving = (e: BeforeUnloadEvent) => {
      if (signature(latest.current) !== saved.current) {
        e.preventDefault();
      }
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") void save();
    };
    window.addEventListener("beforeunload", leaving);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("beforeunload", leaving);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [save]);
  async function action(action: string, extra: Record<string, unknown> = {}) {
    if (saving.current) {
      setNotice("Aguarde o salvamento antes de continuar.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      if (editing && !(await save())) return;
      const r = await fetch("/api/admin/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            id: draft.id,
            expectedVersion: version.current,
            ...extra,
            ...(action === "export" && extra.confirmCopy
              ? { confirmCopy: false }
              : {}),
          }),
        }),
        v = await r.json();
      if (!r.ok) throw new Error(v.error);
      if (v.draft) {
        setDraft(v.draft);
        version.current = v.draft.version;
        saved.current = signature(v.draft);
        if (window.location.pathname === "/admin/divulgacoes/" + draft.id)
          router.refresh();
        else router.replace("/admin/divulgacoes/" + draft.id);
      }
      if (v.text) {
        const text = String(v.text).replace(
          /\/p\/([A-Za-z0-9]{12})/g,
          (_match: string, code: string) =>
            new URL("/p/" + code, window.location.origin).toString(),
        );
        setOutput(text);
        if (extra.confirmCopy) {
          try {
            await navigator.clipboard.writeText(text);
          } catch {
            throw new Error(
              "Não foi possível copiar automaticamente. O texto completo está na prévia para você copiar manualmente.",
            );
          }
          const acknowledgement = await fetch("/api/admin/workspace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "export",
              id: draft.id,
              expectedVersion: version.current,
              confirmCopy: true,
            }),
          });
          if (!acknowledgement.ok) {
            const result = await acknowledgement.json();
            throw new Error(result.error);
          }
          setNotice(
            "Mensagem copiada. Publique no seu canal e depois confirme a publicação.",
          );
        }
      }
      if (v.artifact) setArtifact(v.artifact.artifactId ?? v.artifact.id);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }
  const p = offer?.candidate,
    refChanged =
      offer &&
      (draft.optionKey !== offer.reference.optionKey ||
        draft.content.observationId !== offer.reference.observationId ||
        draft.content.evidenceFingerprint !==
          offer.reference.evidenceFingerprint);
  const blockers =
    offer?.blockers[draft.channel === "whatsapp" ? "whatsapp" : "stories"] ??
    [];
  const preparedText =
    publication?.snapshot && publication.materials?.[0]
      ? kitMessage(
          publication.snapshot,
          publication.materials[0],
          publication.code,
        )
      : null;
  const attaching = editing && offer && !draft.productId;
  async function reuse() {
    setBusy(true);
    setNotice("");
    try {
      const next = {
        ...payload(draft),
        id: crypto.randomUUID(),
        expectedVersion: 0,
        legacyRef: undefined,
        ...(offer
          ? {
              optionKey: offer.reference.optionKey,
              content: {
                ...draft.content,
                observationId: offer.reference.observationId,
                evidenceFingerprint: offer.reference.evidenceFingerprint,
              },
            }
          : {}),
      };
      const r = await fetch("/api/admin/work-drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        }),
        v = await r.json();
      if (!r.ok) throw new Error(v.error);
      router.push("/admin/divulgacoes/" + v.draft.id);
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Não foi possível criar a revisão.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="bm-workspace">
      <AdminLink href="/admin/divulgacoes">← Divulgações</AdminLink>
      <header className="bm-page-heading bm-heading-row">
        <div>
          <p className="bm-eyebrow">
            {draft.state === "editing"
              ? "Rascunho pessoal"
              : draft.state === "review"
                ? "Em revisão"
                : draft.state === "published"
                  ? "Publicação confirmada"
                  : "Pronto para publicar"}
          </p>
          <h1>{draft.title || "Minha divulgação"}</h1>
          <p role="status">
            {ready
              ? status
              : "O salvamento aguarda a habilitação desta capacidade."}
          </p>
        </div>
        {editing && (
          <button
            className="bm-button secondary"
            disabled={busy || !ready || !dirty}
            onClick={() => void save()}
          >
            Salvar agora
          </button>
        )}
      </header>
      {conflict && (
        <section className="bm-card bm-conflict" role="alert">
          <h2>Existe outra versão salva.</h2>
          <p>
            Seu texto está preservado no editor. Compare antes de escolher como
            continuar.
          </p>
          <pre className="bm-preview">{conflict.content.text}</pre>
          <div className="bm-actions">
            <button
              className="bm-button secondary"
              onClick={() => {
                setDraft(conflict);
                version.current = conflict.version;
                saved.current = signature(conflict);
                setConflict(null);
                setNotice("");
              }}
            >
              Usar a versão salva
            </button>
            <button
              className="bm-button"
              onClick={() => {
                version.current = conflict.version;
                setDraft((d) => ({ ...d, version: conflict.version }));
                saved.current = signature(conflict);
                setConflict(null);
                setNotice("Sua versão será salva como uma nova revisão.");
              }}
            >
              Manter meu texto como nova revisão
            </button>
          </div>
        </section>
      )}
      {notice && (
        <p role="status" className="bm-notice">
          {notice}
        </p>
      )}
      {draft.state !== "editing" && (
        <div className="bm-actions">
          <button
            className="bm-button secondary"
            disabled={busy}
            onClick={() => void reuse()}
          >
            Criar nova revisão a partir deste texto
          </button>
          <p className="bm-muted">
            A revisão anterior e seu histórico ficam preservados.
          </p>
        </div>
      )}
      <div className="bm-split">
        <section className="bm-card">
          <h2>{editing ? "Prepare com a sua voz" : "Material preparado"}</h2>
          <fieldset disabled={!editing || busy}>
            <label>
              Nome desta divulgação
              <input
                value={draft.title}
                maxLength={250}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, title: e.target.value }))
                }
              />
            </label>
            <label>
              Onde vou divulgar
              <select
                value={draft.channel}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    channel: e.target.value as WorkDraft["channel"],
                  }))
                }
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="stories">Stories</option>
              </select>
            </label>
            <label>
              Minha mensagem
              <textarea
                className="bm-draft-text"
                value={draft.content.text}
                maxLength={4000}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    content: { ...d.content, text: e.target.value },
                  }))
                }
              />
            </label>
            <details>
              <summary>Notas de trabalho</summary>
              <label>
                O que quero lembrar
                <textarea
                  value={draft.content.notes}
                  maxLength={6000}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      content: { ...d.content, notes: e.target.value },
                    }))
                  }
                />
              </label>
            </details>
          </fieldset>
          {draft.kind === "content" && (
            <p className="bm-muted">
              Use este rascunho para conteúdo livre. Para gerar um link
              rastreável e confirmar uma divulgação de oferta, escolha uma
              oferta conferida.
            </p>
          )}
          {editing && !draft.productId && !attaching && draft.version > 0 && (
            <AdminLink
              className="bm-button secondary"
              href={`/admin/ofertas?rascunho=${draft.id}`}
            >
              Escolher uma oferta para este texto →
            </AdminLink>
          )}
          {attaching && (
            <section className="bm-notice">
              <p>
                Vincular a opção e as condições mostradas na prévia a este
                texto? O conteúdo que você já escreveu será preservado.
              </p>
              <button
                className="bm-button secondary"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    kind: "offer",
                    channel: bindingChannel ?? d.channel,
                    productId: offer.reference.productId,
                    optionKey: offer.reference.optionKey,
                    sourceUrl: offer.candidate.productUrl,
                    content: {
                      ...d.content,
                      observationId: offer.reference.observationId,
                      evidenceFingerprint: offer.reference.evidenceFingerprint,
                    },
                  }))
                }
              >
                Vincular esta oferta ao meu texto
              </button>
            </section>
          )}
          {editing && owner && draft.channel === "stories" && (
            <details>
              <summary>Imagem para o Story (opcional)</summary>
              <p className="bm-muted">
                Sem imagem, o Story usa texto e os fatos da oferta. Para incluir
                uma foto, informe sua permissão de uso.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    data = new FormData(form);
                  data.set("tenantId", account);
                  data.set("kind", "kit_asset");
                  data.set("channels", "instagram_stories");
                  setBusy(true);
                  try {
                    const r = await fetch("/api/admin/artifacts/upload", {
                        method: "POST",
                        body: data,
                      }),
                      v = await r.json();
                    if (!r.ok)
                      throw new Error(
                        "Não foi possível guardar a imagem. Confira o arquivo e a permissão de uso.",
                      );
                    setDraft((d) => ({
                      ...d,
                      content: { ...d.content, assetIds: [v.id] },
                    }));
                    setNotice(
                      "Imagem anexada ao rascunho. A permissão será conferida ao preparar.",
                    );
                    form.reset();
                  } catch (e) {
                    setNotice(
                      e instanceof Error
                        ? e.message
                        : "Não foi possível anexar.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <fieldset disabled={busy}>
                  <label>
                    Imagem
                    <input
                      name="file"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      required
                    />
                  </label>
                  <label>
                    Permissão de uso
                    <select name="rightsStatus">
                      <option value="owned">A imagem é minha</option>
                      <option value="licensed">Tenho licença para usar</option>
                    </select>
                  </label>
                  <label>
                    Origem ou documento da permissão
                    <input name="rightsSource" required maxLength={1000} />
                  </label>
                  <label className="bm-checkbox">
                    <input type="checkbox" required />
                    Confirmei a permissão de uso comercial desta imagem no
                    Story.
                  </label>
                  <button className="bm-button secondary" type="submit">
                    Anexar imagem
                  </button>
                </fieldset>
              </form>
              {draft.content.assetIds.length > 0 && (
                <p>
                  Uma imagem anexada.{" "}
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        content: { ...d.content, assetIds: [] },
                      }))
                    }
                  >
                    Remover do material
                  </button>
                </p>
              )}
            </details>
          )}
          {editing && p && !attaching && (
            <>
              <p className="bm-muted">
                Ao preparar, a opção, o preço e as condições ficam registrados
                nesta revisão.
              </p>
              {refChanged && (
                <div className="bm-notice">
                  <p>A oferta recebeu novos dados. Seu texto foi preservado.</p>
                  <button
                    className="bm-button secondary"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        optionKey: offer!.reference.optionKey,
                        content: {
                          ...d.content,
                          observationId: offer!.reference.observationId,
                          evidenceFingerprint:
                            offer!.reference.evidenceFingerprint,
                        },
                      }))
                    }
                  >
                    Revisei meu texto para esta opção; atualizar conferência
                  </button>
                </div>
              )}
              {blockers.length > 0 && (
                <div className="bm-notice">
                  <p>O que falta para preparar:</p>
                  <ul>
                    {blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  <AdminLink href={`/admin/ofertas/${p.id}`}>
                    Conferir a oferta →
                  </AdminLink>
                </div>
              )}
              <button
                className="bm-button"
                disabled={
                  !ready ||
                  busy ||
                  !!conflict ||
                  !!refChanged ||
                  !!blockers.length ||
                  !draft.content.text.trim()
                }
                onClick={() => void action("prepare")}
              >
                {owner
                  ? "Conferir e preparar divulgação"
                  : "Enviar para revisão do responsável"}{" "}
                →
              </button>
            </>
          )}
          {draft.state === "review" && (
            <p className="bm-notice">
              O material está visível ao responsável da conta para revisão.
            </p>
          )}
          {draft.state === "review" && owner && (
            <button
              className="bm-button"
              disabled={busy}
              onClick={() => void action("approve")}
            >
              Conferir e aprovar material
            </button>
          )}
          {draft.state === "prepared" && (
            <>
              <div className="bm-actions">
                <button
                  className="bm-button"
                  disabled={busy}
                  onClick={() => void action("export", { confirmCopy: true })}
                >
                  Copiar mensagem
                </button>
                {draft.channel === "stories" && (
                  <button
                    className="bm-button secondary"
                    disabled={busy}
                    onClick={() => void action("render")}
                  >
                    Gerar Story
                  </button>
                )}
              </div>
              {artifact && (
                <p>
                  <a
                    className="bm-button secondary"
                    href={`/api/admin/artifacts/${artifact}`}
                    download
                  >
                    Baixar Story PNG
                  </a>
                </p>
              )}
              <p className="bm-muted">
                Copiar ou baixar prepara o envio. A publicação no seu canal é
                manual.
              </p>
              <label className="bm-checkbox">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Já publiquei este material no canal escolhido.
              </label>
              <button
                className="bm-button secondary"
                disabled={busy || !confirmed}
                onClick={() => void action("confirm")}
              >
                Confirmar publicação
              </button>
            </>
          )}
          {draft.state === "published" && (
            <p className="bm-notice">
              Publicação registrada no histórico da conta. Os resultados
              dependem dos cliques e das informações de venda recebidas.
            </p>
          )}
        </section>
        <section className="bm-card">
          <h2>Confira antes de divulgar</h2>
          {publication?.snapshot ? (
            <>
              <h3>{publication.snapshot.title}</h3>
              <p>{publication.snapshot.optionLabel}</p>
              <p className="bm-price">
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: publication.snapshot.currency,
                }).format(publication.snapshot.priceCents / 100)}
              </p>
              <p>{publication.snapshot.purchaseContents}</p>
              <p>{publication.snapshot.conditions}</p>
            </>
          ) : p ? (
            <>
              <h3>{p.displayTitle ?? p.title}</h3>
              <p>{p.offerOptionLabel}</p>
              <p className="bm-price">{offerPriceLabel(p)}</p>
              <p>{p.purchaseContents}</p>
              <p>{p.offerConditions}</p>
            </>
          ) : (
            <p>Seu conteúdo livre não está vinculado a uma oferta.</p>
          )}
          {artifact ? (
            <Image
              src={`/api/admin/artifacts/${artifact}?conta=${encodeURIComponent(account)}`}
              alt="Story preparado para conferir antes de publicar"
              width={1080}
              height={1920}
              unoptimized
              style={{ width: "100%", height: "auto", maxWidth: 380 }}
            />
          ) : draft.channel === "stories" ? (
            <div className="bm-story-preview">
              <small>BizuMiner · Prévia do conteúdo</small>
              <strong>
                {publication?.snapshot.title ?? p?.displayTitle ?? draft.title}
              </strong>
              <p>{draft.content.text}</p>
              <small>
                Link de afiliado. Confira preço e condições na loja.
              </small>
            </div>
          ) : (
            <pre className="bm-preview">
              {output || preparedText || draft.content.text}
              {!output && !preparedText && p && draft.state === "editing"
                ? "\n\nA opção, o preço, as condições e o link serão incluídos no material preparado."
                : ""}
            </pre>
          )}
          <p className="bm-muted">
            A revisão preparada preserva os fatos conferidos. Se a oferta mudar,
            será preciso conferir novamente.
          </p>
          {draft.productId && (
            <AdminLink href={`/admin/ofertas/${draft.productId}`}>
              Abrir oferta →
            </AdminLink>
          )}
        </section>
      </div>
    </div>
  );
}
