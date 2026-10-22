/** Carry the explicit link identity through each exit; never use a shared cookie. */
export function campaignExitPath(slug: string, code?: string | null): string {
  const path = `/go/${encodeURIComponent(slug)}`;
  // Preserve malformed input too: the /go validator must reject it, not silently
  // turn an invalid campaign link into an unattributed legacy click.
  return code ? `${path}?c=${encodeURIComponent(code)}` : path;
}
