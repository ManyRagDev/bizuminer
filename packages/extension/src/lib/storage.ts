/**
 * Storage da extensão (E5). `chrome.storage.local` guarda token, outbox e
 * estados de UX. NUNCA é fonte de verdade (o Supabase/API é). Token fica em
 * `local`, nunca `sync`.
 */

declare const __API_BASE__: string;
export const BUILD_API_ORIGIN = typeof __API_BASE__ === "string" ? __API_BASE__ : "https://www.bizuminer.com.br";
if (!["https://www.bizuminer.com.br", "http://localhost:3100"].includes(BUILD_API_ORIGIN)) throw new Error("invalid_build_origin");

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
  apiBaseUrl: "bm_api_base_url",
  sessionOrigin: "bm_session_origin",
} as const;

export function chromeStorage(): ExtensionStorage {
  return chrome.storage.local as unknown as ExtensionStorage;
}

export async function getToken(storage: ExtensionStorage): Promise<string | null> {
  const data = await storage.get([STORAGE_KEYS.token, STORAGE_KEYS.deviceId, STORAGE_KEYS.sessionOrigin]);
  const token = data[STORAGE_KEYS.token];
  return typeof token === "string" && token.startsWith("bm_ext_") && data[STORAGE_KEYS.sessionOrigin] === BUILD_API_ORIGIN
    && typeof data[STORAGE_KEYS.deviceId] === "string" && !!data[STORAGE_KEYS.deviceId] ? token : null;
}

export async function getApiBaseUrl(_storage: ExtensionStorage): Promise<string> {
  return BUILD_API_ORIGIN;
}

export async function setApiBaseUrl(storage: ExtensionStorage, url: string): Promise<void> {
  if (url !== BUILD_API_ORIGIN) throw new Error("invalid_url");
  await storage.set({ [STORAGE_KEYS.apiBaseUrl]: BUILD_API_ORIGIN });
}

export async function setSession(
  storage: ExtensionStorage,
  session: { token: string; deviceId: string; affiliateName: string; origin: string },
): Promise<void> {
  await storage.set({
    [STORAGE_KEYS.sessionOrigin]: session.origin,
    [STORAGE_KEYS.token]: session.token,
    [STORAGE_KEYS.deviceId]: session.deviceId,
    [STORAGE_KEYS.affiliateName]: session.affiliateName,
  });
}

export async function clearSession(storage: ExtensionStorage): Promise<void> {
  await storage.set({
    [STORAGE_KEYS.sessionOrigin]: "",
    [STORAGE_KEYS.token]: "",
    [STORAGE_KEYS.deviceId]: "",
    [STORAGE_KEYS.affiliateName]: "",
  });
}
