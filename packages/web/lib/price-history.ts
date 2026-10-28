export type HistoryPoint = { price_cents: number; observed_at: Date | string };
export type HistoryContext = {
  windowDays: number;
  totalCount: number;
  windowCount: number;
  comparableCount: number;
  excludedCount: number;
  olderCount?: number;
  comparison: "comparable" | "configuration_unknown" | "currency_unknown" | "non_exact";
  currency?: string;
};

/** All chart values and extrema come from the same comparable series. */
export function priceHistoryView(points: HistoryPoint[], context?: HistoryContext) {
  const series = points.filter(p => Number.isSafeInteger(p.price_cents) && p.price_cents > 0 && Number.isFinite(new Date(p.observed_at).getTime()))
    .slice().sort((a, b) => +new Date(a.observed_at) - +new Date(b.observed_at));
  const prices = series.map(p => p.price_cents);
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const first = series.length ? +new Date(series[0].observed_at) : 0;
  const last = series.length ? +new Date(series[series.length - 1].observed_at) : 0;
  const coordinates = series.map(p => ({ ...p,
    x: last === first ? 50 : 5 + (+new Date(p.observed_at) - first) / (last - first) * 90,
    y: min === max ? 50 : 86 - (p.price_cents - min!) / (max! - min!) * 70,
  }));
  const state = series.length === 0 ? "empty" : series.length === 1 ? "single" : min === max ? "stable" : "variable";
  let explanation: string;
  if (state === "single") explanation = "Temos um preço confirmado para esta versão. Novos registros vão mostrar se ele mudou.";
  else if (state === "stable") explanation = "O preço se manteve igual nos registros comparáveis deste período.";
  else if (state === "variable") explanation = "Compare a evolução do preço desta mesma versão. Frete pode variar conforme seu endereço.";
  else if (context?.windowCount === 0 && context.olderCount) explanation = `Os registros disponíveis têm mais de ${context.windowDays} dias. Ainda não há uma comparação recente para mostrar.`;
  else if (context?.comparison === "non_exact") explanation = "O anúncio reúne preços a partir de um valor ou várias versões. Ainda não podemos comparar uma versão específica.";
  else if (context?.comparison === "currency_unknown") explanation = "A loja não informou a moeda em todos os dados necessários para comparar os preços com segurança.";
  else if (context?.comparison === "configuration_unknown") explanation = "Ainda falta confirmar a versão, o que vem na compra ou as condições do anúncio. Por isso, não misturamos esses preços em um gráfico.";
  else explanation = "Ainda não há preços comparáveis neste período. Os próximos registros aparecerão aqui.";
  return { state, series, coordinates, min, max, explanation };
}
