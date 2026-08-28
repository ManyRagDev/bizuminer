import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { dealDetail } from "../../../lib/db";
import { priceHighlight } from "../../../lib/deal-signal";
import { marketplaceDef } from "../../../lib/marketplaces";

export const runtime = "nodejs";
export const alt = "BizuMiner";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Params = { slug: string };

// Paleta fixa (tema claro de globals.css): o card é uma imagem estática, sem
// contexto de tema do visitante — usa sempre a identidade de superfície clara.
const PAPER = "#f3f0e8";
const PAPER_DEEP = "#e6e0d3";
const SURFACE_BRIGHT = "#ffffff";
const INK = "#151515";
const INK_MUTED = "#5f5c55";
const INK_QUIET = "#6b6b6b";
const BLUE = "#2563eb";
const BLUE_TEXT = "#1d4ed8";
const LINE = "rgba(21, 21, 21, 0.18)";

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });

let fontsPromise: Promise<{ extraBold: Buffer; semiBold: Buffer }> | null = null;

function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      readFile(path.join(process.cwd(), "public/fonts/Manrope-ExtraBold.ttf")),
      readFile(path.join(process.cwd(), "public/fonts/Manrope-SemiBold.ttf")),
    ]).then(([extraBold, semiBold]) => ({ extraBold, semiBold }));
  }
  return fontsPromise;
}

/**
 * Busca a foto do produto com timeout curto. Falhou? O card sai sem foto —
 * nunca quebra.
 *
 * O CDN do Mercado Livre (mlstatic.com) serve `.webp` por padrão, formato que
 * o Satori (motor de imagem do next/og) não decodifica — falha em silêncio
 * dentro do pipe da resposta, sem mensagem de erro legível. A própria CDN
 * aceita trocar a extensão por `.jpg` na mesma URL e devolve JPEG de verdade;
 * confirmado em campo em 20/08/2026.
 */
async function fetchProductImage(url: string | null): Promise<string | null> {
  if (!url) return null;
  const jpegUrl = url.endsWith(".webp") ? `${url.slice(0, -".webp".length)}.jpg` : url;
  try {
    const response = await fetch(jpegUrl, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const type = response.headers.get("content-type") ?? "image/jpeg";
    return `data:${type};base64,${Buffer.from(buffer).toString("base64")}`;
  } catch {
    return null;
  }
}

// Satori não recorta texto em N linhas sozinho; corta o título por caractere
// para não estourar o card. Largura generosa o bastante para não cortar cedo
// demais em títulos curtos comuns do catálogo.
/**
 * ~21 caracteres por linha nesta largura/corpo; 63 mantém o título dentro das
 * 3 linhas do bloco. Era 78, que transbordava e virava corte seco — reticências
 * comunicam "tem mais texto", corte no meio da palavra comunica defeito.
 */
function truncateTitle(title: string, max = 63): string {
  if (title.length <= max) return title;
  return `${title.slice(0, max).trimEnd()}…`;
}

export default async function Image({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const { extraBold, semiBold } = await loadFonts();
  const fonts = [
    { name: "Manrope", data: extraBold, weight: 800 as const, style: "normal" as const },
    { name: "Manrope", data: semiBold, weight: 600 as const, style: "normal" as const },
  ];

  const detail = await dealDetail(slug);

  if (!detail) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: PAPER,
            fontFamily: "Manrope",
          }}
        >
          <div style={{ display: "flex", fontSize: 72, fontWeight: 800, letterSpacing: "-0.04em", color: INK }}>
            Bizu<span style={{ color: BLUE_TEXT }}>Miner</span>
          </div>
          <div style={{ display: "flex", marginTop: 20, fontSize: 26, fontWeight: 600, color: INK_MUTED }}>
            Um bizu bom vale ouro.
          </div>
        </div>
      ),
      { ...size, fonts },
    );
  }

  const { deal } = detail;
  const highlight = priceHighlight({
    priceCents: deal.price_cents,
    previousMinPriceCents: deal.previous_min_price_cents,
    observationCount: deal.observation_count,
    historyDays: deal.history_days,
    lowestVerified: deal.lowest_verified,
  });
  // Card não repete "ainda sem histórico" — silêncio é o padrão quando não há
  // o que afirmar; um selo negativo num card de divulgação só ocupa espaço.
  const badge = highlight?.tone === "unproven" ? null : highlight;
  const photo = await fetchProductImage(deal.image_url);
  const marketplace = marketplaceDef(deal.marketplace);
  const stamp = marketplace
    ? { label: marketplace.stampLabel, style: marketplace.stampStyle }
    : { label: deal.marketplace, style: "outlined" as const };

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: PAPER, fontFamily: "Manrope" }}>
        <div
          style={{
            width: 480,
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: SURFACE_BRIGHT,
            borderRight: `1px solid ${LINE}`,
          }}
        >
          {photo ? (
            <img src={photo} width={400} height={400} style={{ objectFit: "contain" }} />
          ) : (
            <div
              style={{
                display: "flex",
                width: 200,
                height: 200,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: PAPER_DEEP,
                fontSize: 88,
                fontWeight: 800,
                color: BLUE_TEXT,
              }}
            >
              B
            </div>
          )}
        </div>
        <div style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 64px" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* Marca à esquerda, origem à direita, mesma linha: a loja é lida
                ANTES do título. Mesmo carimbo do card do site — preenchido
                para o Mercado Livre, vazado para a Shopee — e a diferença é
                estrutural, nunca de cor (a cor aqui já significa confiança). */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", color: INK }}>
                Bizu<span style={{ color: BLUE_TEXT }}>Miner</span>
              </div>
              {stamp && (
                <div
                  style={{
                    display: "flex",
                    padding: "8px 14px",
                    fontSize: 20,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    border: `2px solid ${INK}`,
                    backgroundColor: stamp.style === "filled" ? INK : SURFACE_BRIGHT,
                    color: stamp.style === "filled" ? SURFACE_BRIGHT : INK,
                  }}
                >
                  {stamp.label}
                </div>
              )}
            </div>
            {badge && (
              <div
                style={{
                  display: "flex",
                  alignSelf: "flex-start",
                  marginBottom: 24,
                  padding: "10px 16px",
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                  textTransform: "uppercase",
                  border: `2px solid ${BLUE}`,
                  color: badge.tone === "verified" ? "#ffffff" : BLUE_TEXT,
                  backgroundColor: badge.tone === "verified" ? BLUE : SURFACE_BRIGHT,
                }}
              >
                {badge.label}
              </div>
            )}
            <div
              style={{
                display: "flex",
                // 3 linhas EXATAS (50px × 1.08 = 54px cada). Antes era 132px,
                // que dá 2,44 linhas: a terceira era fatiada ao meio da altura
                // das letras e o card compartilhado parecia quebrado. Múltiplo
                // do line-height faz o corte cair sempre no limite da linha.
                maxHeight: 162,
                overflow: "hidden",
                fontSize: 50,
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: "-0.02em",
                color: INK,
              }}
            >
              {truncateTitle(deal.title)}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
              {deal.original_price_cents !== null && deal.original_price_cents > deal.price_cents && (
                // Satori não suporta text-decoration (mesmo bug de "fit-content": erro
                // minificado "u2 is not iterable" no pipe da resposta). Sem risco de
                // reintroduzir — o contraste de tamanho/cor já distingue o preço anterior.
                <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: INK_QUIET }}>
                  {brl(deal.original_price_cents)}
                </div>
              )}
              <div style={{ display: "flex", fontSize: 64, fontWeight: 800, letterSpacing: "-0.03em", color: INK }}>
                {brl(deal.price_cents)}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 20,
                paddingTop: 20,
                borderTop: `1px solid ${LINE}`,
                fontSize: 18,
                fontWeight: 600,
                color: INK_MUTED,
              }}
            >
              Ofertas monitoradas · link de afiliado
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
