// Next 15's Webpack dev server awaits its optional npm version check before
// becoming ready. Bound only this request so an unavailable registry cannot
// hold local development at "Starting..." for the network's full timeout.
// This preload is used exclusively by `npm run dev` and inherited by Next's
// worker process. Builds and the production server use their normal fetch.
const fetch = globalThis.fetch;
const versionCheckUrl = "https://registry.npmjs.org/-/package/next/dist-tags";

globalThis.fetch = function devFetch(input, init) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
  if (url !== versionCheckUrl) return fetch(input, init);

  const originalSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const timeout = AbortSignal.timeout(1500);
  const signal = originalSignal ? AbortSignal.any([originalSignal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
};
