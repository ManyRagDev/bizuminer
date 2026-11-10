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

/**
 * Um preço só pode ser apresentado como "atual" enquanto a observação que o
 * sustenta é recente. Passado esse limite ele vira referência ("visto por R$X
 * há N dias"); além da janela de presença (RECENT_WINDOW_DAYS) some da vitrine.
 * Dois limiares, não um: a severidade da promessa acompanha a idade do dado.
 * Parâmetro registrado; trocar exige o dono.
 */
export const PRICE_CURRENT_WINDOW_HOURS = 48;

export type PriceFreshness = "current" | "stale";

export function priceFreshness(value: Date | string | null, now = new Date()): PriceFreshness {
  if (!value) return "stale";
  const ageHours = (now.getTime() - new Date(value).getTime()) / 3_600_000;
  return ageHours <= PRICE_CURRENT_WINDOW_HOURS ? "current" : "stale";
}

/** Sufixo temporal para referência: "agora", "há 5 min", "há 3 h", "há 2 dias". */
export function seenAgo(value: Date | string | null, now = new Date()): string | null {
  if (!value) return null;
  const date = new Date(value);
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 2) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} dia${days === 1 ? "" : "s"}`;
}

export type FreshnessStatusLevel = "fresh" | "warm" | "stale";

export interface FreshnessStatus {
  level: FreshnessStatusLevel;
  label: string;
  badgeLabel: string;
  ageHours: number;
}

/**
 * Avalia o nível de frescor do preço/evidência de uma oferta para a pauta.
 * - fresh: coletado há menos de 3h e no mesmo dia (São Paulo) -> verde
 * - warm: coletado entre 3h e 10h e no mesmo dia -> amarelo
 * - stale: coletado há mais de 10h OU virou o dia (meia-noite) -> vermelho/laranja
 */
export function evaluateFreshnessStatus(
  value: Date | string | null,
  now = new Date()
): FreshnessStatus {
  if (!value) {
    return {
      level: "stale",
      label: "sem data",
      badgeLabel: "Expirando (>10h)",
      ageHours: Infinity,
    };
  }

  const date = new Date(value);
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const ageHours = diffMs / 3_600_000;
  const minutes = Math.floor(diffMs / 60_000);

  // Cruzou virada do dia em horário de Brasília (America/Sao_Paulo)?
  const isDifferentDay =
    date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) !==
    now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  let timeText = "";
  if (minutes < 2) {
    timeText = "agora";
  } else if (minutes < 60) {
    timeText = `há ${minutes} min`;
  } else {
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      timeText = `há ${hours} h`;
    } else {
      const days = Math.floor(hours / 24);
      timeText = `há ${days} dia${days === 1 ? "" : "s"}`;
    }
  }

  // Menos de 3 horas é sempre fresco (mesmo que tenha acabado de cruzar a meia-noite)
  if (ageHours < 3) {
    return {
      level: "fresh",
      label: `coletado ${timeText}`,
      badgeLabel: "Fresco (<3h)",
      ageHours,
    };
  }

  // Se cruzou a virada do dia ou tem mais de 10h -> stale
  if (isDifferentDay || ageHours > 10) {
    return {
      level: "stale",
      label: isDifferentDay && ageHours <= 24 ? `coletado ontem (${timeText})` : `coletado ${timeText}`,
      badgeLabel: isDifferentDay ? "Virou o dia" : "Expirando (>10h)",
      ageHours,
    };
  }

  return {
    level: "warm",
    label: `coletado ${timeText}`,
    badgeLabel: "Atenção (3-10h)",
    ageHours,
  };
}
