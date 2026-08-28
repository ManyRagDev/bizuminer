/**
 * Storage da extensão (E5). `chrome.storage.local` guarda token, outbox e
 * estados de UX. NUNCA é fonte de verdade (o Supabase/API é). Token fica em
 * `local`, nunca `sync`.
 */

export interface ExtensionStorage {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const STORAGE_KEYS = {
  token: "bm_token",
  deviceId: "bm_device_id",
  affiliateName: "bm_affiliate_name",
  activeTabId: "bm_active_tab_id",
  outbox: "bm_outbox",
} as const;

export function chromeStorage(): ExtensionStorage {
  return chrome.storage.local as unknown as ExtensionStorage;
}

export async function getToken(storage: ExtensionStorage): Promise<string | null> {
  const data = await storage.get(STORAGE_KEYS.token);
  const token = data[STORAGE_KEYS.token];
  return typeof token === "string" && token.length > 0 ? token : null;
}

export async function setSession(
  storage: ExtensionStorage,
  session: { token: string; deviceId: string; affiliateName: string },
): Promise<void> {
  await storage.set({
    [STORAGE_KEYS.token]: session.token,
    [STORAGE_KEYS.deviceId]: session.deviceId,
    [STORAGE_KEYS.affiliateName]: session.affiliateName,
  });
}

export async function clearSession(storage: ExtensionStorage): Promise<void> {
  await storage.set({
    [STORAGE_KEYS.token]: "",
    [STORAGE_KEYS.deviceId]: "",
    [STORAGE_KEYS.affiliateName]: "",
  });
}
