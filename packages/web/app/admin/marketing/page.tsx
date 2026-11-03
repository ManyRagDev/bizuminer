import type { Metadata } from "next";
import MarketingWorkspace from "./workspace";
import { pageAccount } from "../../../lib/page-account";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Meu dia · Marketing · BizuMiner",
  robots: { index: false, follow: false },
};

// The admin layout gates the page; the API independently verifies the session and role.
export default async function MarketingPage() {
  const account = await pageAccount();
  if (!account) return null;
  return (
    <MarketingWorkspace key={account.tenantId} tenantId={account.tenantId} />
  );
}
