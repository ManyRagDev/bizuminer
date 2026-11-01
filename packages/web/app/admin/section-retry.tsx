"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function SectionRetry({ label }: { label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <section className="admin-section" role="status">
    <p>Não foi possível carregar {label}.</p>
    <button type="button" disabled={pending} onClick={() => start(() => router.refresh())}>
      {pending ? "Carregando…" : "Tentar novamente"}
    </button>
  </section>;
}
