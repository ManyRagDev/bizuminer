import { pageAccount } from "../../../lib/page-account.ts";
import { affiliateWorkspaceEnabled } from "../../../lib/affiliate-workspace-db.ts";
import { redirect } from "next/navigation";
export const metadata = {
  title: "Ofertas | BizuMiner",
  robots: { index: false, follow: false },
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const c = await pageAccount();
  if (!c || !(await affiliateWorkspaceEnabled(c)))
    redirect("/admin/curadoria?aba=selecao");
  return children;
}
