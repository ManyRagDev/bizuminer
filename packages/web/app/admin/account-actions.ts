"use server";
import { cookies } from "next/headers";
import { getPageAuth, resolveAccountContext } from "../../lib/auth.ts";
import { invalidateRequestReads } from "../../lib/request-read.ts";
export async function selectAccountAction(tenantId: string) {
  const user = await getPageAuth();
  if (
    !user ||
    !(await resolveAccountContext({
      authUserId: user.id,
      requestedAccount: tenantId,
    }))
  )
    return { ok: false };
  (await cookies()).set("bm_account", tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  invalidateRequestReads();
  return { ok: true };
}
