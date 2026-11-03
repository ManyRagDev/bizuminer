import { cache } from "react";

type ReadCache = Map<unknown, unknown>;
const renderReads = cache((): ReadCache => new Map());
const explicitReads = new WeakMap<object, ReadCache>();
const resultKey = Symbol("request-read-result");

/** React owns the render cache; APIs must provide their own request object. */
export function readInRequest<T>(keys: readonly unknown[], read: () => Promise<T>, request?: object): Promise<T> {
  let entries: ReadCache;
  if (request) {
    entries = explicitReads.get(request) ?? new Map();
    explicitReads.set(request, entries);
  } else entries = renderReads();
  for (const key of keys) {
    let next = entries.get(key) as ReadCache | undefined;
    if (!next) { next = new Map(); entries.set(key, next); }
    entries = next;
  }
  const previous = entries.get(resultKey) as Promise<T> | undefined;
  if (previous) return previous;
  const start = performance.now();
  const promise = Promise.resolve().then(read);
  entries.set(resultKey, promise);
  if (process.env.BIZUMINER_PERF_DIAGNOSTICS === "1") {
    void promise.then(
      () => console.info("bizuminer_read", { operation: String(keys[0]), ms: Math.round(performance.now() - start), ok: true }),
      () => console.info("bizuminer_read", { operation: String(keys[0]), ms: Math.round(performance.now() - start), ok: false }),
    );
  }
  return promise;
}

/** Call after a mutation, before the response's next render/read phase. */
export function invalidateRequestReads(request?: object) {
  if (request) explicitReads.delete(request);
  else renderReads().clear();
}
