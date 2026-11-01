export const ADMIN_TABS = ["visao-geral", "rodagens", "captura-manual", "publicacao", "afiliados"] as const;
export type AdminTab = typeof ADMIN_TABS[number];
export function normalizeAdminTab(value?: string): AdminTab {
  return ADMIN_TABS.includes(value as AdminTab) ? value as AdminTab : "visao-geral";
}
