import Image from "next/image";
import type { PublishedEditorialSelection } from "../../../lib/editorial-selection.ts";
const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

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
      <h2 id="published-selection-title">Produtos da seleção atual</h2>
      <p className="curation-muted">
        {selection.mode === "catalog"
          ? "A seleção automática já está disponível. Personalizar uma edição é opcional."
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
                    alt={product.title}
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
                    href={`/bizu/${product.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {product.title}
                  </a>
                </h3>
                <strong>{brl.format(product.priceCents / 100)}</strong>
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
