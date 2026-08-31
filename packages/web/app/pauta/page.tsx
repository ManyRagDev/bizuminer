import { cookies } from "next/headers";
import { getPageSession } from "../../lib/auth";
import { validUserId } from "../../lib/member-contract";
import { isAdminEmail } from "../../lib/auth-contract";
import PautaClient from "./pauta-client";

export const dynamic = "force-dynamic";

export default async function PautaPage() {
  const uid = (await cookies()).get("bm_uid")?.value;
  const session = await getPageSession(validUserId(uid) ? uid : null);
  if (!session || !isAdminEmail(session.authUser.email)) {
    return (
      <main style={{ padding: "40px 20px", textAlign: "center" }}>
        <h1>Acesso restrito</h1>
        <p>Esta página é apenas para administradores.</p>
      </main>
    );
  }

  return <PautaClient />;
}
