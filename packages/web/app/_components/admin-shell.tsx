"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: string;
  badge?: number;
  badgeType?: "warning" | "neutral";
}

interface NavGroup {
  groupTitle: string;
  items: NavItem[];
}

function resolveActiveId(pathname: string, search: string): string {
  if (pathname === "/pauta") return "publicar";

  if (pathname.startsWith("/admin/curadoria") || pathname.startsWith("/admin/direcionamento")) {
    const params = new URLSearchParams(search);
    const aba = params.get("aba");
    if (aba === "bussola" || pathname.startsWith("/admin/direcionamento")) return "configuracoes";
    if (aba === "pipeline" || aba === "lotes") return "operacao";
    return "curadoria";
  }

  if (pathname === "/admin") {
    const params = new URLSearchParams(search);
    const aba = params.get("aba");
    if (aba === "rodagens" || aba === "captura-manual") return "operacao";
    if (aba === "afiliados") return "configuracoes";
    if (aba === "publicacao") return "publicar";
    return "hoje";
  }

  return "hoje";
}

function resolveSectionTitle(activeId: string): string {
  switch (activeId) {
    case "hoje": return "Painel · Hoje";
    case "curadoria": return "Painel · Curadoria";
    case "publicar": return "Painel · Publicar";
    case "operacao": return "Painel · Operação";
    case "configuracoes": return "Painel · Configurações";
    default:
      return "Painel do Administrador";
  }
}

export default function AdminShell({
  children,
  curationCount = 0,
}: {
  children: React.ReactNode;
  curationCount?: number;
}) {
  const pathname = usePathname();
  const [currentSearch, setCurrentSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentSearch(window.location.search);
    }
  }, [pathname]);

  useEffect(() => {
    const handleUrlChange = () => {
      if (typeof window !== "undefined") {
        setCurrentSearch(window.location.search);
      }
    };
    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("hashchange", handleUrlChange);
    return () => {
      window.removeEventListener("popstate", handleUrlChange);
      window.removeEventListener("hashchange", handleUrlChange);
    };
  }, []);

  const activeId = resolveActiveId(pathname, currentSearch);
  const sectionTitle = resolveSectionTitle(activeId);
  const onPauta = pathname === "/pauta";

  const navigationGroups: NavGroup[] = [
    {
      groupTitle: "Rotina",
      items: [
        { id: "hoje", href: "/admin?aba=visao-geral", label: "Hoje", icon: "☀️" },
      ],
    },
    {
      groupTitle: "Trabalho",
      items: [
        {
          id: "curadoria",
          href: "/admin/curadoria?aba=excecoes",
          label: "Curadoria",
          icon: "🎯",
          badge: curationCount > 0 ? curationCount : undefined,
          badgeType: "warning",
        },
        {
          id: "publicar",
          href: "/pauta",
          label: "Publicar",
          icon: "📱",
        },
      ],
    },
    {
      groupTitle: "Sistema",
      items: [
        { id: "operacao", href: "/admin?aba=rodagens", label: "Operação", icon: "🔄" },
        { id: "configuracoes", href: "/admin/curadoria?aba=bussola", label: "Configurações", icon: "⚙️" },
      ],
    },
  ];

  return (
    <main className="admin-page admin-shell">
      {/* Top Header */}
      <header className="detail-header admin-shell-header">
        <div className="admin-header-left">
          <a className="brand" href="/" aria-label="BizuMiner, início">
            <Image
              src="/brand/bizuminer-icon-light.svg"
              alt=""
              aria-hidden="true"
              width={32}
              height={32}
              priority
              className="brand-mark-img"
            />
            <span className="brand-name">
              <b>Bizu</b>
              <i>Miner</i>
            </span>
          </a>
          <span className="admin-tag admin-shell-tag">{sectionTitle}</span>
        </div>

        <div className="detail-header-actions">
          {!onPauta && (
            <a
              href="/pauta"
              className="admin-shell-pauta-link"
              title="Abrir mesa de links rápidos para Stories e Reels"
            >
              📱 Pauta de Stories
            </a>
          )}
          <a href="/" className="admin-shell-site-link" target="_blank" rel="noopener noreferrer">
            Ver Vitrine ↗
          </a>
          <form action="/auth/sair" method="post" className="admin-signout-form">
            <button className="auth-signout" type="submit" title="Encerrar sessão de administrador">
              Sair
            </button>
          </form>
          <button
            type="button"
            className="admin-shell-toggle"
            aria-expanded={drawerOpen}
            aria-controls="admin-shell-nav"
            aria-label={drawerOpen ? "Fechar menu de navegação" : "Abrir menu de navegação"}
            onClick={() => setDrawerOpen((value) => !value)}
          >
            ☰
          </button>
        </div>
      </header>

      {/* Main Body with Unified Sidebar */}
      <div className="admin-shell-body">
        <nav
          id="admin-shell-nav"
          className={"admin-shell-nav" + (drawerOpen ? " open" : "")}
          aria-label="Navegação administrativa"
        >
          <div className="admin-shell-nav-inner">
            {navigationGroups.map((group) => (
              <div key={group.groupTitle} className="admin-nav-group">
                <span className="admin-nav-group-title">{group.groupTitle}</span>
                <div className="admin-nav-group-items">
                  {group.items.map((item) => {
                    const isActive = activeId === item.id;
                    return (
                      <a
                        key={item.id}
                        href={item.href}
                        className={"admin-shell-nav-item" + (isActive ? " active" : "")}
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => {
                          setDrawerOpen(false);
                          if (typeof window !== "undefined") {
                            const url = new URL(item.href, window.location.origin);
                            setCurrentSearch(url.search);
                          }
                        }}
                      >
                        <span className="admin-nav-item-content">
                          <span className="admin-nav-item-icon" aria-hidden="true">
                            {item.icon}
                          </span>
                          <span className="admin-nav-item-label">{item.label}</span>
                        </span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className={`admin-shell-nav-count ${item.badgeType || "neutral"}`}>
                            {item.badge}
                          </span>
                        )}
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="admin-shell-nav-foot">
              <a href="/" className="nav-foot-site">
                🌐 Ver Vitrine Pública
              </a>
              <form action="/auth/sair" method="post">
                <button className="auth-signout" type="submit">
                  Encerrar Sessão
                </button>
              </form>
            </div>
          </div>
        </nav>

        <div className="admin-shell-content">{children}</div>
      </div>

      {drawerOpen && (
        <button
          type="button"
          className="admin-shell-overlay"
          aria-label="Fechar navegação"
          onClick={() => setDrawerOpen(false)}
        />
      )}
    </main>
  );
}
