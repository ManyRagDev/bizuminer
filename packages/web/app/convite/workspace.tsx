"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptAccountInvitationAction } from "../admin/onboarding-actions.ts";
import { selectAccountAction } from "../admin/account-actions.ts";
export default function InviteForm() {
  const [message, setMessage] = useState(""),
    [pending, start] = useTransition(),
    router = useRouter();
  return (
    <form
      action={(f) =>
        start(async () => {
          const result = await acceptAccountInvitationAction({
            rawToken: String(f.get("token")),
          });
          if (result.ok) {
            await selectAccountAction(result.tenantId);
            router.push("/admin/onboarding");
            router.refresh();
          } else setMessage(result.error);
        })
      }
    >
      <label>
        Código privado do convite{" "}
        <input name="token" type="password" autoComplete="off" required />
      </label>
      <button disabled={pending}>Aceitar convite</button>
      <p role="status">{message}</p>
    </form>
  );
}
