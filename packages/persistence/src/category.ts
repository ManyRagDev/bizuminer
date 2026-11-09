/**
 * Taxonomia pequena e auditável para a primeira versão da mina.
 *
 * Ela só classifica quando o título contém uma pista inequívoca. Ausência de
 * categoria é preferível a uma inferência decorativa, porque a UI usa essa
 * informação para filtrar o catálogo.
 */
export const CANONICAL_CATEGORIES = [
  "Casa",
  "Tecnologia",
  "Ferramentas",
  "Beleza",
  "Fitness",
  "Auto e moto",
  "Brinquedos",
  "Papelaria",
  "Moda",
  "Suplementos",
] as const;

export type CanonicalCategory = (typeof CANONICAL_CATEGORIES)[number];

const CATEGORY_RULES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Tecnologia", ["notebook", "celular", "smartphone", "smartwatch", "smart tv", "tv ", "televis", "fone", "headset", "camera", "câmera", "monitor", "tablet", "power bank", "carregador", "playstation", "ps5", "nintendo", "console", "impressora", "processador", "vr ", "ssd", "teclado", "mouse", "roteador", "hub usb", "pendrive", "microfone", "cabo hdmi", "gpu", "placa de video"]],
  ["Casa", ["espelho", "pote", "cozinha", "airfryer", "fritadeira", "lavadora", "organizador", "cafeteira", "aspirador", "travesseiro", "colchao", "colchão", "chuveiro", "ventilador", "cooktop", "panela", "purificador", "toalha", "varal", "ar-condicionado", "ar condicionado", "luminaria", "luminária", "garrafa termica", "copo termico", "lampada", "led ", "fita led", "utensilio", "faca", "tabua"]],
  ["Fitness", ["bicicleta", "spinning", "esteira", "halter", "colchonete", "academia", "elastic", "crossfit", "corda", "luva treino", "squeeze", "garrafa agua"]],
  ["Suplementos", ["creatina", "whey", "hipercalorico", "hipercalórico", "massa", "proteina", "proteína", "suplemento", "vitamina", "magnésio", "magnesio", "coenzima", "nac ", "pré-treino", "pre treino", "testo essencial", "bcaa", "colageno"]],
  ["Beleza", ["perfume", "colonia", "colônia", "aparador", "barbeador", "escova", "secador", "maquiagem", "batom", "hidratante", "protetor solar", "shampoo", "condicionador", "mascara facial", "serum", "sérum"]],
  ["Ferramentas", ["furadeira", "solda", "compressor", "parafusadeira", "lavadora de alta", "pressao", "pressão", "chave ", "alicate", "trena", "multimetro", "multímetro", "jogo de ferramentas", "catraca", "soquete", "serra", "esmerilhadeira", "martelo"]],
  ["Auto e moto", ["suporte celular carro", "obd2", "veicular", "automotivo", "retrovisor", "farol", "pneu", "calibrador", "compressor ar portatil", "capa carro", "capa moto", "antena corta pipa", "capacete", "oleo motor"]],
  ["Brinquedos", ["brinquedo", "boneco", "figura de acao", "lego", "carrinho", "pelucia", "pelúcia", "quebra-cabeca", "nerf", "tabuleiro", "jogos", "blocos de montar", "drone infantil"]],
  ["Papelaria", ["caderno", "caneta", "marcador", "estojo", "papelaria", "agenda", "planner", "tesoura", "grampeador", "post-it", "bloco de notas", "pasta", "lapis", "lápis", "mochila escolar"]],
  ["Moda", ["mochila", "bolsa", "tenis", "tênis", "camiseta", "jaqueta", "carteira", "relogio", "relógio", "oculos", "óculos", "mala", "cinto"]],
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
