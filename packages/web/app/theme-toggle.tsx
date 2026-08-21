"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

// Claro é o padrão do produto: quem nunca escolheu vê o tema claro, mesmo com
// o sistema em escuro. Precisa rodar ANTES da primeira pintura, senão a página
// pisca clara antes de virar escura para quem já escolheu escuro.
export const themeBootScript = `(function(){try{var t=localStorage.getItem("bizuminer:tema");document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light")}catch(e){document.documentElement.setAttribute("data-theme","light")}})()`;

function readTheme(): Theme {
  return window.localStorage.getItem("bizuminer:tema") === "dark" ? "dark" : "light";
}

export function ThemeToggle({ className = "", withLabel = false }: { className?: string; withLabel?: boolean }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => { setTheme(readTheme()); }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("bizuminer:tema", next);
    setTheme(next);
    window.dispatchEvent(new CustomEvent("bizuminer:interaction", { detail: { event: "theme_change", theme: next } }));
  }

  // theme só é conhecido depois da hidratação; até lá o botão não anuncia estado
  // errado para leitor de tela.
  const isDark = theme === "dark";
  const label = theme === null ? "Alternar tema" : isDark ? "Mudar para tema claro" : "Mudar para tema escuro";

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={toggle}
      aria-label={label}
      title={label}
      aria-pressed={theme === null ? undefined : isDark}
      suppressHydrationWarning
    >
      <span className="theme-toggle-icon" aria-hidden="true">{isDark ? "☾" : "☀"}</span>
      {withLabel && <b>{theme === null ? "Tema" : isDark ? "Tema escuro" : "Tema claro"}</b>}
    </button>
  );
}
