import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from "@google/generative-ai";
import { aiCurationProvider, evaluateOpenRouterAttributes, type OpenRouterCurationOptions } from "./ai-curation-provider.ts";
import { ATTRIBUTE_FLAGS, parseAttributeAssessments, type AttributeAssessment, type AttributeAssessmentInput } from "./ai-curation-v2-contract.ts";

export const ATTRIBUTE_PROMPT_VERSION = "attributes-prompt-v2.4";
const prompt = `Avalie atributos das ofertas brasileiras apenas com os fatos recebidos. Não aprove nem rejeite produtos.
Qualidade significa utilidade aparente; genuinidade é plausibilidade da oferta, não comprovação de desconto;
apelo_whatsapp estima interesse pelo canal. Use null se não houver base. Separe fatos usados de dúvidas,
não invente variantes, avaliações, frete, descontos, estoque ou conteúdo. Confiança é estimativa de 0 a 1,
não probabilidade calibrada. Flags descrevem riscos e não substituem bloqueios humanos ou factuais.
Responda uma vez para cada ID, sem IDs extras, usando exatamente os campos do schema.`;
const categories = ["Casa", "Tecnologia", "Ferramentas", "Beleza", "Fitness", "Auto e moto", "Brinquedos", "Papelaria", "Moda", "Suplementos", "Geral"];
const schema: ResponseSchema = { type: SchemaType.ARRAY, items: { type: SchemaType.OBJECT,
  properties: {
    productId: { type: SchemaType.STRING }, qualidade: { type: SchemaType.NUMBER, nullable: true },
    genuinidade_oferta: { type: SchemaType.NUMBER, nullable: true }, apelo_whatsapp: { type: SchemaType.NUMBER, nullable: true },
    categoria: { type: SchemaType.STRING, nullable: true, format: "enum", enum: categories },
    flags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING, format: "enum", enum: [...ATTRIBUTE_FLAGS] } },
    confianca: { type: SchemaType.NUMBER }, justificativa: { type: SchemaType.STRING },
    fatos_usados: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    duvidas: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
  }, required: ["productId", "qualidade", "genuinidade_oferta", "apelo_whatsapp", "categoria", "flags", "confianca", "justificativa", "fatos_usados", "duvidas"],
} };

/** One bounded provider call. Scheduling and reconciliation belong to the caller. */
export async function evaluateAttributeBatch(items: AttributeAssessmentInput[], options: {
  env?: Record<string, string | undefined>; openRouter?: OpenRouterCurationOptions;
  examples?: readonly { title: string; rationale: string }[];
} = {}): Promise<AttributeAssessment[]> {
  if (!items.length || items.length > 20 || new Set(items.map(item => item.productId)).size !== items.length)
    throw new Error("attributes_batch_invalid");
  const env = options.env ?? process.env;
  const examples = options.examples?.slice(0, 5) ?? [];
  const instruction = examples.length ? `${prompt}\nExemplos humanos, sem inferir fatos adicionais: ${JSON.stringify(examples)}` : prompt;
  if (aiCurationProvider(env) === "openrouter") return evaluateOpenRouterAttributes(items, instruction, { ...options.openRouter, env });
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("gemini_key_missing");
  const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: env.GEMINI_MODEL || "gemini-2.5-flash",
    systemInstruction: instruction, generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0 } });
  const response = await model.generateContent(JSON.stringify(items), { timeout: 60_000 });
  return parseAttributeAssessments(JSON.parse(response.response.text()), items.map(item => item.productId));
}
