import { pageAccount } from "../../../lib/page-account.ts";
import {
  workspaceOffers,
  affiliateWorkspaceEnabled,
} from "../../../lib/affiliate-workspace-db.ts";
import { redirect } from "next/navigation";
import Offers from "./workspace.tsx";
export const dynamic = "force-dynamic";
export default async function Page() {
  const c = await pageAccount();
  if (!c) return null;
  if (!(await affiliateWorkspaceEnabled(c)))
    redirect("/admin/curadoria?aba=selecao");
  const data = await workspaceOffers(c);
  return <Offers offers={JSON.parse(JSON.stringify(data.offers))} />;
}
