import type { EditorialDimensionId, EditorialLevel } from "./editorial-selection.ts";

/** Editorial parameters, not probabilities of quality or conversion. */
export const HERO_POLICY_VERSION = "hero-v2";
export const HERO_MAX_PRODUCTS = 3;
export const HERO_LEVEL_POINTS: Record<EditorialLevel, number | null> = {
  unknown: null, weak: 20, adequate: 60, strong: 80, exceptional: 100,
};
export const HERO_WEIGHTS: Record<EditorialDimensionId, number> = {
  audience: 30, utility: 25, value: 25, confidence: 10, clarity: 10,
};

export const HERO_RUBRIC: Record<EditorialDimensionId, Record<"adequate" | "strong" | "exceptional", string>> = {
  audience: {
    adequate: "Serve a um público ou situação identificável, inclusive de nicho.",
    strong: "Tem relevância clara para o público central de achadinhos e uma situação de uso fácil de reconhecer.",
    exceptional: "Representa muito bem o site: interesse amplo no público central e benefício que se entende rapidamente, com exemplos concretos de uso.",
  },
  utility: {
    adequate: "O benefício é compreensível, mas comum ou restrito a uma necessidade ocasional.",
    strong: "Resolve uma necessidade recorrente ou oferece um interesse claro, com benefício sustentado pelas características confirmadas.",
    exceptional: "O benefício se destaca entre alternativas comparáveis: grande praticidade, versatilidade ou interesse, demonstrado por características confirmadas.",
  },
  value: {
    adequate: "O preço parece coerente com a configuração e o benefício, com justificativa registrada.",
    strong: "Há uma boa relação entre custo e benefício, sustentada por referências de preço ou alternativas equivalentes identificadas.",
    exceptional: "A oportunidade se destaca frente a alternativas equivalentes ou ao histórico comparável confirmado; registre referência, data e configuração. Percentual anunciado e preço riscado, sozinhos, não comprovam isso.",
  },
  confidence: {
    adequate: "Há evidências suficientes para uma indicação com limites explicados.",
    strong: "As afirmações essenciais estão apoiadas por fontes identificadas e coerentes, sem dúvida essencial aberta.",
    exceptional: "As afirmações essenciais têm confirmação adicional ou independente, com fontes e limites registrados. Avaliações ou vendas isoladas não bastam.",
  },
  clarity: {
    adequate: "É possível explicar a compra, com as limitações conhecidas declaradas.",
    strong: "Conteúdo, quantidade e configuração relevantes estão confirmados; a apresentação esclarece acessórios ilustrativos e exclusões.",
    exceptional: "A oferta e a apresentação eliminam ambiguidades relevantes de variante, tamanho, conteúdo e preço, com confirmação explícita da fonte.",
  },
};
