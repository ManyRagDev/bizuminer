export interface DealSignalInput {
  priceCents: number;
  previousMinPriceCents: number | null;
  observationCount: number;
  historyDays: number;
  lowestVerified: boolean;
}

export const MINIMUM_HISTORY = { observations: 3, days: 7 } as const;

export function priceDifferencePercent(input: DealSignalInput) {
  if (!input.previousMinPriceCents || input.previousMinPriceCents <= 0) return null;
  return Math.round(((input.priceCents - input.previousMinPriceCents) / input.previousMinPriceCents) * 100);
}

// Acompanhamento que começou hoje tem zero dias de janela. Dizer "0 dias" faz o
// selo parecer defeito; o período ainda não existe, então falamos do que existe.
export function historyWindow(days: number) {
  if (days < 1) return "hoje";
  return `${days} dia${days === 1 ? "" : "s"}`;
}

export function priceSignal(input: DealSignalInput) {
  if (input.lowestVerified) {
    return { tone: "verified", label: "menor preço no período monitorado" } as const;
  }
  if (input.observationCount > 1) {
    const window = input.historyDays < 1 ? "hoje" : `· ${historyWindow(input.historyDays)}`;
    return { tone: "monitoring", label: `${input.observationCount} registros ${window}` } as const;
  }
  return { tone: "new", label: "primeiro registro de preço" } as const;
}

export type PriceHighlight = { tone: "verified" | "drop" | "unproven"; label: string };

// No card, o selo só fala quando o comprador não conseguiria deduzir aquilo
// sozinho olhando o anúncio. "Está sendo monitorado" vale para 100% do catálogo,
// então não distingue nada — é premissa do produto, dita uma vez no topo da página.
// O silêncio é o padrão, e é ele que faz o selo raro ser lido quando aparece.
//
// Os rótulos carregam o próprio escopo ("que já vimos") de propósito: um selo
// raro e vago seria mais perigoso que o atual, porque teria toda a atenção que
// o atual não tem — e seria lido como aval sobre o mercado, não sobre nosso histórico.
export function priceHighlight(input: DealSignalInput): PriceHighlight | null {
  if (input.lowestVerified) return { tone: "verified", label: "menor preço que já vimos" };
  const gap = priceDifferencePercent(input);
  if (gap !== null && gap < 0) return { tone: "drop", label: `caiu ${Math.abs(gap)}% desde o menor que vimos` };
  if (input.observationCount <= 1) return { tone: "unproven", label: "ainda sem histórico" };
  return null;
}

export function priceNarrative(input: DealSignalInput, formatCurrency: (cents: number) => string) {
  if (input.lowestVerified) {
    return `Menor preço entre ${input.observationCount} registros coletados em ${historyWindow(input.historyDays)}.`;
  }
  const gap = priceDifferencePercent(input);
  if (gap !== null && gap > 0) {
    return `Está ${gap}% acima do menor registro anterior (${formatCurrency(input.previousMinPriceCents!)}).`;
  }
  if (gap !== null && gap < 0) {
    return `Caiu ${Math.abs(gap)}% abaixo do menor registro anterior.`;
  }
  if (gap === 0) {
    return `Preço igual ao menor registro anterior (${formatCurrency(input.previousMinPriceCents!)}).`;
  }
  if (input.observationCount > 1) {
    if (input.historyDays < 1) return `Temos ${input.observationCount} registros de preço coletados hoje; o acompanhamento acabou de começar.`;
    return `Temos ${input.observationCount} registros de preço em ${historyWindow(input.historyDays)} de acompanhamento.`;
  }
  return "Primeiro preço registrado; ainda não há comparação histórica.";
}

export function freshnessLabel(value: Date | string | null, now = new Date()) {
  if (!value) return null;
  const date = new Date(value);
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 2) return "atualizado agora";
  if (minutes < 60) return `atualizado há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `atualizado há ${hours} h`;
  const days = Math.round(hours / 24);
  return `atualizado há ${days} dia${days === 1 ? "" : "s"}`;
}
