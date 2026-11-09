import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import {
  curationResponseSchema,
  type AICurationItemInput,
  type AICurationItemOutput,
} from "./ai-curation-contract.ts";
import {
  rubricShadowResponseSchema,
  type RubricAssessment,
  type RubricInputItem,
  validateRubricAssessment,
} from "./rubric-contract.ts";
import { calculateRubricInputDigest } from "./rubric-db.ts";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const AI_CURATION_BATCH_SIZE = 25;

/**
 * Modelos tentados em sequência quando o primário está saturado. O erro 503
 * do Gemini ("high demand, try again later") é transitório e por modelo — o
 * fallback costuma ter capacidade livre. Configurável via env
 * `GEMINI_FALLBACK_MODELS` (lista separada por vírgula).
 */
export const DEFAULT_FALLBACK_MODELS = ["gemini-3.5-flash-lite"];

export interface RetryConfig {
  /** Total de tentativas incluindo a primeira (3 = 1 + 2 retries). */
  maxAttempts: number;
  /** Espera inicial antes do primeiro retry, em ms. */
  baseDelayMs: number;
  /** Teto do backoff exponencial, em ms. */
  maxDelayMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1200,
  maxDelayMs: 10000,
};

/**
 * Erro tipado para resposta fora do schema (JSON inválido, não-lista ou item
 * sem `productId`). É retryável: o modelo às vezes devolve prosa em vez de
 * JSON e a chamada seguinte vem correta.
 */
export class AICurationParseError extends Error {}

/**
 * Erros transitórios do Gemini: a chamada pode ter sucesso se repetida.
 * 429 (rate limit), 408 (timeout) e 5xx de capacidade/indisponibilidade.
 */
const TRANSIENT_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export function isDailyQuotaExhaustedError(err: unknown): boolean {
  const status = (err as { status?: unknown })?.status;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return status === 429 && /PerDay|requests per day|quotaId.*PerDay/i.test(msg);
}

export function isTransientGeminiError(err: unknown): boolean {
  if (err instanceof AICurationParseError) return true;
  if (isDailyQuotaExhaustedError(err)) return false;
  const status = (err as { status?: unknown })?.status;
  return typeof status === "number" && TRANSIENT_HTTP_STATUS.has(status);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Repete `fn` com backoff exponencial + jitter enquanto o erro for retryável.
 * Erro permanente ou teto de tentativas → re-lança o último erro.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  isRetryable: (err: unknown) => boolean = isTransientGeminiError,
): Promise<T> {
  let lastError: unknown;
  let delay = config.baseDelayMs;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= config.maxAttempts || !isRetryable(err)) throw err;
      const jitter = Math.floor(Math.random() * Math.max(1, delay * 0.25));
      await sleep(delay + jitter);
      delay = Math.min(delay * 2, config.maxDelayMs);
    }
  }
  throw lastError;
}

/**
 * Monta a cadeia de modelos tentada por lote, sem duplicatas e sem entradas
 * vazias. Sempre inclui o primário.
 */
export function buildModelChain(primary: string, fallbacks?: string[]): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  for (const name of [primary, ...(fallbacks ?? [])]) {
    const trimmed = name.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      chain.push(trimmed);
    }
  }
  return chain.length > 0 ? chain : [primary];
}

export function parseFallbackModels(raw?: string): string[] | undefined {
  if (!raw || !raw.trim()) return undefined;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Valida a resposta do modelo. Lança `AICurationParseError` em JSON inválido,
 * resposta não-lista ou itens sem `productId` — tudo tratado como retryável.
 */
export function parseAICurationResponse(text: string): AICurationItemOutput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AICurationParseError("Resposta da IA não é JSON válido");
  }
  if (!Array.isArray(parsed)) {
    throw new AICurationParseError("Resposta da IA não é uma lista");
  }
  return parsed.filter(
    (item): item is AICurationItemOutput =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as { productId?: unknown }).productId === "string",
  );
}

const SYSTEM_PROMPT = `Você é o curador especialista do canal de "Achadinhos" e Ofertas BizuMiner no Brasil.
Sua missão é classificar produtos para garantir que apenas itens desejáveis, completos, viáveis e de real utilidade cheguem à vitrine e à pauta, cobrindo os 12 departamentos do catálogo: Casa, Eletrodomésticos, Eletrônicos, Informática, Ferramentas, Beleza, Esporte e Lazer, Auto e moto, Brinquedos, Iluminação, Papelaria e Moda.

DIRETRIZES DE AVALIAÇÃO:
1. Promessa enganosa / charlatanismo (hasMisleadingClaim):
   - Marque TRUE para cosméticos, suplementos ou itens de saúde que prometem curas rápidas, emagrecimento milagroso, rejuvenescimento irreal ou propriedades terapêuticas mágicas.
2. Segurança e Conteúdo Adulto (isAdultOrUnsafe):
   - Marque TRUE para sex shop, estimulantes, armas, réplicas perigosas, produtos falsificados ou itens ilegais.
3. Desejabilidade (desirabilityScore de 1 a 5):
   - Avalie utilidade e custo-benefício em qualquer faixa de preço. Considere a faixa completa quando houver variações. Só afirme que houve queda de preço se houver referência de histórico comparável.
   - NOTA 5: Produtos de destaque em seu departamento, gadgets inovadores, soluções inteligentes para o dia a dia, ferramentas elétricas desejadas, periféricos/eletrônicos completos, utilidades com forte proposta de valor e alta prova social (boas avaliações e vendas).
   - NOTA 4: Bons produtos acabados, úteis e procurados pelo consumidor final (ex.: parafusadeira com bateria, airfryer, fone Bluetooth, scanner automotivo OBD2, kit de papelaria/escritório, brinquedo estruturado, organizador prático).
   - NOTA 3: Itens úteis ou de rotina, porém comuns (ex.: garrafa térmica padrão, suporte simples de celular, pano de microfibra, jogo de chaves manuais básicas).
   - NOTA 1 ou 2: Peças técnicas de reposição avulsas sem uso direto (parafusos soltos, engrenagens industriais, capacitores, cabos flat internos), anúncios incompreensíveis/lixo ou itens de qualidade duvidosa. Ferramentas e itens de auto NÃO são lixo se forem produtos completos para o consumidor!
4. Categoria Editorial (editorialCategory):
   - 'achadinho_impulso': novidades visuais, gadgets, itens curiosos e presentes criativos.
   - 'utilidade_pratica': produtos que resolvem dores concretas do dia a dia (casa, cozinha, organização, escritório).
   - 'destaque_departamento': produtos robustos de informática, ferramentas, eletro, auto, beleza, esportes ou brinquedos com alta utilidade ao usuário.
   - 'peca_tecnica_avulsa': peças industriais soltas de reposição, parafusos, componentes avulsos sem apelo de vitrine.
   - 'outro': o que não se enquadrar nos anteriores.
5. Categoria Canônica (catalogCategory):
   - Classifique o produto pelo USO PRINCIPAL entre: 'Casa', 'Tecnologia', 'Ferramentas', 'Beleza', 'Fitness', 'Auto e moto', 'Brinquedos', 'Papelaria', 'Moda', 'Suplementos' ou 'Geral'.
   - Exemplo: um boneco articulado encontrado na seção de Casa e Decoração deve ter catalogCategory = 'Brinquedos'.
6. Benefício Público (publicBenefit):
   - Frase factual curta e comercial (1 sentença, máx 120 caracteres) destacando o uso real e benefício para o consumidor, sem inventar dados ausentes no título.
7. Justificativa Interna (justification):
   - Frase concisa (1 sentença, máx 150 caracteres) explicando a nota e o apelo para o curador.`;

export interface EvaluationOptions {
  apiKey?: string;
  modelName?: string;
  batchSize?: number;
  editorialGuideline?: string;
  fewShotExamples?: Array<{
    title: string;
    priceFormatted?: string;
    decision: "approved" | "rejected" | "held";
    reasonCode?: string | null;
    reasonDetail?: string | null;
    rationale?: string;
  }>;
  /** Modelos tentados depois do primário quando ele está saturado. */
  modelFallbacks?: string[];
  /** Configuração de retry por lote. */
  retry?: RetryConfig;
}

export function buildDynamicSystemPrompt(options?: EvaluationOptions): string {
  let dynamicInstruction = SYSTEM_PROMPT;

  if (options?.editorialGuideline && options.editorialGuideline.trim()) {
    dynamicInstruction += `\n\nDIRETRIZ EDITORIAL VIGENTE DO DIRETOR DA LOJA:\n"${options.editorialGuideline.trim()}"\nPriorize produtos que se alinhem fortemente a esta diretriz e penalize o que desviar dela.`;
  }

  if (options?.fewShotExamples && options.fewShotExamples.length > 0) {
    dynamicInstruction += `\n\nEXEMPLOS REAIS DE CALIBRAÇÃO FEITOS PELO DIRETOR DA LOJA (USE COMO REFERÊNCIA DE CRITÉRIO):\n`;
    for (const ex of options.fewShotExamples) {
      let verdict = "APROVADO (Exemplo positivo)";
      if (ex.decision === "held") {
        verdict = `EM ESPERA (${ex.reasonCode ?? "held"} - aguarda oportunidade de preço/vitrine)`;
      } else if (ex.decision === "rejected") {
        verdict = `REJEITADO (${ex.reasonCode ?? "inadequado"})`;
      }
      const priceInfo = ex.priceFormatted ? ` [Preço: ${ex.priceFormatted}]` : "";
      const explanation = ex.reasonDetail ?? ex.rationale ?? "";
      dynamicInstruction += `- Produto: "${ex.title}"${priceInfo} -> ${verdict}${explanation ? ` | Motivo: "${explanation}"` : ""}\n`;
    }
  }

  return dynamicInstruction;
}

/**
 * Processa um único lote com a cadeia completa: tenta cada modelo da cadeia
 * (primário → fallbacks) com retry por tentativa. Erro permanente de um
 * modelo não tenta os demais (não vai mudar); erro transitório esgotado
 * passa para o próximo modelo.
 */
async function generateBatchWithFallback(
  buildModel: (modelName: string) => GenerativeModel,
  prompt: string,
  modelChain: string[],
  retry: RetryConfig,
): Promise<{ items: AICurationItemOutput[]; modelUsed: string }> {
  let lastError: unknown;
  for (const modelName of modelChain) {
    const model = buildModel(modelName);
    try {
      const items = await withRetry(async () => {
        const response = await model.generateContent(prompt);
        return parseAICurationResponse(response.response.text());
      }, retry);
      return { items, modelUsed: modelName };
    } catch (err) {
      const status = (err as { status?: unknown })?.status;
      if (!isTransientGeminiError(err) && !isDailyQuotaExhaustedError(err) && status !== 404) throw err;
      lastError = err;
      console.warn(
        `[ai-curation] Modelo ${modelName} indisponível (${status === 404 ? "não encontrado" : isDailyQuotaExhaustedError(err) ? "cota diária esgotada" : "transitório"}): ${
          err instanceof Error ? err.message : String(err)
        }. Tentando próximo da cadeia.`,
      );
    }
  }
  throw lastError;
}

export async function evaluateProductsBatch(
  items: AICurationItemInput[],
  options?: EvaluationOptions,
): Promise<AICurationItemOutput[]> {
  const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[ai-curation] GEMINI_API_KEY ausente; pulando triagem semântica.");
    return [];
  }
  if (!items || items.length === 0) {
    return [];
  }

  const modelName = options?.modelName ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  const batchSize = options?.batchSize ?? AI_CURATION_BATCH_SIZE;
  const dynamicInstruction = buildDynamicSystemPrompt(options);
  const retry = options?.retry ?? DEFAULT_RETRY_CONFIG;
  const fallbacks =
    options?.modelFallbacks ?? parseFallbackModels(process.env.GEMINI_FALLBACK_MODELS) ?? DEFAULT_FALLBACK_MODELS;
  let activeModelChain = buildModelChain(modelName, fallbacks);

  const genAI = new GoogleGenerativeAI(apiKey);
  const buildModel = (name: string) =>
    genAI.getGenerativeModel({
      model: name,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: curationResponseSchema,
        temperature: 0.1,
      },
      systemInstruction: dynamicInstruction,
    });

  const results: AICurationItemOutput[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    try {
      const prompt = `Avalie o seguinte lote de produtos candidatos a achadinhos:\n\n${JSON.stringify(chunk, null, 2)}`;
      const { items: parsed, modelUsed } = await generateBatchWithFallback(buildModel, prompt, activeModelChain, retry);
      if (modelUsed !== activeModelChain[0]) {
        activeModelChain = [modelUsed, ...activeModelChain.filter((m) => m !== modelUsed)];
      }
      results.push(...parsed);
    } catch (err) {
      console.error(
        `[ai-curation] Falha no processamento do lote ${batchNumber} após ${activeModelChain.length} modelo(s) e ${retry.maxAttempts} tentativas:`,
        err,
      );
      // Fallback seguro: itens do lote não entram no resultado; o pipeline os
      // mantém como `pending` na fila humana, sem anotação de IA.
    }
  }

  return results;
}

export async function evaluateRubricShadowItem(
  item: RubricInputItem,
  options?: { apiKey?: string; modelName?: string },
): Promise<RubricAssessment> {
  const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
  const modelName = options?.modelName ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  const digest = calculateRubricInputDigest(item);

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY ausente para avaliação de rubrica shadow.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: rubricShadowResponseSchema,
      temperature: 0.1,
    },
    systemInstruction: `Você é o avaliador editorial de achadinhos do BizuMiner.
Avalie o produto de forma estritamente factual com base nas dimensões:
1. Qualidade física/utilidade (weak, adequate, strong, unknown)
2. Valor/preço diante de alternativas (weak, adequate, strong, unknown)
3. Aderência ao público consumidor (weak, adequate, strong, unknown)
4. Confiança da evidência (weak, adequate, strong, unknown)
Separe estritamente:
- factsUsed: fatos explicitamente informados no anúncio
- inferences: o que você deduziu mas não foi explicitamente dito
- unknowns: o que não dá para saber pelo anúncio
- safetyFlags: riscos evidentes (armas, adulto, promessa milagrosa, etc.)`,
  });

  const prompt = `Avalie o produto:\n${JSON.stringify(item, null, 2)}`;
  const response = await model.generateContent(prompt);
  const text = response.response.text();
  const parsed = JSON.parse(text);

  return validateRubricAssessment({
    schemaVersion: 2,
    quality: parsed.quality,
    value: parsed.value,
    audience: parsed.audience,
    evidenceConfidence: parsed.evidenceConfidence,
    factsUsed: parsed.factsUsed,
    inferences: parsed.inferences,
    unknowns: parsed.unknowns,
    safetyFlags: parsed.safetyFlags,
    policyVersion: "1.0.0",
    modelVersion: modelName,
    promptVersion: "rubric-v2-shadow",
    evidenceDigest: digest,
    createdAt: new Date().toISOString(),
  });
}
