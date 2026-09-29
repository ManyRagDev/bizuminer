"use client";

import { useState } from "react";
import { copyToClipboard } from "../../lib/clipboard";
import { productShareUrl } from "../../lib/product-share";

export default function CopyProductLink({ slug, title }: { slug: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = productShareUrl(slug);
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
