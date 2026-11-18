/** Shared deterministic restricted-content guard; it is not a quality score. */
export const ADULT_TERMS_RE =
  /\b(erotico|erotica|sexy|vibrador|anabolizante|replica|lingerie sensual|masturbador|dildo|plug anal|fantasia sensual)\b/i;

export function hasRestrictedTitle(title:string):boolean {
  return ADULT_TERMS_RE.test(title.normalize("NFD").replace(/[\u0300-\u036f]/g,""));
}
