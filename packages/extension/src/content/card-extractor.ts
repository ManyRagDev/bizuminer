/**
 * Extração pura de card do Mercado Livre (E5). Recebe o HTML de UM card e
 * devolve o payload normalizado — sem rede, sem chrome. O content script lê o
 * `outerHTML` do card clicado e chama `extractCard`.
 *
 * Regra de ouro (§4 do doc de engenharia reversa): usar o href REAL do card,
 * nunca construir permalink. Preço vem do aria-label, não de concatenação
 * visual. Card incompleto devolve `null` (o botão oferece "Abrir produto").
 */

export interface ExtractedCard {
  externalId: string;
  title: string;
  productUrl: string;
  imageUrl?: string;
  priceCents: number;
  originalPriceCents?: number;
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
  let decoded = value;
  for (let pass = 0; pass < 3; pass++) {
    const next = decoded.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, (entity, body: string) => {
      if (body.startsWith("#x")) {
        const cp = Number.parseInt(body.slice(2), 16);
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : entity;
      }
      if (body.startsWith("#")) {
        const cp = Number.parseInt(body.slice(1), 10);
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : entity;
      }
      return named[body.toLowerCase()] ?? entity;
    });
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function parseMoneyAria(label: string): { reais: number; centavos: number } | null {
  const m = /(\d[\d.]*)\s*reais(?:\s+com\s+(\d{1,2})\s*centavos)?/.exec(label);
  if (!m) return null;
  const reais = Number(m[1]!.replace(/\./g, ""));
  if (!Number.isFinite(reais)) return null;
  return { reais, centavos: m[2] ? Number(m[2]) : 0 };
}

/** Extrai o card de um trecho de HTML. null = card incompleto (usar PDP). */
export function extractCard(html: string): ExtractedCard | null {
  const anchor =
    /<a\s+href="([^"]+)"[^>]*class="[^"]*poly-component__title[^"]*"[^>]*>([^<]+)</.exec(html);
  const titleAlt = /class="[^"]*poly-component__title[^"]*"[^>]*>([^<]+)</.exec(html);
  const href = anchor?.[1]?.replace(/&amp;/g, "&");
  const title = (anchor?.[2] ?? titleAlt?.[1]) ? decodeHtmlEntities((anchor?.[2] ?? titleAlt?.[1])!.trim()) : undefined;
  if (!href || !title) return null;

  let url: URL;
  try {
    url = new URL(href, "https://www.mercadolivre.com.br");
  } catch {
    return null;
  }

  const externalId = url.searchParams.get("wid") ?? url.pathname.match(/(MLB\d{6,})/)?.[1];
  if (!externalId) return null;

  // href REAL, limpo de query/fragment de tracking (a afiliação entra no servidor).
  const productUrl = `${url.origin}${url.pathname}`;

  const currentSection = html.slice(html.indexOf("poly-price__current"));
  const currentLabel = /aria-label="(?!Antes:)([^"]*?reais[^"]*?)"/.exec(currentSection)?.[1];
  const current = currentLabel ? parseMoneyAria(currentLabel) : null;
  if (!current) return null;
  const priceCents = current.reais * 100 + current.centavos;
  if (priceCents <= 0) return null;

  const previousLabel = /aria-label="Antes:\s*([^"]*?reais[^"]*?)"/.exec(html)?.[1];
  const previous = previousLabel ? parseMoneyAria(previousLabel) : null;
  const originalPriceCents =
    previous && previous.reais > 0 ? previous.reais * 100 + previous.centavos : undefined;

  const imageUrl = /<img[^>]+src="(https:\/\/http2\.mlstatic\.com\/[^"]+)"/.exec(html)?.[1];

  return {
    externalId,
    title,
    productUrl,
    imageUrl,
    priceCents,
    originalPriceCents: originalPriceCents && originalPriceCents > priceCents ? originalPriceCents : undefined,
  };
}
