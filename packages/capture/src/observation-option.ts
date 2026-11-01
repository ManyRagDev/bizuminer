/** Dedupe identity only. This never declares a historical series comparable. */
export function observationOptionIdentity(value:unknown):string {
  const e=value && typeof value==='object' ? value as Record<string,any> : {};
  const variant=e.variantIdentity?.key ?? e.variantKey;
  if(typeof variant!=='string' || !variant || e.variantIdentity && !['source_verified','human_verified'].includes(e.variantIdentity.state))return 'listing';
  const projection={variant,attributes:e.variantIdentity?.attributes ?? {},currency:e.currency ?? null,seller:e.sellerId ?? null,
    quantity:e.packageQuantity ?? e.conditions?.quantity ?? null,contents:e.packageContents ?? null,dimensions:e.dimensions ?? null,
    payment:e.conditions?.payment ?? null,coupon:e.conditions?.coupon ?? null,region:e.conditions?.region ?? null,shipping:e.conditions?.shipping ?? null,
    missingStates:Object.fromEntries(['sellerId','packageContents','packageQuantity','dimensions','payment','coupon','region']
      .filter(key=>e.fieldStates?.[key]==='not_applicable').map(key=>[key,'not_applicable']))};
  function canonical(v:any):any{return Array.isArray(v) ? v.map(canonical) : v && typeof v==='object' ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v;}
  return JSON.stringify(canonical(projection));
}
