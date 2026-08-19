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

export function priceSignal(input: DealSignalInput) {
  if (input.lowestVerified) {
    return { tone: "verified", label: "menor preço no período monitorado" } as const;
  }
  if (input.observationCount > 1) {
    return { tone: "monitoring", label: `${input.observationCount} registros · ${input.historyDays} dia${input.historyDays === 1 ? "" : "s"}` } as const;
  }
  return { tone: "new", label: "primeiro registro de preço" } as const;
}

export function priceNarrative(input: DealSignalInput, formatCurrency: (cents: number) => string) {
  if (input.lowestVerified) {
    return `Menor preço entre ${input.observationCount} registros coletados em ${input.historyDays} dias.`;
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
    return `Temos ${input.observationCount} registros de preço em ${input.historyDays} dia${input.historyDays === 1 ? "" : "s"} de acompanhamento.`;
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
