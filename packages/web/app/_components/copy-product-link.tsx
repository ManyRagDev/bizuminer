"use client";

import { optionDetailPath } from "../../lib/offer-option.ts";
import { useEffect, useRef, useState } from "react";
import { copyToClipboard } from "../../lib/clipboard";
import { productShareUrl } from "../../lib/product-share";
import { createPreviewWarmer } from "../../lib/product-preview-warmup";

export default function CopyProductLink({ slug, title, previewUrl,optionKey }: { optionKey?:string;slug: string; title: string; previewUrl?: string }) {
  const [copied, setCopied] = useState(false);
  const previewWarmer = useRef<ReturnType<typeof createPreviewWarmer> | null>(null);

  useEffect(() => {
    if (!previewUrl) return;
    const warmer = createPreviewWarmer();
    previewWarmer.current = warmer;
    void warmer.warm(previewUrl);
    return () => {
      warmer.dispose();
      if (previewWarmer.current === warmer) previewWarmer.current = null;
    };
  }, [previewUrl]);

  async function copy() {
    if (previewUrl) void previewWarmer.current?.warm(previewUrl, true);
    const url = optionKey ? new URL(optionDetailPath(slug,optionKey),productShareUrl(slug)).href : productShareUrl(slug);
    const ok = await copyToClipboard(url);
    if (!ok) {
      window.prompt("Copie o link do produto:", url);
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return <button type="button" className="copy-product-link" aria-label={`Copiar link de ${title}`} onClick={() => void copy()}>{copied ? "✓ link copiado" : "↗ copiar link"}</button>;
}
