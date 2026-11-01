/** Memory owned by one mounted admin layout, never a module/browser-storage cache. */
export function createAdminDraftStore() {
  const values = new Map<string, unknown>();
  const listeners = new Map<string, Set<() => void>>();
  const expirations = new Map<string, ReturnType<typeof setTimeout>>();
  let disposed = false;
  return {
    get<T>(key: string, initial: T): T {
      if (!values.has(key)) values.set(key, initial);
      return values.get(key) as T;
    },
    set<T>(key: string, update: T | ((previous: T) => T), initial: T) {
      if (disposed) return;
      const previous = this.get(key, initial);
      const next = typeof update === "function" ? (update as (value: T) => T)(previous) : update;
      if (Object.is(previous, next)) return;
      values.set(key, next);
      for (const notify of listeners.get(key) ?? []) notify();
    },
    subscribe(key: string, notify: () => void) {
      const subscriptions = listeners.get(key) ?? new Set();
      subscriptions.add(notify); listeners.set(key, subscriptions);
      return () => { subscriptions.delete(notify); if (!subscriptions.size) listeners.delete(key); };
    },
    expire(key: string, at: number | null) {
      const previous = expirations.get(key);
      if (previous) clearTimeout(previous);
      expirations.delete(key);
      if (disposed || at === null) return;
      const timer = setTimeout(() => {
        values.delete(key); expirations.delete(key);
        for (const notify of listeners.get(key) ?? []) notify();
      }, Number.isFinite(at) ? Math.max(0, at - Date.now()) : 0);
      expirations.set(key, timer);
    },
    dispose() {
      disposed = true; values.clear(); listeners.clear();
      for (const timer of expirations.values()) clearTimeout(timer);
      expirations.clear();
    },
  };
}

export function adminDraftKey(user: string, account: string, actor: string, field: string) {
  return JSON.stringify([user, account, actor, field]);
}
