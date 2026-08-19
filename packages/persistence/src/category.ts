/**
 * Taxonomia pequena e auditável para a primeira versão da mina.
 *
 * Ela só classifica quando o título contém uma pista inequívoca. Ausência de
 * categoria é preferível a uma inferência decorativa, porque a UI usa essa
 * informação para filtrar o catálogo.
 */
const CATEGORY_RULES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Tecnologia", ["notebook", "celular", "smartphone", "smartwatch", "smart tv", "tv ", "televis", "fone", "headset", "camera", "câmera", "monitor", "tablet", "power bank", "carregador", "playstation", "ps5", "nintendo", "console", "impressora", "processador", "vr "]],
  ["Casa", ["espelho", "pote", "cozinha", "airfryer", "fritadeira", "lavadora", "organizador", "cafeteira", "aspirador", "travesseiro", "colchao", "colchão", "chuveiro", "ventilador", "cooktop", "panela", "purificador", "toalha", "varal", "ar-condicionado", "ar condicionado", "luminaria", "luminária"]],
  ["Fitness", ["bicicleta", "spinning", "esteira", "halter", "colchonete", "academia"]],
  ["Suplementos", ["creatina", "whey", "hipercalorico", "hipercalórico", "massa", "proteina", "proteína", "suplemento", "vitamina", "magnésio", "magnesio", "coenzima", "nac ", "pré-treino", "pre treino", "testo essencial"]],
  ["Beleza", ["perfume", "colonia", "colônia", "aparador", "barbeador", "escova", "secador", "maquiagem"]],
  ["Ferramentas", ["furadeira", "solda", "compressor", "parafusadeira", "lavadora de alta", "pressao", "pressão"]],
  ["Moda", ["mochila", "bolsa", "tenis", "tênis", "camiseta", "jaqueta"]],
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function categoryForTitle(title: string): string | undefined {
  const normalized = normalize(title);
  for (const [category, terms] of CATEGORY_RULES) {
    if (terms.some((term) => normalized.includes(normalize(term)))) return category;
  }
  return undefined;
}
