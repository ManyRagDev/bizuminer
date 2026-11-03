/** Compact public facts. A long condition is disclosed, never silently truncated. */
export function offerArtworkFacts(product:{offerOptionKey?:string;purchaseContents?:string|null;offerConditions?:string}) {
  if(!product.offerOptionKey)return {contents:null,conditions:null};
  const contents=product.purchaseContents?.trim();
  const conditions=product.offerConditions?.trim();
  return {
    contents:contents ? contents.length<=150 ? contents:"Composição completa desta opção no link.":null,
    conditions:conditions ? conditions.length<=150 ? conditions:"Preço sujeito às condições descritas no link.":null,
  };
}
