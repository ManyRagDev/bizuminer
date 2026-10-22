/** Curadoria: seleção, pendências e qualidade; links antigos mantêm seu destino. */
export type AdminQueryRaw = Record<string, string | undefined>;

export type AdminQueryCanonical = {
  aba: string;
  sub: string;
  redirectNeeded: boolean;
};

const ABA_ALIASES: Record<string, { aba: string; sub?: string }> = {
  hoje: { aba: "excecoes", sub: "singulars" },
  grupos: { aba: "excecoes", sub: "grupos" },
  espera: { aba: "excecoes", sub: "retidos" },
  aprendizados: { aba: "bussola" },
  selecao: { aba: "selecao" },
  excecoes: { aba: "excecoes" },
  auditoria: { aba: "auditoria" },
  bussola: { aba: "bussola" },
  pipeline: { aba: "pipeline" },
  lotes: { aba: "pipeline" },
  radar: { aba: "radar" },
  direcionamento: { aba: "radar" },
};

const DEFAULT_SUB: Record<string, string> = {
  excecoes: "singulars",
  auditoria: "spotcheck",
};

const SUB_VALUES = new Set(["singulars", "grupos", "spotcheck", "espera", "retidos", "adiados"]);

const MODO_TO_SUB: Record<string, string> = {
  grupos: "grupos",
  hoje: "singulars",
};

export function canonicalAdminQuery(raw: AdminQueryRaw): AdminQueryCanonical {
  const { aba: abaRaw, fila, sub: subRaw, modo, subaba } = raw;

  let aba = "selecao";
  let abaLegacy = false;
  let aliasSub = "";
  if (abaRaw && abaRaw in ABA_ALIASES) {
    const alias = ABA_ALIASES[abaRaw]!;
    aba = alias.aba;
    aliasSub = alias.sub ?? "";
    abaLegacy = abaRaw !== aba;
  } else if (fila === "held") {
    aba = "excecoes";
  }

  let sub = "";
  let subLegacy = false;
  if (fila === "held") {
    sub = "retidos";
  } else if (subRaw && SUB_VALUES.has(subRaw)) {
    sub = subRaw;
  } else if (subaba && SUB_VALUES.has(subaba)) {
    sub = subaba;
    subLegacy = true;
  } else if (modo && modo in MODO_TO_SUB) {
    sub = MODO_TO_SUB[modo]!;
    subLegacy = true;
  } else if (aliasSub && !subRaw) {
    sub = aliasSub;
  } else {
    sub = DEFAULT_SUB[aba] ?? "";
  }

  const movedHoldQueue = sub === "espera";
  if (movedHoldQueue) { aba = "excecoes"; sub = "retidos"; }
  const allowed = aba === "excecoes" ? ["singulars", "grupos", "retidos", "adiados"]
    : aba === "auditoria" ? ["spotcheck"] : [""];
  const invalidSub = !allowed.includes(sub);
  if (invalidSub) sub = DEFAULT_SUB[aba] ?? "";

  const redirectNeeded = movedHoldQueue || invalidSub ||
    abaLegacy || subLegacy || fila === "held" || modo !== undefined || subaba !== undefined;
  return { aba, sub, redirectNeeded };
}

/**
 * Monta a URL canônica para `/admin/curadoria`, preservando params
 * desconhecidos (ex.: `grupo`, `page`). Só muda o que é de navegação.
 */
export function canonicalAdminUrl(pathname: string, raw: AdminQueryRaw): string {
  const { aba, sub } = canonicalAdminQuery(raw);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (key === "aba" || key === "sub" || key === "fila" || key === "modo" || key === "subaba") continue;
    if (value !== undefined) params.set(key, value);
  }
  params.set("aba", aba);
  if (sub) params.set("sub", sub);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}