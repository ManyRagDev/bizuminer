import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPageAuth, isAffiliate } from "../../lib/auth";
import { getPautaQrBundle } from "../../lib/qr-service";
import AdminShell from "../_components/admin-shell";
import PautaClient from "./pauta-client";

export const dynamic = "force-dynamic";

export default async function PautaPage() {
  const user = await getPageAuth();
  if (!user) redirect("/entrar?next=/pauta");
  const isAuthorized = await isAffiliate(user);

  if (!isAuthorized) {
    return (
      <main style={{ padding: "40px 20px", textAlign: "center", maxWidth: "480px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "24px", marginBottom: "8px" }}>Acesso restrito</h1>
        <p style={{ color: "var(--ink-muted, #71717a)", fontSize: "14px", lineHeight: 1.5 }}>
          Esta página exige uma conta com a role afiliado.
        </p>
        <div style={{ marginTop: "24px", padding: "16px", background: "var(--paper-deep, #f4f4f5)", borderRadius: "8px", textAlign: "left", fontSize: "13px", lineHeight: 1.5 }}>
          <strong>📱 Como abrir no celular:</strong>
          <p style={{ margin: "8px 0 0", color: "var(--ink-body, #27272a)" }}>
            Entre no celular com a mesma conta afiliada e abra <code>/pauta</code>. O QR Code não transporta credenciais.
          </p>
        </div>
      </main>
    );
  }

  const headerList = await headers();
  const host = headerList.get("host");
  const qrBundle = await getPautaQrBundle(host);

  return (
    <AdminShell>
      <PautaClient qrBundle={qrBundle} />
    </AdminShell>
  );
}
