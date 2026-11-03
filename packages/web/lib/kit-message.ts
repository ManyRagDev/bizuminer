import type { KitSnapshot, KitMaterial } from "./commerce-contract.ts";
/** One immutable message for preview and clipboard export. */
export function kitMessage(
  snapshot: KitSnapshot,
  material: KitMaterial,
  code: string,
) {
  const facts = snapshot.optionKey
    ? [
        snapshot.optionLabel,
        snapshot.purchaseContents,
        `Preço conferido: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: snapshot.currency }).format(snapshot.priceCents / 100)}`,
        snapshot.conditions,
      ]
        .filter(Boolean)
        .join("\n")
    : "";
  return `${material.shortCopy}${facts ? "\n\n" + facts : ""}\n\n${material.cta}: /p/${code}\n${material.disclosure}`;
}
