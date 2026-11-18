/** Operational links never depend on the commercial workspace being enabled. */
export function curationOfferHref(
  productId: string,
  tenantId: string,
  options: { optionKey?: string; confirm?: boolean; origin?: "pauta" | "avaliacoes" | "capturas"; captureRef?:string; captureReturn?:string; issueReturn?:string; channel?: "whatsapp" | "stories" } = {},
): string {
  const query = new URLSearchParams({ conta: tenantId });
  if (options.optionKey) query.set("opcao", options.optionKey);
  if (options.origin) query.set("origem", options.origin);
  if (options.channel) query.set("canal", options.channel);
  if (options.captureRef) query.set("captura",options.captureRef);
  if (options.captureReturn) query.set("retornoCaptura",options.captureReturn);
  if(options.issueReturn)query.set('retornoProblemas',options.issueReturn);
  return `/admin/curadoria/ofertas/${encodeURIComponent(productId)}?${query}${options.confirm ? `#confirmar-opcao-${encodeURIComponent(productId)}` : ""}`;
}

export function curationIssuesHref(tenantId: string): string {
  return `/admin/curadoria?${new URLSearchParams({ aba: "problemas", conta: tenantId })}#avaliacoes-incertas`;
}
