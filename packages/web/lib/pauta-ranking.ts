export interface PautaCandidate {
  id: string;
  marketplace: string;
  evidence_observed_at?: string | Date | null;
  previous_min_price_cents?: number | null;
  price_cents: number;
  lowest_verified?: boolean | null;
  rating_star?: number | null;
  claimed_discount_rate?: number | null;
  [key: string]: any;
}

export interface RankPautaOptions {
  now?: Date;
  todayStr?: string;
  limit?: number;
  maxPerMarketplace?: number;
}

function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Ranqueia e seleciona as melhores ofertas para a Pauta diária do WhatsApp e Stories.
 * 
 * Regras:
 * 1. Recência: Produtos capturados ou atualizados nas últimas 24h/48h ganham impulso forte.
 * 2. Queda e Qualidade: Bônus para menor preço histórico comprovado, queda real e boa nota de avaliação.
 * 3. Saneamento: Descontos fantasma (>= 99% sem queda real) são sanados para evitar anomalias de scraping.
 * 4. Diversidade de Lojas: Nenhuma loja pode monopolizar a pauta sozinha (limite por marketplace).
 * 5. Rotatividade Diária: Gera uma variação determinística por dia para circular todo o catálogo aprovado.
 */
export function rankPautaCandidates<T extends PautaCandidate>(
  candidates: T[],
  destination: "stories" | "whatsapp",
  options?: RankPautaOptions,
): T[] {
  if (!candidates.length) return [];

  const limit = options?.limit ?? (destination === "whatsapp" ? 12 : 8);
  const maxPerMarketplace = options?.maxPerMarketplace ?? (destination === "whatsapp" ? 5 : 3);
  const now = options?.now ? options.now.getTime() : Date.now();
  const todayStr = options?.todayStr ?? new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(options?.now ?? new Date());

  const scored = candidates.map((p) => {
    const observedMs = p.evidence_observed_at ? new Date(p.evidence_observed_at).getTime() : 0;
    const ageHours = (now - observedMs) / 3_600_000;

    // 1. Recência
    let recencyScore = 0;
    if (ageHours <= 24) recencyScore = 45;
    else if (ageHours <= 48) recencyScore = 20;

    // 2. Queda real e menor preço auditado
    let dropScore = 0;
    const hasRealDrop = Boolean(p.previous_min_price_cents && p.previous_min_price_cents > p.price_cents);
    if (hasRealDrop) {
      dropScore += 20;
    }
    if (p.lowest_verified) {
      dropScore += 15;
    }

    // 3. Avaliação da loja/produto (0..20)
    const ratingScore = (p.rating_star ?? 4.0) * 4;

    // 4. Desconto declarado com saneamento (anomalias >= 0.99 viram 0.01 se não houver queda real)
    const rawDiscount = p.claimed_discount_rate ?? 0;
    const sanitizedDiscount = rawDiscount >= 0.99 && !hasRealDrop
      ? 0.01
      : Math.min(rawDiscount, 0.80);
    const discountScore = Math.max(0, sanitizedDiscount) * 35; // 0..28

    // 5. Rotação diária determinística
    const dailyJitter = stringHash(`${todayStr}:${p.id}`) % 15;

    const totalScore = recencyScore + dropScore + ratingScore + discountScore + dailyJitter;

    return { product: p, score: totalScore, marketplace: p.marketplace };
  });

  // Ordena por pontuação composta decrescente
  scored.sort((a, b) => b.score - a.score || a.product.id.localeCompare(b.product.id));

  // Aplica diversidade por marketplace
  const selected: T[] = [];
  const mpCounts = new Map<string, number>();

  for (const item of scored) {
    if (selected.length >= limit) break;
    const count = mpCounts.get(item.marketplace) ?? 0;
    if (count < maxPerMarketplace) {
      selected.push(item.product);
      mpCounts.set(item.marketplace, count + 1);
    }
  }

  // Completa as vagas restantes se a cota por marketplace deixar sobras
  if (selected.length < limit) {
    const selectedIds = new Set(selected.map((p) => p.id));
    for (const item of scored) {
      if (selected.length >= limit) break;
      if (!selectedIds.has(item.product.id)) {
        selected.push(item.product);
        selectedIds.add(item.product.id);
      }
    }
  }

  return selected;
}
