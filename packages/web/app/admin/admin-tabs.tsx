"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface AdminTabDef {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Abas do painel (M4). O conteúdo de cada aba é Server Component já
 * renderizado no servidor — este componente só controla visibilidade
 * (via `hidden`, não desmontagem), para que estados internos de
 * `AdminPanel`/`Devices` (polling, formulários) não se percam ao trocar de aba.
 *
 * O estado inicial vem de `initialTab` (derivado dos `searchParams` no
 * servidor) e nunca de `window.location` — ler a URL no inicializador do
 * `useState` quebra a hidratação: o SSR renderiza uma aba e o cliente
 * hidrata outra. A sincronização com a URL fica no `useEffect`, que roda
 * só no cliente depois da hidratação.
 */
export default function AdminTabs({
  tabs,
  initialTab,
  showNavigation = true,
}: {
  tabs: AdminTabDef[];
  initialTab?: string;
  /** A shell já oferece navegação persistente; evita duplicar o mesmo menu. */
  showNavigation?: boolean;
}) {
  const [active, setActive] = useState(() => {
    if (initialTab && tabs.some((t) => t.id === initialTab)) return initialTab;
    return tabs[0]?.id ?? "";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlAba = new URLSearchParams(window.location.search).get("aba");
    if (urlAba && tabs.some((t) => t.id === urlAba)) {
      setActive(urlAba);
    }
  }, [tabs]);

  const handleSelectTab = (id: string) => {
    setActive(id);
    if (typeof window !== "undefined" && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.set("aba", id);
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  };

  return (
    <div className="admin-tabs">
      {showNavigation && <div className="admin-tabs-nav" role="tablist" aria-label="Seções do painel">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            className={active === tab.id ? "active" : ""}
            onClick={() => handleSelectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>}
      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" hidden={active !== tab.id}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
