"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore, useTransition, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { adminDraftKey, createAdminDraftStore } from "../../lib/admin-draft-store.ts";

type DraftContextValue = {
  user: string; account: string; actor: string;
  store: ReturnType<typeof createAdminDraftStore>;
};
const DraftContext = createContext<DraftContextValue | null>(null);

/** Bind follow-up API requests to the account that started the operation. */
export function useAdminFetch(): typeof fetch {
  const account = useContext(DraftContext)?.account;
  return useCallback((input, init) => {
    if (account && typeof input === "string" && input.startsWith("/api/")) {
      const headers = new Headers(init?.headers);
      if (!headers.has("x-bm-account")) headers.set("x-bm-account", account);
      return globalThis.fetch(input, { ...init, headers });
    }
    return globalThis.fetch(input, init);
  }, [account]);
}

export function AdminDraftProvider({ user, account, actor, children }: {
  user: string; account: string; actor: string; children: ReactNode;
}) {
  const store = useRef<ReturnType<typeof createAdminDraftStore> | null>(null);
  store.current ??= createAdminDraftStore();
  const lifecycle = useRef(0);
  useEffect(() => {
    const generation = ++lifecycle.current;
    return () => {
      // StrictMode immediately replays setup. Only a real unmount disposes RAM.
      queueMicrotask(() => { if (lifecycle.current === generation) store.current?.dispose(); });
    };
  }, []);
  return <DraftContext.Provider value={{ user, account, actor, store: store.current }}>
    <div onSubmitCapture={(event) => {
      const form = event.target;
      if (form instanceof HTMLFormElement && new URL(form.action).pathname === "/auth/sair") store.current?.dispose();
    }}>{children}</div>
  </DraftContext.Provider>;
}

/** Explicit page account overrides the layout's cookie default (e.g. ?conta=). */
export function AdminDraftScope({ account, actor, children }: { account: string; actor: string; children: ReactNode }) {
  const parent = useContext(DraftContext);
  return <DraftContext.Provider value={parent ? { ...parent, account, actor } : null}>{children}</DraftContext.Provider>;
}

export function useAdminDraftState<T>(field: string, initial: T | (() => T), expiresAt?: (value: T) => number | null): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(DraftContext);
  const fallback = useRef<ReturnType<typeof createAdminDraftStore> | null>(null);
  fallback.current ??= createAdminDraftStore();
  const store = context?.store ?? fallback.current;
  const initialValue = useRef<{ value: T } | null>(null);
  initialValue.current ??= { value: typeof initial === "function" ? (initial as () => T)() : initial };
  const value = initialValue.current.value;
  const key = adminDraftKey(context?.user ?? "standalone", context?.account ?? "", context?.actor ?? "", field);
  const subscribe = useCallback((notify: () => void) => store.subscribe(key, notify), [store, key]);
  const snapshot = useCallback(() => store.get(key, value), [store, key, value]);
  const serverSnapshot = useCallback(() => value, [value]);
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const setState = useCallback<Dispatch<SetStateAction<T>>>((update) => {
    store.set(key, update, value);
    if (expiresAt) store.expire(key, expiresAt(store.get(key, value)));
  }, [store, key, value, expiresAt]);
  return [state, setState];
}

/** Pending accepted writes survive leaving a pane; they are never replayed. */
export function useAdminDraftTransition(field: string): [boolean, (action: () => void | Promise<void>) => void] {
  const [pending, setPending] = useAdminDraftState(field, false);
  const [transitioning, start] = useTransition();
  const lock = useRef(false);
  const run = (action: () => void | Promise<void>) => {
    if (pending || lock.current) return;
    lock.current = true; setPending(true);
    start(async () => {
      try { await action(); }
      finally { lock.current = false; setPending(false); }
    });
  };
  return [pending || transitioning, run];
}

/** A pane revisited during a write refreshes its server data when that write ends. */
export function useResumeAfterOperation(pending: boolean, refresh: () => Promise<void>) {
  const resumed = useRef(pending);
  useEffect(() => {
    if (resumed.current && !pending) { resumed.current = false; void refresh(); }
  }, [pending, refresh]);
}
