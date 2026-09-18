/**
 * Curadoria semântica com LLM — P3 do plano de pauta.
 *
 * Recebe ~40 produtos já qualificados pelo estágio 1 (equação de desejabilidade)
 * e usa o Gemini para reordenar por "desejo social" — o que a equação não faz:
 * distingue "Robô Aspirador com Mapeamento a Laser" de "Capa de Estepe Modelo 2003"
 * pela leitura semântica do título.
 *
 * Restrição de integridade: a IA só REORDENA dentro de um conjunto já qualificado.
 * Nunca promove item com evidência fraca — o estágio 1 é o portão.
 *
 * Cache de 1 dia: uma chamada por dia, não por carregamento de página.
 * Degrada para a ordem determinística do estágio 1 se a API falhar.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { VitrineProduct } from "./deal-view";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 dia

interface CachedResult {
  ids: string[];
  timestamp: number;
}

let cache: CachedResult | null = null;

/**
 * Prepara o input para a LLM: lista de produtos com ID, título, preço,
 * categoria, avaliação e vendas.
 */
export function formatProductsForLLM(products: VitrineProduct[]): string {
  return products
    .map(
      (p) =>
        `- id: "${p.id}" | [${p.category}] ${p.title} — R$ ${(p.priceCents / 100).toFixed(2)} — ★${p.ratingStar ?? "?"} — ${p.salesCount ?? 0} vendas`,
    )
    .join("\n");
}

const SYSTEM_PROMPT = `Você é um curador de ofertas para um público brasileiro que compra online.
Você recebe uma lista de produtos com id, título, preço, categoria, avaliação e vendas.
Sua tarefa é REORDENAR os produtos do mais desejável ao menos desejável.

Critérios de desejo:
- Produtos que as pessoas QUEREM ter (tecnologia, eletrônicos, ferramentas úteis) > produtos que as pessoas PRECISAM por necessidade (capas, películas, cabos)
- Títulos descritivos com características específicas (ex: "com Mapeamento a Laser", "Sem Fio Bluetooth") > títulos genéricos
- Boa avaliação + muitas vendas = prova social forte
- Preço acessível para o público brasileiro (R$20–500 é a faixa mais desejável)
- Produtos que resolvem problemas reais ou melhoram a rotina

Responda APENAS com um array JSON de strings com os IDs na ordem desejada. Exemplo: ["id1", "id2", "id3"]
Use EXATAMENTE os valores de id fornecidos na lista. Não inclua markdown adicional ou explicações, só o array JSON.`;

/**
 * Curadoria semântica: reordena produtos por desejo usando Gemini.
 * Degrada para a ordem original se a API falhar.
 */
export async function curateProducts(
  products: VitrineProduct[],
  maxResults = 20,
): Promise<VitrineProduct[]> {
  // Cache: se temos resultado fresco com os mesmos IDs, retorna
  const inputIds = products.map((p) => p.id).sort().join(",");
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    const cachedIds = [...cache.ids].sort().join(",");
    if (cachedIds === inputIds) {
      const byId = new Map(products.map((p) => [p.id, p]));
      return cache.ids
        .map((id) => byId.get(id))
        .filter((p): p is VitrineProduct => !!p)
        .slice(0, maxResults);
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[curation] GEMINI_API_KEY ausente — degrada para ordem determinística");
    return products.slice(0, maxResults);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL });

    const prompt = `${SYSTEM_PROMPT}\n\nProdutos:\n${formatProductsForLLM(products)}`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Extrai o array JSON da resposta (limpando fences se houver)
    const cleaned = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("[curation] Resposta da LLM não contém array JSON:", text.slice(0, 200));
      return products.slice(0, maxResults);
    }

    const orderedIds: string[] = JSON.parse(jsonMatch[0]);
    const byId = new Map(products.map((p) => [p.id, p]));
    const curated = orderedIds
      .map((id) => byId.get(String(id).trim()))
      .filter((p): p is VitrineProduct => !!p);

    if (curated.length === 0) {
      console.warn("[curation] Nenhum ID da LLM coincidiu com os produtos — degrada para ordem determinística");
      return products.slice(0, maxResults);
    }

    // Preserva itens omitidos pela LLM no final da lista
    const seen = new Set(curated.map((p) => p.id));
    for (const p of products) {
      if (!seen.has(p.id)) curated.push(p);
    }

    // Atualiza cache
    cache = { ids: curated.map((p) => p.id), timestamp: Date.now() };

    return curated.slice(0, maxResults);
  } catch (error) {
    console.error("[curation] Falha na LLM — degrada para ordem determinística:", error);
    return products.slice(0, maxResults);
  }
}
