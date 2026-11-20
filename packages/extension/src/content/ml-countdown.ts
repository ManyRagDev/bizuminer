/**
 * Extração de contadores e metadados de Oferta Relâmpago do Mercado Livre.
 * Suporta o DOM do card (.poly-countdown__block com dígitos estáticos ou rollers),
 * o HTML cru do card clicado e o JSON de hidratação da página (period_end e finish_date).
 */

export interface MlCountdownResult {
  promotionType: "lightning";
  remainingSeconds: number;
  promotionEndsAt: string;
}

/**
 * Lê os blocos .poly-countdown__block dentro de um elemento DOM.
 * No Mercado Livre, o contador é formatado como 3 blocos (HH : MM : SS)
 * ou eventualmente 2 blocos (MM : SS), onde cada bloco contém 2
 * .poly-countdown__roller-container (dezena e unidade).
 */
export function extractMlCountdownFromElement(
  container: Element,
  capturedAtMs = Date.now(),
): MlCountdownResult | null {
  const cd = container.querySelector(".poly-component__countdown")
    ?? Array.from(container.querySelectorAll("[class*='countdown']")).find(
      (el) => el.querySelectorAll(".poly-countdown__block").length >= 2,
    );
  const root = cd ?? container;
  const blocks = Array.from(root.querySelectorAll(".poly-countdown__block")).slice(0, 3);
  if (blocks.length !== 2 && blocks.length !== 3) {
    return null;
  }

  const numbers: number[] = [];
  for (const block of blocks) {
    const rollers = Array.from(block.querySelectorAll(".poly-countdown__roller-container"));
    let digits = "";
    if (rollers.length > 0) {
      for (const roller of rollers) {
        const staticDigit = roller.querySelector(".poly-countdown__digit--static");
        const anyDigit = staticDigit ?? roller.querySelector(".poly-countdown__digit");
        const text = (anyDigit?.textContent || "").trim();
        if (/^\d{1,2}$/.test(text)) {
          digits += text;
        }
      }
    } else {
      digits = Array.from(
        block.querySelectorAll(".poly-countdown__digit--static, .poly-countdown__digit"),
      )
        .map((d) => (d.textContent || "").trim())
        .filter((t) => /^\d{1,2}$/.test(t))
        .slice(0, 2)
        .join("");
    }
    if (digits) {
      const val = parseInt(digits, 10);
      if (Number.isFinite(val)) {
        numbers.push(val);
      }
    }
  }

  let sec = 0;
  if (numbers.length === 3) {
    const [h, m, s] = numbers;
    sec = (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0);
  } else if (numbers.length === 2) {
    const [m, s] = numbers;
    sec = (m ?? 0) * 60 + (s ?? 0);
  }

  if (sec <= 0) return null;

  return {
    promotionType: "lightning",
    remainingSeconds: sec,
    promotionEndsAt: new Date(capturedAtMs + sec * 1000).toISOString(),
  };
}

/**
 * Extrai o countdown de um fragmento de string HTML (usado no card-extractor).
 */
export function extractMlCountdownFromHtml(
  html: string,
  capturedAtMs = Date.now(),
): MlCountdownResult | null {
  const cdIdx = html.indexOf("poly-component__countdown");
  const blockIdx = html.indexOf("poly-countdown__block");
  if (cdIdx === -1 && blockIdx === -1) return null;
  const startIdx = cdIdx !== -1 ? cdIdx : blockIdx;
  const slice = html.slice(startIdx, startIdx + 3000);

  const blockMatches = [
    ...slice.matchAll(
      /class="[^"]*poly-countdown__block[^"]*"[\s\S]*?(?=(?:class="[^"]*poly-countdown__block"|<span class="poly-countdown__separator"|<\/div>\s*<\/div>\s*<\/div>|$))/g,
    ),
  ];
  if (blockMatches.length !== 2 && blockMatches.length !== 3) return null;

  const rollerSplitRegex = /class="[^"]*poly-countdown__roller-container[^"]*"/g;
  const digitRegex = /class="[^"]*poly-countdown__digit[^"]*"[^>]*>\s*(\d)\s*<\/span>/;
  const digitAllRegex = /class="[^"]*poly-countdown__digit[^"]*"[^>]*>\s*(\d)\s*<\/span>/g;
  const numbers: number[] = [];
  for (const b of blockMatches) {
    const blockHtml = b[0];
    const rollerParts = blockHtml.split(rollerSplitRegex).slice(1);
    let digits = "";
    if (rollerParts.length > 0) {
      for (const part of rollerParts) {
        const m = digitRegex.exec(part);
        if (m?.[1]) digits += m[1];
      }
    } else {
      digits = [...blockHtml.matchAll(digitAllRegex)]
        .map((m) => m[1])
        .slice(0, 2)
        .join("");
    }
    if (digits) {
      const val = parseInt(digits, 10);
      if (Number.isFinite(val)) numbers.push(val);
    }
  }

  let sec = 0;
  if (numbers.length === 3) {
    const [h, m, s] = numbers;
    sec = (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0);
  } else if (numbers.length === 2) {
    const [m, s] = numbers;
    sec = (m ?? 0) * 60 + (s ?? 0);
  }

  if (sec <= 0) return null;

  return {
    promotionType: "lightning",
    remainingSeconds: sec,
    promotionEndsAt: new Date(capturedAtMs + sec * 1000).toISOString(),
  };
}

/**
 * Busca o period_end ou finish_date no script JSON de hidratação da página
 * do Mercado Livre para o produto específico (MLB...).
 */
export function findMlScriptPeriodEnd(
  doc: Document,
  externalId: string,
  capturedAtMs = Date.now(),
  catalogProductId?: string,
): MlCountdownResult | null {
  if ((!externalId && !catalogProductId) || typeof doc.querySelectorAll !== "function") return null;
  const candidateIds = [externalId, catalogProductId].filter((id): id is string => Boolean(id));
  const scripts = Array.from(doc.querySelectorAll("script"));

  for (const s of scripts) {
    const text = s.textContent || "";
    if (!text.includes("period_end") && !text.includes("finish_date")) continue;

    for (const id of candidateIds) {
      if (!text.includes(id)) continue;

      // 1. Procura no objeto card: de "id":"MLB..." até o próximo "metadata":{"id": (normalmente ~3.200 chars)
      const idToken = `"id":"${id}"`;
      let idIdx = text.indexOf(idToken);
      if (idIdx === -1) idIdx = text.indexOf(id);
      if (idIdx !== -1) {
        const nextCardIdx = text.indexOf('"metadata":{"id":', idIdx + 20);
        const endBound = nextCardIdx !== -1
          ? Math.min(text.length, nextCardIdx, idIdx + 10000)
          : Math.min(text.length, idIdx + 8000);
        const cardSlice = text.slice(idIdx, endBound);
        const m = /"(?:period_end|finish_date)"\s*:\s*"([^"]+)"/.exec(cardSlice);
        if (m?.[1]) {
          const endsMs = Date.parse(m[1]);
          if (Number.isFinite(endsMs) && endsMs > capturedAtMs) {
            return {
              promotionType: "lightning",
              remainingSeconds: Math.round((endsMs - capturedAtMs) / 1000),
              promotionEndsAt: new Date(endsMs).toISOString(),
            };
          }
        }
      }

      // 2. Procura no mapa KVS: "MLB...":{..."lightning_deal_configuration":{"finish_date":"..."}}
      const kvsToken = `"${id}":{`;
      const kvsIdx = text.indexOf(kvsToken);
      if (kvsIdx !== -1) {
        const nextKvsIdx = text.indexOf('},"MLB', kvsIdx + kvsToken.length);
        const kvsBound = nextKvsIdx !== -1
          ? Math.min(text.length, nextKvsIdx + 2, kvsIdx + 2000)
          : Math.min(text.length, kvsIdx + 1500);
        const kvsSlice = text.slice(kvsIdx, kvsBound);
        const m2 = /"(?:finish_date|period_end)"\s*:\s*"([^"]+)"/.exec(kvsSlice);
        if (m2?.[1]) {
          const endsMs = Date.parse(m2[1]);
          if (Number.isFinite(endsMs) && endsMs > capturedAtMs) {
            return {
              promotionType: "lightning",
              remainingSeconds: Math.round((endsMs - capturedAtMs) / 1000),
              promotionEndsAt: new Date(endsMs).toISOString(),
            };
          }
        }
      }
    }
  }
  return null;
}
