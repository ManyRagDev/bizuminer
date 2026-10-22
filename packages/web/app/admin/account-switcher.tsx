"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { selectAccountAction } from "./account-actions.ts";

export default function AccountSwitcher({
  accounts,
  selected,
}: {
  accounts: { tenantId: string; displayName: string }[];
  selected: string;
}) {
  const router = useRouter(),
    [pending, start] = useTransition(),
    [error, setError] = useState("");

  const current = accounts.find((a) => a.tenantId === selected);

  if (accounts.length <= 1) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "0.75rem",
          background: "var(--surface-elevated, #f4f4f5)",
          color: "var(--ink-muted, #71717a)",
          padding: "4px 10px",
          borderRadius: "16px",
          border: "1px solid var(--line, #e4e4e7)",
          fontWeight: 500,
        }}
        title="Conta em operação"
      >
        <span>🏢</span> {current?.displayName || selected}
      </span>
    );
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "0.75rem",
      }}
    >
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          background: "var(--surface-elevated, #f4f4f5)",
          border: "1px solid var(--line, #e4e4e7)",
          padding: "3px 8px",
          borderRadius: "16px",
          fontWeight: 500,
        }}
      >
        <span aria-hidden="true">🏢</span>
        <select
          value={selected}
          disabled={pending}
          aria-label="Conta em operação"
          style={{
            border: "none",
            background: "transparent",
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "var(--ink, #18181b)",
            cursor: "pointer",
            outline: "none",
          }}
          onChange={(e) => {
            const target = e.target.value;
            start(async () => {
              const r = await selectAccountAction(target);
              if (r.ok) {
                router.push("/admin?conta=" + encodeURIComponent(target));
                router.refresh();
              } else setError("Conta não autorizada.");
            });
          }}
        >
          {accounts.map((a) => (
            <option value={a.tenantId} key={a.tenantId}>
              {a.displayName}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <span role="status" style={{ color: "#dc2626", fontSize: "0.75rem" }}>
          {error}
        </span>
      )}
    </div>
  );
}
