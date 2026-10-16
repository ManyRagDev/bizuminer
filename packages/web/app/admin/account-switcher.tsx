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
  return (
    <div>
      <label>
        Conta em operação{" "}
        <select
          value={selected}
          disabled={pending}
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
      <span role="status">{error}</span>
    </div>
  );
}
