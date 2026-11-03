"use client";

import { useState } from "react";
import Image from "next/image";
import AdminLink from "../_components/admin-link.tsx";
import type { WorkspaceOffer } from "../../lib/affiliate-workspace-contract.ts";
import { offerPriceLabel } from "../../lib/offer-price.ts";
import { copyToClipboard } from "../../lib/clipboard.ts";
import {
  extractCopyData,
  generateOfferCopy,
  buildPostSparkPrompt,
  formatPriceBRL,
  type CopyTone,
} from "../../lib/copy-styles.ts";

interface Props {
  offer: WorkspaceOffer;
  defaultTone?: CopyTone;
}

export default function OfertaCard({ offer, defaultTone = "relampago" }: Props) {
  const [tone, setTone] = useState<CopyTone>(defaultTone);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [showPromptMenu, setShowPromptMenu] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const c = offer.candidate;
  const data = extractCopyData(offer);

  const handleCopyWhatsApp = async () => {
    const text = generateOfferCopy(data, tone);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedType("whatsapp");
      setTimeout(() => setCopiedType(null), 2000);
    }
  };

  const handleCopyPrompt = async (format: "static" | "carousel") => {
    const promptText = buildPostSparkPrompt(data, format);
    const ok = await copyToClipboard(promptText);
    if (ok) {
      setCopiedType(format === "static" ? "prompt_static" : "prompt_carousel");
      setShowPromptMenu(false);
      setTimeout(() => setCopiedType(null), 2500);
    }
  };

  const mpName =
    c.marketplace === "mercadolivre"
      ? "Mercado Livre"
      : c.marketplace === "shopee"
        ? "Shopee"
        : "AliExpress";

  const diffPct =
    c.previousMinPriceCents && c.previousMinPriceCents > c.priceCents
      ? Math.round(((c.previousMinPriceCents - c.priceCents) / c.previousMinPriceCents) * 100)
      : null;

  return (
    <article className="bm-card bm-interactive-offer-card" key={c.id}>
      {/* Top Media & Badges */}
      <div className="bm-card-media-wrapper">
        {c.imageUrl ? (
          <Image
            className="bm-offer-image"
            src={c.imageUrl}
            alt=""
            width={280}
            height={170}
            unoptimized
          />
        ) : (
          <div className="bm-offer-image-placeholder">Sem imagem</div>
        )}

        <div className="bm-card-floating-badges">
          <span className={`bm-store-badge ${c.marketplace}`}>{mpName}</span>
          {(offer.watchersCount ?? 0) > 0 && (
            <span className="bm-demand-badge" title="Compradores com alerta ativo neste produto">
              🎯 {offer.watchersCount} de olho
            </span>
          )}
        </div>
      </div>

      {/* Product Title and Price */}
      <div className="bm-card-header">
        <h3 title={c.displayTitle ?? c.title}>
          {c.displayTitle ?? c.title}
        </h3>

        <div className="bm-price-row">
          <strong className="bm-price">{offerPriceLabel(c)}</strong>
          {diffPct && (
            <span className="bm-discount-pill">-{diffPct}% real</span>
          )}
        </div>

        {c.previousMinPriceCents && c.previousMinPriceCents > c.priceCents && (
          <p className="bm-price-history">
            Menor antes: <s>{formatPriceBRL(c.previousMinPriceCents)}</s>
          </p>
        )}
      </div>

      {/* Benefit and Caveat */}
      <div className="bm-editorial-brief">
        {data.benefit && (
          <p className="bm-benefit">
            <b>Bizu:</b> {data.benefit}
          </p>
        )}
        {data.caveat && (
          <p className="bm-caveat">
            <b>Ressalva:</b> {data.caveat}
          </p>
        )}
      </div>

      {/* Bio Code Badge */}
      {offer.bioCode && (
        <div className="bm-bio-code-row">
          <span>Código para a bio: <b>{offer.bioCode}</b></span>
        </div>
      )}

      {/* Tone Selection Pills */}
      <div className="bm-tone-bar">
        <span className="bm-tone-label">Tom:</span>
        <button
          type="button"
          className={`bm-tone-pill ${tone === "relampago" ? "active" : ""}`}
          onClick={() => setTone("relampago")}
          title="Foco em urgência honesta e menor preço"
        >
          🔥 Relâmpago
        </button>
        <button
          type="button"
          className={`bm-tone-pill ${tone === "sincero" ? "active" : ""}`}
          onClick={() => setTone("sincero")}
          title="Foco em autoridade, prós e ressalvas transparentes"
        >
          🤝 Sincero
        </button>
        <button
          type="button"
          className={`bm-tone-pill ${tone === "direto" ? "active" : ""}`}
          onClick={() => setTone("direto")}
          title="Curto e objetivo para grupos rápidos"
        >
          ⚡ Curto
        </button>
      </div>

      {/* Optional Preview Toggle */}
      <div className="bm-preview-toggle">
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="bm-link-button"
        >
          {showPreview ? "Ocultar prévia do texto ▲" : "Ver prévia do texto ▼"}
        </button>
        {showPreview && (
          <pre className="bm-copy-preview">
            {generateOfferCopy(data, tone)}
          </pre>
        )}
      </div>

      {/* Main 1-Click Action Buttons */}
      <div className="bm-card-actions-grid">
        <button
          type="button"
          className="bm-button bm-copy-btn"
          onClick={handleCopyWhatsApp}
        >
          {copiedType === "whatsapp" ? "✓ Copiado!" : "📋 Copiar WhatsApp"}
        </button>

        {offer.storyUrl && (
          <a
            className="bm-button secondary bm-story-btn"
            href={offer.storyUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir imagem 9:16 pronta para o Story do Instagram"
          >
            📸 Story
          </a>
        )}

        {/* Prompt PostSpark Button with Dropdown */}
        <div className="bm-postspark-wrapper">
          <button
            type="button"
            className="bm-button secondary bm-spark-btn"
            onClick={() => setShowPromptMenu((v) => !v)}
            title="Copiar prompt pronto e calibrado para o PostSpark 3"
          >
            {copiedType?.startsWith("prompt") ? "✓ Prompt Copiado!" : "✨ PostSpark ▾"}
          </button>

          {showPromptMenu && (
            <div className="bm-prompt-dropdown">
              <button
                type="button"
                onClick={() => handleCopyPrompt("static")}
              >
                🖼️ Post Único (5:6)
              </button>
              <button
                type="button"
                onClick={() => handleCopyPrompt("carousel")}
              >
                📑 Carrossel (5 slides)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer Secondary Links */}
      <div className="bm-card-footer">
        <a
          href={c.productUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="bm-footer-link"
        >
          Ver na loja ↗
        </a>
        <AdminLink
          href={`/admin/divulgacoes/nova?produto=${c.id}&canal=whatsapp`}
          className="bm-footer-link bm-customize"
          title="Abrir editor completo se quiser personalizar ou salvar rascunho"
        >
          ✏️ Personalizar rascunho
        </AdminLink>
      </div>
    </article>
  );
}
