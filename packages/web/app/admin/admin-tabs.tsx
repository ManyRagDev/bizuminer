"use client";

import { useState, type ReactNode } from "react";

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
 */
export default function AdminTabs({ tabs }: { tabs: AdminTabDef[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  return (
    <div className="admin-tabs">
      <div className="admin-tabs-nav" role="tablist" aria-label="Seções do painel">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            className={active === tab.id ? "active" : ""}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" hidden={active !== tab.id}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
