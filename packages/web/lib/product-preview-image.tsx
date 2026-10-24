import { ImageResponse } from "next/og";
import type { VitrineProduct } from "./deal-view";
import { marketplaceDef } from "./marketplaces";
import { brl, fetchProductImage, ogFonts, truncate } from "./og-assets";
import { productPreview, PRODUCT_PREVIEW_SIZE } from "./product-preview";

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

/**
 * ~21 caracteres por linha nesta largura/corpo; 63 mantém o título dentro das
 * 3 linhas do bloco. Era 78, que transbordava e virava corte seco — reticências
 * comunicam "tem mais texto", corte no meio da palavra comunica defeito.
 */
const TITLE_MAX_CHARS = 63;

export async function renderProductPreview(deal: VitrineProduct, now = new Date()) {
  const [fonts, photo] = await Promise.all([ogFonts(), fetchProductImage(deal.imageUrl)]);
  const { stale, badge, ageLabel } = productPreview(deal, now);
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
              {truncate(deal.title, TITLE_MAX_CHARS)}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
              {!stale && deal.originalPriceCents !== null && deal.originalPriceCents > deal.priceCents && (
                // Satori não suporta text-decoration (mesmo bug de "fit-content": erro
                // minificado "u2 is not iterable" no pipe da resposta). Sem risco de
                // reintroduzir — o contraste de tamanho/cor já distingue o preço anterior.
                <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: INK_QUIET }}>
                  {brl(deal.originalPriceCents)}
                </div>
              )}
              <div style={{ display: "flex", fontSize: 64, fontWeight: 800, letterSpacing: "-0.03em", color: INK }}>
                {brl(deal.priceCents)}
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
              {stale ? `Última captura ${ageLabel ?? "sem data"} · confira o preço atual` : "Ofertas monitoradas · link de afiliado"}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...PRODUCT_PREVIEW_SIZE,
      fonts,
      headers: {
        "X-BizuMiner-Preview": photo || !deal.imageUrl ? "ready" : "fallback",
      },
    },
  );
}
