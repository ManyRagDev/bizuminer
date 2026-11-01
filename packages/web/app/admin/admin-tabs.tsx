import type { ReactNode } from "react";
import type { AdminTab } from "../../lib/admin-navigation.ts";

/** Only the requested pane is rendered; drafts belong to the persistent layout. */
export default function AdminTabs({ activeTab, children }: { activeTab: AdminTab; children: ReactNode }) {
  return <div className="admin-tabs" data-admin-tab={activeTab}>
    <div role="tabpanel" aria-label={activeTab}>{children}</div>
  </div>;
}
