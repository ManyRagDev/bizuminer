/**
 * Primitivos de assinatura do TOP (Taobao/AliExpress Open Platform).
 *
 * ESCOPO DESTE ARQUIVO: apenas as peças que são **fato conhecido** do
 * esquema TOP — ordenar parâmetros por ASCII, concatenar como `k+v`, e
 * derivar o hash. O que ainda NÃO se sabe (qual gateway, qual formato de
 * timestamp, se o segredo envolve a base ou vira chave HMAC, se o caminho
 * prefixa a string) é justamente o que `bin/aliexpress-probe.ts` resolve
 * empiricamente contra a API real.
 *
 * Por isso aqui não há uma função `sign()` única e opinativa: há as duas
 * variantes de hash, e quem escolhe é a espiga. Quando a API disser qual
 * está certa, o adapter (M5) passa a chamar só aquela.
 *
 * Ver `docs/tecnico/plano-multiplataforma.md` §M5.
 */

import { createHash, createHmac } from "node:crypto";

/**
 * Timestamp do TOP legado: `yyyy-MM-dd HH:mm:ss` no fuso **GMT+8**
 * (horário de Pequim), não no fuso local nem em UTC.
 *
 * Errar isto é traiçoeiro: a requisição não falha com "timestamp errado",
 * falha com "assinatura inválida" — porque o timestamp entra na string
 * assinada. Aí se perde o dia depurando o algoritmo de hash, que está certo.
 */
export function datetimeGmt8(now: Date = new Date()): string {
  const gmt8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${gmt8.getUTCFullYear()}-${p(gmt8.getUTCMonth() + 1)}-${p(gmt8.getUTCDate())} ` +
    `${p(gmt8.getUTCHours())}:${p(gmt8.getUTCMinutes())}:${p(gmt8.getUTCSeconds())}`
  );
}

/**
 * String base do TOP: chaves ordenadas por ASCII, concatenadas como `k+v`,
 * **sem separador algum** entre pares.
 *
 * `pathPrefix` existe porque o gateway mais novo (`/rest`) prefixa a base
 * com o caminho da API. No gateway clássico (`/sync`) o prefixo é vazio.
 */
export function baseString(params: Readonly<Record<string, string>>, pathPrefix = ""): string {
  const sorted = Object.keys(params).sort();
  let out = pathPrefix;
  for (const key of sorted) out += key + params[key];
  return out;
}

/**
 * Variante MD5 do TOP: o segredo **envolve** a base dos dois lados.
 * `MD5(secret + base + secret)`, hexadecimal maiúsculo.
 */
export function signMd5Wrapped(base: string, secret: string): string {
  return createHash("md5").update(secret + base + secret, "utf8").digest("hex").toUpperCase();
}

/** Variante HMAC-SHA256: o segredo é a chave, não parte da mensagem. */
export function signHmacSha256(base: string, secret: string): string {
  return createHmac("sha256", secret).update(base, "utf8").digest("hex").toUpperCase();
}
