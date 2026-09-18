import Image from "next/image";

/**
 * Cabeçalho compartilhado das páginas internas (entrar, detalhe do produto,
 * área do cliente). Unifica o `<header className="detail-header">` que antes
 * era colado em cada página.
 *
 * `actions` recebe o bloco de ações específico da página (badge admin, sair,
 * voltar aos achados, tema, salvar…). A página continua dona das ações — o
 * componente só garante que a marca e a estrutura são sempre as mesmas.
 */
export default function DetailHeader({ actions }: { actions?: React.ReactNode }) {
  return (
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
      <div className="detail-header-actions">{actions}</div>
    </header>
  );
}