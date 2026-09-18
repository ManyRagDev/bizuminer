import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Peças compartilhadas pelas imagens geradas no servidor (Satori / next/og):
 * o card OG de `/bizu/[slug]` e a arte de story de `/api/story/[slug]`.
 *
 * Estavam duplicadas dentro do card OG. Foram extraídas quando a arte de story
 * nasceu porque as três armadilhas abaixo (fonte, `.webp`, corte de texto) não
 * são detalhe de layout — são condições para a imagem existir. Descobrir cada
 * uma de novo, por arte, custa caro: falham em silêncio dentro do pipe da
 * resposta, sem mensagem de erro legível.
 */

export const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });

let fontsPromise: Promise<{ extraBold: Buffer; semiBold: Buffer }> | null = null;

/** Lê as fontes do disco uma única vez por processo; Satori não aceita nome de família do sistema. */
export function loadOgFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      readFile(path.join(process.cwd(), "public/fonts/Manrope-ExtraBold.ttf")),
      readFile(path.join(process.cwd(), "public/fonts/Manrope-SemiBold.ttf")),
    ]).then(([extraBold, semiBold]) => ({ extraBold, semiBold }));
  }
  return fontsPromise;
}

/** Descritor de fontes no formato que `ImageResponse` espera. */
export async function ogFonts() {
  const { extraBold, semiBold } = await loadOgFonts();
  return [
    { name: "Manrope", data: extraBold, weight: 800 as const, style: "normal" as const },
    { name: "Manrope", data: semiBold, weight: 600 as const, style: "normal" as const },
  ];
}

/**
 * Formatos que o Satori decodifica. Qualquer outro entregue ao `<img>` não vira
 * erro: a renderização aborta o stream da resposta e o cliente recebe corpo
 * VAZIO, sem status de erro e sem log. É a falha mais cara do pipeline porque
 * não se parece com falha — por isso a checagem é por allowlist, não por
 * blocklist de `webp`. Formato novo do CDN (avif, jxl) cai fora sozinho.
 */
const SATORI_DECODABLE = ["image/jpeg", "image/png", "image/gif", "image/svg+xml"];

/**
 * Busca a foto do produto com timeout curto. Falhou? A arte sai sem foto —
 * nunca quebra.
 *
 * Dois CDNs, dois problemas de `webp`, e a extensão do arquivo NÃO é
 * confiável em nenhum dos dois:
 *
 * 1. Mercado Livre (mlstatic.com) serve `.webp` na URL. A CDN aceita trocar a
 *    extensão por `.jpg` e devolve JPEG de verdade — confirmado em campo em
 *    20/08/2026.
 * 2. AliExpress (aliexpress-media.com) serve URL `.jpg` mas responde
 *    `image/webp` — e IGNORA o header `Accept`, então não há como pedir outro
 *    formato. Antes disso, TODO card de produto AliExpress saía vazio
 *    (encontrado em 29/08/2026; valia também para o card OG, que já estava
 *    quebrado em produção para essa loja). Só resta transcodificar aqui.
 *
 * A troca de extensão cobre o caso 1; o transcode cobre o caso 2 e qualquer
 * formato futuro que o `sharp` saiba ler. Descartar a foto seria pior que a
 * doença: um story de produto sem produto não vende nada.
 */
export async function fetchProductImage(url: string | null): Promise<string | null> {
  if (!url) return null;
  const jpegUrl = url.endsWith(".webp") ? `${url.slice(0, -".webp".length)}.jpg` : url;
  try {
    const response = await fetch(jpegUrl, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0]!.trim().toLowerCase();
    const buffer = Buffer.from(await response.arrayBuffer());

    if (SATORI_DECODABLE.includes(type)) {
      return `data:${type};base64,${buffer.toString("base64")}`;
    }
    const png = await transcodeToPng(buffer);
    return png && `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Converte para PNG o que o Satori não lê. O `sharp` chega junto com o Next
 * (otimizador de imagem), mas o import é dinâmico e a falha é silenciosa de
 * propósito: se um dia ele sumir do ambiente, o card degrada para "sem foto"
 * em vez de derrubar a rota inteira.
 */
async function transcodeToPng(buffer: Buffer): Promise<Buffer | null> {
  try {
    const { default: sharp } = await import("sharp");
    // Reduz antes de codificar: a arte nunca desenha a foto acima de 680px, e
    // um PNG cru de 1200px vira ~2MB de base64 embutido no HTML do Satori.
    return await sharp(buffer).resize(800, 800, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch {
    return null;
  }
}

/**
 * Satori não recorta texto em N linhas sozinho (`-webkit-line-clamp` não existe
 * lá). Cortar por caractere é o que sobra. Reticências comunicam "tem mais
 * texto"; corte seco no meio da palavra comunica defeito.
 *
 * O `max` é sempre calibrado por layout — depende da largura e do corpo do
 * texto — então quem chama decide, com a conta registrada no local da chamada.
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}
