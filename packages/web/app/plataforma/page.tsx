import { pageAccount, platformPageContext } from "../../lib/page-account.ts";
import { redirect } from "next/navigation";
import { getCommercialResults } from "../../lib/commercial-financial-db.ts";
import { withAccountDb } from "../../lib/tenant-db.ts";
import { commercialRolloutReady } from "../../lib/commercial-rollout.ts";
import Platform from "./workspace.tsx";
import "../admin/workspace.css";
export const dynamic = "force-dynamic";
export default async function Page() {
  const platform = await platformPageContext();
  if (!platform) redirect("/admin");
  const account = await pageAccount("local");
  let revenues: any[] = [];
  if (
    account?.membershipRole === "owner" &&
    (await withAccountDb(account, (tx) => commercialRolloutReady(tx)))
  )
    revenues = (await getCommercialResults(account, undefined, true)).revenues;
  return (
    <main className="bm-workspace">
      <a href="/admin">← Meu negócio</a>
      <header className="bm-page-heading">
        <p className="bm-eyebrow">Administração da plataforma</p>
        <h1>Contas piloto e operação do BizuMiner.</h1>
        <p>
          Acesso restrito a administradores da plataforma. As funções de
          afiliado ficam no painel do negócio.
        </p>
      </header>
      <Platform
        canManageRevenue={account?.membershipRole === "owner"}
        revenues={JSON.parse(JSON.stringify(revenues))}
      />
    </main>
  );
}
