type OriginRequest = Pick<Request, "headers" | "url">;
type OriginEnvironment = Readonly<Record<string, string | undefined>>;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function webOrigin(value: string): URL | null {
  if (!value || value.length > 2048 || /[\s\\@]/.test(value)) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:")
      && url.hostname && !url.username && !url.password
      && url.href === `${url.origin}/` ? url : null;
  } catch { return null; }
}

/** CSRF origin for authenticated admin mutations; does not authorize an account.
 * Production trusts only the configured HTTPS site, never proxy/Host headers.
 * Without configuration, development permits only the exact loopback origin.
 */
export function adminMutationOrigin(
  request: OriginRequest,
  env: OriginEnvironment = process.env,
): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const parsed = webOrigin(origin);
  // Browser Origin is an origin, not a URL, list, or redirect target.
  if (!parsed || parsed.origin !== origin) return null;
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && !["same-origin", "same-site", "none"].includes(site)) return null;

  const configured = env.NEXT_PUBLIC_SITE_URL;
  let expected: URL | null;
  if (configured !== undefined) {
    expected = webOrigin(configured);
    if (!expected || (expected.protocol !== "https:"
      && (env.NODE_ENV === "production" || !LOOPBACK_HOSTS.has(expected.hostname)))) return null;
  } else {
    if (env.NODE_ENV === "production") return null;
    try {
      const url = new URL(request.url);
      // Host preserves 127.0.0.1 when NextURL normalizes it to localhost.
      const host = request.headers.get("host") ?? url.host;
      if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/i.test(host)) return null;
      expected = webOrigin(`${url.protocol}//${host}`);
    } catch { return null; }
    if (!expected || !LOOPBACK_HOSTS.has(expected.hostname)) return null;
  }
  return expected.origin === origin ? origin : null;
}
