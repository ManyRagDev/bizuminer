import { cookies, headers } from "next/headers";
import { getPageSession } from "../../lib/auth";
import { validUserId } from "../../lib/member-contract";
import { isAdminEmail } from "../../lib/auth-contract";
import { getPautaQrBundle } from "../../lib/qr-service";
import { createPautaAuthToken, verifyPautaAuthToken } from "../../lib/pauta-auth";
import AdminShell from "../_components/admin-shell";
import PautaClient from "./pauta-client";

export const dynamic = "force-dynamic";

export default async function PautaPage({
  searchParams,
}: {
  searchParams?: Promise<{ auth?: string }>;
}) {
  const cookieStore = await cookies();
  const uid = cookieStore.get("bm_uid")?.value;
  const pautaAuthCookie = cookieStore.get("bm_pauta_auth")?.value;

  const resolvedParams = searchParams ? await searchParams : {};
  const queryAuthToken = resolvedParams.auth;

  // 1. Checa se o token recebido por URL (QR code) ou cookie é válido
  const hasValidPautaToken =
    verifyPautaAuthToken(queryAuthToken) ||
    verifyPautaAuthToken(pautaAuthCookie);

  // 2. Se não veio por token, valida a sessão tradicional de admin (Supabase)
  let session = null;
  if (!hasValidPautaToken) {
    session = await getPageSession(validUserId(uid) ? uid : null);
  }

  const isAuthorized = hasValidPautaToken || (session && isAdminEmail(session.authUser.email));

  if (!isAuthorized) {
    return (
      <main style={{ padding: "40px 20px", textAlign: "center", maxWidth: "480px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "24px", marginBottom: "8px" }}>Acesso restrito</h1>
        <p style={{ color: "var(--ink-muted, #71717a)", fontSize: "14px", lineHeight: 1.5 }}>
          Esta página é destinada ao administrador do BizuMiner.
        </p>
        <div style={{ marginTop: "24px", padding: "16px", background: "var(--paper-deep, #f4f4f5)", borderRadius: "8px", textAlign: "left", fontSize: "13px", lineHeight: 1.5 }}>
          <strong>📱 Como abrir no celular:</strong>
          <p style={{ margin: "8px 0 0", color: "var(--ink-body, #27272a)" }}>
            Abra a página <code>/pauta</code> no computador onde você já está logado como admin e aponte a câmera para o QR Code gerado na tela.
          </p>
        </div>
      </main>
    );
  }

  // Gera o token assinado para que os QR Codes autorizem o celular imediatamente sem login
  const authToken = createPautaAuthToken();
  const headerList = await headers();
  const host = headerList.get("host");
  const qrBundle = await getPautaQrBundle(host, authToken);

  return (
    <AdminShell>
      <PautaClient qrBundle={qrBundle} authTokenToPersist={queryAuthToken} />
    </AdminShell>
  );
}

