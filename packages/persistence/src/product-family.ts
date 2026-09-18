/**
 * Famílias editoriais pequenas e auditáveis.
 *
 * Esta classificação não tenta entender todo o catálogo. Ela só devolve uma
 * família quando o título contém uma pista forte o bastante para sustentar
 * controle de saturação. Produto não classificado continua elegível e nunca é
 * agrupado num balde genérico — isso evitaria limitar itens diferentes apenas
 * porque a regra ainda não os conhece.
 */
export const PRODUCT_FAMILIES = {
  manoplas_moto: "Manoplas para moto",
  unhas_manicure: "Unhas e manicure",
  suportes_veiculares: "Suportes veiculares",
  iluminacao: "Iluminação",
  organizacao: "Organização",
  cozinha: "Utensílios de cozinha",
  carregamento: "Cabos e carregadores",
  audio: "Áudio",
  cuidados_pessoais: "Cuidados pessoais",
  ferramentas: "Ferramentas",
} as const;

export type ProductFamily = keyof typeof PRODUCT_FAMILIES;

/** Método do classificador — identifica a técnica usada para agrupar. */
export const FAMILY_METHOD = "title-keywords" as const;
/**
 * Versão das regras. Subir SEMPRE que o dicionário mudar: a versão é gravada
 * no produto e distingue agrupamentos feitos com regras diferentes.
 */
export const FAMILY_RULES_VERSION = "v1" as const;

export interface ProductFamilyInfo {
  readonly key: ProductFamily;
  readonly label: string;
  readonly method: typeof FAMILY_METHOD;
  readonly version: typeof FAMILY_RULES_VERSION;
}

const FAMILY_RULES: ReadonlyArray<readonly [ProductFamily, readonly string[]]> = [
  ["manoplas_moto", ["manopla", "punho de moto", "punho para moto", "grip motocicleta"]],
  [
    "unhas_manicure",
    [
      "unha em gel",
      "unha de gel",
      "unhas em gel",
      "unhas de gel",
      "unha postica",
      "unhas posticas",
      "polygel",
      "gel para unha",
      "kit manicure",
      "esmalte em gel",
    ],
  ],
  [
    "suportes_veiculares",
    ["suporte celular carro", "suporte celular moto", "suporte veicular", "suporte para retrovisor"],
  ],
  ["iluminacao", ["luminaria", "lampada", "fita led", "luz led", "refletor led", "abajur"]],
  ["organizacao", ["organizador", "caixa organizadora", "colmeia organizadora", "prateleira"]],
  [
    "cozinha",
    ["utensilio de cozinha", "utensilios de cozinha", "panela", "frigideira", "escorredor", "pote hermetico"],
  ],
  [
    "carregamento",
    ["carregador", "cabo usb", "cabo type c", "cabo tipo c", "power bank", "fonte usb"],
  ],
  ["audio", ["fone bluetooth", "fone de ouvido", "headset", "caixa de som", "soundbar"]],
  [
    "cuidados_pessoais",
    ["skincare", "cuidados com a pele", "limpeza facial", "escova secadora", "aparador de pelos"],
  ],
  ["ferramentas", ["kit ferramentas", "furadeira", "parafusadeira", "chave catraca", "alicate"]],
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function productFamilyForTitle(title: string): ProductFamily | undefined {
  return familyInfoForTitle(title)?.key;
}

export function familyInfoForTitle(title: string): ProductFamilyInfo | undefined {
  const normalized = normalize(title);
  for (const [family, terms] of FAMILY_RULES) {
    if (terms.some((term) => normalized.includes(normalize(term)))) {
      return {
        key: family,
        label: PRODUCT_FAMILIES[family],
        method: FAMILY_METHOD,
        version: FAMILY_RULES_VERSION,
      };
    }
  }
  return undefined;
}

