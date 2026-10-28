/** Reject HTTP, server and eligibility failures before the UI commits account state. */
export async function requestFavorite(productId: string, saved: boolean, request: typeof fetch = fetch): Promise<void> {
  const response = await request("/api/minha/favoritos", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, saved }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok || (saved && !result.applied)) throw new Error("favorite_not_applied");
}
