/**
 * Helpers para formatação e controle de vigência de Ofertas Relâmpago (Track 024).
 * Preserva o fuso horário oficial de Brasília (America/Sao_Paulo).
 */

export function isFlashSaleActive(
  promotionType?: string,
  promotionEndsAt?: string | null,
  nowMs = Date.now(),
): boolean {
  if (promotionType !== "lightning" || !promotionEndsAt) return false;
  const endsMs = Date.parse(promotionEndsAt);
  return Number.isFinite(endsMs) && endsMs > nowMs;
}

/** Formata a hora no fuso de Brasília, ex: "23:59" */
export function formatFlashSaleTime(isoString: string): string {
  const d = new Date(isoString);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Retorna o rótulo de validade relativo ao dia atual (em America/Sao_Paulo).
 * Ex: "válido hoje até às 23:59" ou "válido até amanhã às 02:30".
 */
export function formatFlashSaleDeadline(
  isoString: string,
  nowMs = Date.now(),
): string | null {
  const d = new Date(isoString);
  if (!Number.isFinite(d.getTime()) || d.getTime() <= nowMs) return null;
  const time = formatFlashSaleTime(isoString);
  const nowDay = new Date(nowMs).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  const deadlineDay = d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  if (nowDay === deadlineDay) {
    return `válido hoje até às ${time}`;
  }
  return `válido até amanhã às ${time}`;
}

/**
 * Retorna o tempo restante amigável: "faltam 3h 40m" ou "faltam 25m".
 */
export function formatFlashSaleRemaining(
  isoString: string,
  nowMs = Date.now(),
): string | null {
  const endsMs = Date.parse(isoString);
  if (!Number.isFinite(endsMs) || endsMs <= nowMs) return null;
  const diffSec = Math.floor((endsMs - nowMs) / 1000);
  const hours = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);

  if (hours > 0) {
    return `faltam ${hours}h ${mins}m`;
  }
  return `faltam ${Math.max(1, mins)}m`;
}
