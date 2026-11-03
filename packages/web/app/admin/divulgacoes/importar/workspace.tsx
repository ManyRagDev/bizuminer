"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminFetch } from "../../draft-provider.tsx";
import type { MarketingContent } from "../../../../lib/marketing-contract.ts";
export default function LegacyImport() {
  const fetch = useAdminFetch(),
    router = useRouter(),
    [contents, setContents] = useState<MarketingContent[]>([]),
    [message, setMessage] = useState("Carregando seus conteúdos…"),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    void fetch("/api/admin/marketing", { signal: c.signal })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        setContents(
          v.workspace.contents.filter((c: MarketingContent) => !c.archived),
        );
        setMessage("");
      })
      .catch((e) => {
        if (!c.signal.aborted) setMessage(e.message);
      });
    return () => c.abort();
  }, [fetch]);
  return (
    <div className="bm-workspace">
      <header className="bm-page-heading">
        <p className="bm-eyebrow">Divulgações · Reutilizar</p>
        <h1>Continue com o que já criou.</h1>
        <p>
          O conteúdo original e seu histórico são preservados. Uma nova cópia
          pessoal será criada para editar.
        </p>
      </header>
      {message && (
        <p role="status" className="bm-notice">
          {message}
        </p>
      )}
      <div className="bm-grid">
        {contents.map((c) => (
          <section className="bm-card" key={c.id}>
            <h2>{c.title}</h2>
            <p>{c.caption.slice(0, 180)}</p>
            <button
              disabled={busy}
              className="bm-button secondary"
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await fetch("/api/admin/work-drafts", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        id: crypto.randomUUID(),
                        expectedVersion: 0,
                        kind: "content",
                        channel: c.format === "Story" ? "stories" : "whatsapp",
                        title: c.title.slice(0, 250),
                        productId: null,
                        optionKey: null,
                        sourceUrl: "",
                        legacyRef: "marketing:" + c.id,
                        content: {
                          text: [c.headline, c.body, c.caption, c.cta]
                            .filter(Boolean)
                            .join("\n\n")
                            .slice(0, 10000),
                          notes: [c.notes, c.references]
                            .filter(Boolean)
                            .join("\n")
                            .slice(0, 6000),
                          observationId: "",
                          evidenceFingerprint: "",
                          assetIds: [],
                        },
                      }),
                    }),
                    v = await r.json();
                  if (!r.ok) throw new Error(v.error);
                  router.push("/admin/divulgacoes/" + v.draft.id);
                } catch (e) {
                  setMessage(
                    e instanceof Error
                      ? e.message
                      : "Não foi possível reutilizar.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reutilizar como rascunho →
            </button>
          </section>
        ))}
      </div>
      <p>
        <a href="/admin/marketing">Abrir conteúdos no planejamento anterior</a>
      </p>
    </div>
  );
}
