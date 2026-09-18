import Image from "next/image";

/**
 * Tela "Sem acesso" exibida para quem está logado mas não é o dono.
 * Antes vivia dentro de `app/admin/page.tsx`; agora é compartilhada pelo
 * layout de `/admin` (e serve de referência única para o rótulo do painel).
 */
export default function DenyAccess() {
  return (
    <main className="admin-page">
      <header className="detail-header">
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
        <div className="detail-header-actions">
          <a href="/">← ver o site</a>
        </div>
      </header>
      <section className="admin-deny" role="alert">
        <p className="eyebrow">Painel do administrador</p>
        <h1>Sem acesso</h1>
        <p>
          Este painel é exclusivo do dono do BizuMiner. Se você acha que deveria estar aqui, entre com a
          conta correta.
        </p>
        <form action="/auth/sair" method="post">
          <button className="auth-signout" type="submit">
            trocar de conta
          </button>
        </form>
      </section>
    </main>
  );
}