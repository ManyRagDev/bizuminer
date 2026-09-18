/**
 * Atalho "⚡ Painel Admin" exibido quando a pessoa logada é o dono.
 * Mesmo estilo nas páginas públicas (vitrine, detalhe do produto, área do
 * cliente) — antes era um bloco de estilo inline repetido em cada arquivo.
 */
export default function AdminBadge({ href = "/admin" }: { href?: string }) {
  return (
    <a
      href={href}
      className="admin-badge-link"
      title="Acessar Painel do Administrador"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "5px 10px",
        borderRadius: "6px",
        background: "var(--blue-soft, #eff6ff)",
        border: "1px solid var(--blue-line, #bfdbfe)",
        color: "var(--blue-text, #1d4ed8)",
        fontSize: "0.8rem",
        fontWeight: 700,
        textDecoration: "none",
      }}
    >
      ⚡ Painel Admin
    </a>
  );
}