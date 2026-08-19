/**
 * Dinheiro em centavos.
 *
 * A Shopee devolve preço como string decimal ("29.90") em alguns campos e como
 * número em outros, dependendo da query. Converter para float e multiplicar por
 * 100 introduz erro: 29.90 * 100 === 2989.9999999999995 em ponto flutuante.
 *
 * Por isso a conversão é textual, não aritmética.
 */

/**
 * Converte valor monetário para centavos inteiros.
 * Aceita number, string decimal, string com vírgula ou com separador de milhar.
 * Devolve `undefined` para entrada ausente ou inválida — nunca lança, porque
 * um campo ruim numa oferta não pode derrubar a captura de um lote inteiro.
 */
export function toCents(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    // Arredonda no último passo, uma vez só.
    return Math.round(value * 100);
  }

  if (typeof value !== "string") return undefined;

  const cleaned = value.trim().replace(/\s/g, "");
  if (cleaned === "") return undefined;

  // Normaliza separadores: "1.234,56" (pt-BR) e "1,234.56" (en-US).
  let normalized = cleaned;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = cleaned.length - lastComma - 1;
    normalized = decimals <= 2 ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return undefined;

  const parts = normalized.split(".");
  const intPart = parts[0] ?? "0";
  const fracRaw = parts[1] ?? "";
  const negative = intPart.startsWith("-");
  const digits = negative ? intPart.slice(1) : intPart;

  const frac = (fracRaw + "00").slice(0, 3);
  let cents = Number(digits) * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2] ?? "0") >= 5) cents += 1; // arredonda o terceiro decimal

  if (!Number.isFinite(cents)) return undefined;
  return negative ? -cents : cents;
}

/**
 * Converte taxa para fração 0..1.
 * A Shopee usa "0.15" para 15% em alguns campos e 15 em outros — o limiar
 * de 1 desambigua, já que desconto ou comissão acima de 100% não existe.
 */
export function toRate(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return undefined;
  const rate = n > 1 ? n / 100 : n;
  return rate > 1 ? undefined : rate;
}

/** Formata centavos para exibição em pt-BR. */
export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Timestamp da Shopee vem em segundos epoch. Converte para Date,
 * devolvendo undefined para 0 ou ausente — 0 significa "sem janela".
 */
export function fromEpochSeconds(value: unknown): Date | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return new Date(n * 1000);
}
