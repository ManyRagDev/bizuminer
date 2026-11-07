import Image from "next/image";
import type { PublishedEditorialSelection } from "../../../lib/editorial-selection.ts";
import {offerPriceLabel} from "../../../lib/offer-price.ts";
import {optionDetailPath} from "../../../lib/offer-option.ts";

export default function PublishedSelection({
  selection,
}: {
  selection: PublishedEditorialSelection;
}) {
  return (
    <section
      className="curation-published-selection"
      aria-labelledby="published-selection-title"
    >
      <h2 id="published-selection-title">Produtos em destaque na vitrine (Home)</h2>
      {!selection.homepageReady && (
        <p style={{ fontSize: "14px", color: "var(--ink-muted, #71717a)" }}>
          A vitrine pública está ativa exibindo as melhores ofertas do catálogo. A personalização manual da ordem é opcional.
        </p>
      )}
      <p className="curation-muted" style={{ fontSize: "14px", color: "var(--ink-muted, #71717a)" }}>
        {selection.mode === "catalog"
          ? "Vitrine automática ativa: os produtos aprovados com maiores descontos e melhores avaliações são exibidos na Home."
          : "Produtos da seleção editorial ativa neste momento."}{" "}
        {selection.products.length > 0 && "Os destaques principais estão marcados abaixo."}
      </p>
      {selection.products.length ? (
        <ol className="curation-published-grid">
          {selection.products.map((product) => (
            <li key={product.id}>
              <div className="curation-published-photo">
                {product.imageUrl && (
                  <Image
                    src={product.imageUrl}
                    alt={product.displayTitle ?? product.title}
                    fill
                    sizes="(max-width: 760px) 90vw, 240px"
                  />
                )}
              </div>
              <div>
                {selection.heroProductIds.includes(product.id) && (
                  <span className="curation-highlight-tag">
                    Destaque da página inicial
                  </span>
                )}
                <h3>
                  <a
                    href={optionDetailPath(product.slug,product.offerOptionKey)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {product.displayTitle ?? product.title}
                  </a>
                </h3>
                <strong>{offerPriceLabel(product)}</strong>
                <p>{product.marketplace}</p>
                {product.editorialRationale && (
                  <p>{product.editorialRationale}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p>
          {selection.mode === "catalog" && !selection.homepageReady
            ? <>O catálogo continua acessível na <a href="/" target="_blank" rel="noopener noreferrer">vitrine pública</a>. Os destaques aparecerão após a preparação de uma edição.</>
            : "A seleção está vazia. Consulte as pendências ou capture novas ofertas."}
        </p>
      )}
    </section>
  );
}
