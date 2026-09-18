import { ImageResponse } from "next/og";
import { dealDetail } from "../../../../lib/db";
import { priceHighlight } from "../../../../lib/deal-signal";
import { marketplaceDef } from "../../../../lib/marketplaces";
import { brl, fetchProductImage, ogFonts, truncate } from "../../../../lib/og-assets";
import { storyLinkLabel } from "../../../../lib/story-link";

export const runtime = "nodejs";

/**
 * Arte pronta para o status do WhatsApp: 1080×1920 gerada no servidor a partir
 * dos dados que já temos do produto.
 *
 * POR QUE EXISTE
 *
 * Postar um produto no status hoje custa ~90s de trabalho manual (print,
 * recorte, editor, digitar preço, colar link). Não há como automatizar a
 * postagem — nem a API oficial do WhatsApp (Cloud API) expõe endpoint de
 * Status; nenhuma via legítima expõe. O que dá para eliminar é a PREPARAÇÃO.
 * Com a arte pronta, o fluxo vira `navigator.share({ files })` a partir do
 * celular: Compartilhar → WhatsApp → Meu status.
 *
 * É a mesma família do card OG de `/bizu/[slug]`, com três diferenças que vêm
 * do meio, não de gosto: retrato em vez de paisagem, área segura (abaixo) e o
 * link impresso na própria imagem.
 */
const SIZE = { width: 1080, height: 1920 };

/**
 * ÁREA SEGURA DO STATUS
 *
 * O WhatsApp desenha por cima da imagem: no topo a barra de progresso e o
 * autor (~240px), embaixo a legenda e o campo "responder" (~320px). Conteúdo
 * colocado nessas faixas é coberto — e o que some primeiro é justamente o
 * preço ou o link, que é o que precisa ser lido.
 *
 * Margens com folga sobre a medida real porque a altura da sobreposição varia
 * com o aparelho (notch, barra de gestos) e com a versão do app. Perder 100px
 * de imagem custa nada; perder o link custa a conversão inteira.
 */
const SAFE_TOP = 300;
const SAFE_BOTTOM = 380;
const SIDE = 72;

// Paleta fixa (tema claro de globals.css): a arte é uma imagem estática, sem
// contexto de tema de quem vê — usa sempre a identidade de superfície clara.
const PAPER = "#f3f0e8";
const PAPER_DEEP = "#e6e0d3";
const SURFACE_BRIGHT = "#ffffff";
const INK = "#151515";
const INK_MUTED = "#5f5c55";
const INK_QUIET = "#6b6b6b";
const BLUE = "#2563eb";
const BLUE_TEXT = "#1d4ed8";
const LINE = "rgba(21, 21, 21, 0.18)";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const fonts = await ogFonts();
  const detail = await dealDetail(slug);

  if (!detail) {
    return new ImageResponse(<Fallback />, { ...SIZE, fonts });
  }

  const { deal } = detail;
  const highlight = priceHighlight({
    priceCents: deal.price_cents,
    previousMinPriceCents: deal.previous_min_price_cents,
    observationCount: deal.observation_count,
    historyDays: deal.history_days,
    lowestVerified: deal.lowest_verified,
  });
  // Mesma regra do card OG: "ainda sem histórico" é selo negativo, e um selo
  // negativo numa peça de divulgação só ocupa espaço. Silêncio é o padrão.
  const badge = highlight?.tone === "unproven" ? null : highlight;
  const photo = await fetchProductImage(deal.image_url);
  const marketplace = marketplaceDef(deal.marketplace);
  const stamp = marketplace
    ? { label: marketplace.stampLabel, style: marketplace.stampStyle }
    : { label: deal.marketplace, style: "outlined" as const };

  const hasReference = deal.original_price_cents !== null && deal.original_price_cents > deal.price_cents;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: `${SAFE_TOP}px ${SIDE}px ${SAFE_BOTTOM}px`,
          backgroundColor: PAPER,
          fontFamily: "Manrope",
        }}
      >
        {/* Marca à esquerda, origem à direita: a loja é lida ANTES do título.
            Mesmo carimbo do site — preenchido para o Mercado Livre, vazado
            para a Shopee — e a diferença é estrutural, nunca de cor, porque
            aqui a cor já significa confiança. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 46, fontWeight: 800, letterSpacing: "-0.03em", color: INK }}>
            Bizu<span style={{ color: BLUE_TEXT }}>Miner</span>
          </div>
          <div
            style={{
              display: "flex",
              padding: "12px 20px",
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              // Preenchido / vazado / tracejado: três degraus ESTRUTURAIS, nunca
              // de matiz. Aqui a cor já significa confiança (azul = evidência
              // nossa), e diferença tonal não sobreviveria nem ao daltonismo nem
              // à inversão de tema. Renderizar `dashed` como sólido colapsaria a
              // AliExpress na Shopee — as duas viram "vazado" e o carimbo mente.
              border: `3px ${stamp.style === "dashed" ? "dashed" : "solid"} ${INK}`,
              backgroundColor: stamp.style === "filled" ? INK : SURFACE_BRIGHT,
              color: stamp.style === "filled" ? SURFACE_BRIGHT : INK,
            }}
          >
            {stamp.label}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            width: "100%",
            height: 760,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: SURFACE_BRIGHT,
            border: `1px solid ${LINE}`,
          }}
        >
          {photo ? (
            <img src={photo} width={680} height={680} style={{ objectFit: "contain" }} />
          ) : (
            <div
              style={{
                display: "flex",
                width: 260,
                height: 260,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: PAPER_DEEP,
                fontSize: 120,
                fontWeight: 800,
                color: BLUE_TEXT,
              }}
            >
              B
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {badge && (
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                marginBottom: 24,
                padding: "12px 20px",
                fontSize: 28,
                fontWeight: 600,
                letterSpacing: "0.02em",
                textTransform: "uppercase",
                border: `3px solid ${BLUE}`,
                color: badge.tone === "verified" ? SURFACE_BRIGHT : BLUE_TEXT,
                backgroundColor: badge.tone === "verified" ? BLUE : SURFACE_BRIGHT,
              }}
            >
              {badge.label}
            </div>
          )}
          {/* 2 linhas EXATAS (44px × 1.1 = 48.4px cada; 97 = 2 × 48.4). Múltiplo
              do line-height faz o corte cair no limite da linha em vez de
              fatiar letras ao meio. ~26 caracteres por linha nesta largura. */}
          <div
            style={{
              display: "flex",
              maxHeight: 97,
              overflow: "hidden",
              fontSize: 44,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              color: INK,
            }}
          >
            {truncate(deal.title, 52)}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* Satori não suporta `text-decoration` (erro minificado "u2 is not
              iterable" no pipe da resposta), então o preço anterior não pode
              ser riscado. A preposição "de" resolve melhor que o risco: diz
              explicitamente que aquele valor é o ponto de partida, e sobrevive
              a ser lido de longe, que é como um story é visto. */}
          {hasReference && (
            <div style={{ display: "flex", fontSize: 34, fontWeight: 600, color: INK_QUIET }}>
              de {brl(deal.original_price_cents!)}
            </div>
          )}
          <div style={{ display: "flex", marginTop: 4, fontSize: 104, fontWeight: 800, letterSpacing: "-0.03em", color: INK }}>
            {brl(deal.price_cents)}
          </div>

          {/* O LINK IMPRESSO NA ARTE
              A legenda do status leva o link clicável, mas o WhatsApp às vezes
              descarta o texto quando o compartilhamento traz arquivo. Se isso
              acontecer e o link só existir na legenda, o story fica bonito e
              inútil. Impresso aqui ele sempre existe — e como ninguém copia
              texto de imagem, precisa ser curto o bastante para ser DIGITADO. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 28,
              paddingTop: 24,
              borderTop: `1px solid ${LINE}`,
            }}
          >
            <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: "-0.01em", color: BLUE_TEXT }}>
              {storyLinkLabel()}
            </div>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 600, color: INK_MUTED }}>
              link de afiliado
            </div>
          </div>
        </div>
      </div>
    ),
    { ...SIZE, fonts },
  );
}

/** Produto inexistente: a arte não quebra, vira capa da marca. */
function Fallback() {
  return (
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
      <div style={{ display: "flex", fontSize: 96, fontWeight: 800, letterSpacing: "-0.04em", color: INK }}>
        Bizu<span style={{ color: BLUE_TEXT }}>Miner</span>
      </div>
      <div style={{ display: "flex", marginTop: 28, fontSize: 36, fontWeight: 600, color: INK_MUTED }}>
        Um bizu bom vale ouro.
      </div>
    </div>
  );
}
