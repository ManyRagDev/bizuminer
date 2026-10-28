"use client";

import { useEffect, useState } from "react";
import { CATALOG_RETURN_KEY, parseCatalogReturn } from "../../lib/catalog-navigation";

export default function CatalogBackLink() {
  const [href, setHref] = useState("/#achados");
  useEffect(() => {
    try { setHref(parseCatalogReturn(sessionStorage.getItem(CATALOG_RETURN_KEY))?.url ?? "/#achados"); } catch { /* Storage can be unavailable. */ }
  }, []);
  return <a href={href}>← Voltar para as ofertas</a>;
}
