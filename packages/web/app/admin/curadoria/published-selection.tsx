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
      <h2 id="published-selection-title">Produtos da página inicial</h2>
      {!selection.homepageReady && <p>A nova composição aguarda ativação inicial. Complete as evidências ou avaliações e ative uma edição. O catálogo de transição continua disponível até lá.</p>}
      <p className="curation-muted">
        {selection.mode === "catalog"
          ? selection.homepageReady ? "A seleção automática está ativa. Personalizar uma edição é opcional." : "Catálogo de transição: estes produtos ainda não compõem uma edição diária renovável."
          : "Estes são os produtos válidos da edição editorial neste momento."}{" "}
        Os destaques da página inicial estão identificados abaixo.
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
          A seleção está vazia. Consulte as pendências ou capture novas ofertas.
        </p>
      )}
    </section>
  );
}
