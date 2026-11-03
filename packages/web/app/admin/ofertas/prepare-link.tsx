"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminFetch } from "../draft-provider.tsx";
export default function PrepareLink({ productId }: { productId: string }) {
  const fetch = useAdminFetch(),
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <div>
      <button
        className="bm-button secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/api/admin/workspace", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "prepareLink",
                  productId,
                  requestId: crypto.randomUUID(),
                }),
              }),
              v = await r.json();
            if (!r.ok) throw new Error(v.error);
            setMessage("Link preparado com os dados da sua conta.");
            router.refresh();
          } catch (e) {
            setMessage(
              e instanceof Error
                ? e.message
                : "Não foi possível preparar o link.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Preparando link…" : "Preparar meu link de afiliado"}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
