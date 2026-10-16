import type { Metadata } from "next";
import MarketingWorkspace from "./workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Marketing · BizuMiner",
  robots: { index: false, follow: false },
};

// The admin layout gates the page; the API independently verifies the session and role.
export default function MarketingPage() {
  return <MarketingWorkspace />;
}
