import type { AICurationItemInput, AICurationItemOutput } from "./ai-curation-contract.ts";
import { createHash, randomUUID } from "node:crypto";
import type { CurationCallReservation } from "./ai-curation-call-budget.ts";
import { ATTRIBUTE_FLAGS, parseAttributeAssessments, type AttributeAssessment, type AttributeAssessmentInput } from "./ai-curation-v2-contract.ts";

export type AICurationEnvironment = Record<string, string | undefined>;
export type AICurationProviderFailureKind = "credential" | "quota" | "rate_limit" | "transient" | "permanent";

/** Deliberately contains no provider body, prompt, key, or underlying error. */
export class AICurationProviderError extends Error {
  readonly code: string;
  readonly kind: AICurationProviderFailureKind;
  readonly status?: number;

  constructor(code: string, kind: AICurationProviderFailureKind = "permanent", status?: number) {
    super(code);
    this.name = "AICurationProviderError";
    this.code = code;
    this.kind = kind;
    this.status = status;
  }
}

export function aiCurationProvider(env: AICurationEnvironment = process.env): "gemini" | "openrouter" {
  const provider = env.AI_CURATION_PROVIDER ?? "gemini";
  if (provider !== "gemini" && provider !== "openrouter") {
    throw new AICurationProviderError("ai_curation_provider_invalid");
  }
  return provider;
}

function openRouterConfiguration(env: AICurationEnvironment): { key: string; model: string; maxOutputTokens: number } {
  const platformOperation = env.NODE_ENV === "production" && env.AI_CURATION_CALL_LIMIT === "platform";
  if ((env.NODE_ENV === "production" || env.AI_CURATION_CALL_LIMIT !== undefined)
    && env.AI_CURATION_CALL_LIMIT !== "20" && !platformOperation)
    throw new AICurationProviderError("ai_curation_call_budget_not_configured");
  const key = env.OPENROUTER_API_KEY?.trim();
  if (!key || /\s/.test(key)) throw new AICurationProviderError("openrouter_key_missing_or_invalid", "credential");
  const model = env.AI_CURATION_MODEL;
  // A concrete catalog ID is required; availability is checked by the API, never guessed locally.
  if (!model || model.length > 200 || !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:-]+$/.test(model)
    || model.startsWith("openrouter/")) {
    throw new AICurationProviderError("ai_curation_model_missing_or_invalid");
  }
  const rawTokens = env.AI_CURATION_MAX_OUTPUT_TOKENS ?? "8192";
  const maxOutputTokens = Number(rawTokens);
  if (!/^[1-9][0-9]*$/.test(rawTokens) || !Number.isInteger(maxOutputTokens) || maxOutputTokens > 8192) {
    throw new AICurationProviderError("ai_curation_max_output_tokens_invalid");
  }
  return { key, model, maxOutputTokens };
}

/** Local configuration readiness, not a paid probe or a remote model availability claim. */
export function aiCurationReadiness(env: AICurationEnvironment = process.env): { ready: boolean; error?: string } {
  try {
    if (aiCurationProvider(env) === "openrouter") openRouterConfiguration(env);
    else if (!env.GEMINI_API_KEY?.trim()) return { ready: false, error: "gemini_key_missing" };
    return { ready: true };
  } catch (error) {
    return { ready: false, error: error instanceof AICurationProviderError ? error.code : "ai_curation_configuration_invalid" };
  }
}

export const OPENROUTER_CURATION_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_CURATION_MAX_BATCH = 20;
export const OPENROUTER_CURATION_MAX_BYTES = 256 * 1024;
export const OPENROUTER_CURATION_MAX_REQUEST_BYTES = 32 * 1024;
const TIMEOUT_MS = 60_000;
const editorialCategories = ["achadinho_impulso", "utilidade_pratica", "destaque_departamento", "peca_tecnica_avulsa", "outro", "gadget_util", "novidade", "peca_chata"];
const catalogCategories = ["Casa", "Tecnologia", "Ferramentas", "Beleza", "Fitness", "Auto e moto", "Brinquedos", "Papelaria", "Moda", "Suplementos", "Geral"];
const itemProperties = {
  productId: { type: "string" },
  desirabilityScore: { type: "integer", minimum: 1, maximum: 5 },
  hasMisleadingClaim: { type: "boolean" },
  isAdultOrUnsafe: { type: "boolean" },
  editorialCategory: { type: "string", enum: editorialCategories },
  catalogCategory: { type: "string", enum: catalogCategories },
  publicBenefit: { type: "string", maxLength: 120 },
  justification: { type: "string", minLength: 1, maxLength: 150 },
};
const itemKeys = Object.keys(itemProperties);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidResponse(): never {
  throw new AICurationProviderError("openrouter_response_invalid");
}

function validateItems(value: unknown, input: AICurationItemInput[]): AICurationItemOutput[] {
  if (!record(value) || Object.keys(value).length !== 1 || !Array.isArray(value.items) || value.items.length !== input.length) invalidResponse();
  const expected = new Set(input.map((item) => item.productId));
  for (const item of value.items) {
    if (!record(item) || Object.keys(item).length !== itemKeys.length || itemKeys.some((key) => !Object.hasOwn(item, key))
      || typeof item.productId !== "string" || !expected.delete(item.productId)
      || !Number.isInteger(item.desirabilityScore) || (item.desirabilityScore as number) < 1 || (item.desirabilityScore as number) > 5
      || typeof item.hasMisleadingClaim !== "boolean" || typeof item.isAdultOrUnsafe !== "boolean"
      || typeof item.editorialCategory !== "string" || !editorialCategories.includes(item.editorialCategory)
      || typeof item.catalogCategory !== "string" || !catalogCategories.includes(item.catalogCategory)
      || typeof item.publicBenefit !== "string" || [...item.publicBenefit].length > 120
      || typeof item.justification !== "string" || !item.justification.trim() || [...item.justification].length > 150) invalidResponse();
  }
  if (expected.size !== 0) invalidResponse();
  return value.items as AICurationItemOutput[];
}

async function boundedText(response: Response): Promise<string> {
  const length = response.headers.get("content-length");
  if (length && Number(length) > OPENROUTER_CURATION_MAX_BYTES) {
    await response.body?.cancel();
    throw new AICurationProviderError("openrouter_response_too_large");
  }
  if (!response.body) invalidResponse();
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > OPENROUTER_CURATION_MAX_BYTES) throw new AICurationProviderError("openrouter_response_too_large");
      text += decoder.decode(result.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function httpError(status: number, body: string): AICurationProviderError {
  if (status === 401) return new AICurationProviderError("openrouter_authentication_failed", "credential", status);
  // OpenRouter returns 403 for key/workspace budgets as well as moderation.
  // Inspect only to classify; never propagate provider text or metadata.
  let budget = false;
  try {
    const value: unknown = JSON.parse(body);
    if (record(value) && record(value.error)) {
      const source = record(value.error.metadata) ? value.error.metadata.limit_source : undefined;
      budget = typeof source === "string" && ["openrouter_guardrail_budget", "openrouter_workspace_budget", "openrouter_key_limit"].includes(source);
      // Compatibility with budget errors without structured metadata.
      budget ||= typeof value.error.message === "string" && /budget limit exceeded|credit limit exceeded|insufficient credits/i.test(value.error.message);
    }
  } catch { /* A malformed error body does not change the HTTP classification. */ }
  if (status === 402 || (status === 403 && budget)) return new AICurationProviderError("openrouter_budget_exhausted", "quota", status);
  if (status === 429) return new AICurationProviderError("openrouter_rate_limited", "rate_limit", status);
  if (status === 403) return new AICurationProviderError("openrouter_request_blocked", "permanent", status);
  if (status === 408 || status >= 500) return new AICurationProviderError("openrouter_unavailable", "transient", status);
  return new AICurationProviderError("openrouter_request_rejected", "permanent", status);
}

export interface OpenRouterCurationOptions {
  env?: AICurationEnvironment;
  fetch?: typeof fetch;
  timeoutMs?: number;
  reserveCall?: (fingerprint: string, requestId: string, model: string, kind: "legacy" | "attributes") => Promise<CurationCallReservation>;
}

async function reserveConfiguredCall(key: string, model: string, kind: "legacy" | "attributes", options: OpenRouterCurationOptions) {
  const env = options.env ?? process.env;
  if (env.AI_CURATION_CALL_LIMIT !== "20") return;
  let result: CurationCallReservation;
  try {
    const reserve = options.reserveCall ?? (await import("./ai-curation-call-budget.ts")).reserveCurationProviderCall;
    result = await reserve(createHash("sha256").update(key).digest("hex"), randomUUID(), model, kind);
  } catch { throw new AICurationProviderError("ai_curation_call_budget_unavailable"); }
  if (result === "limit_reached") throw new AICurationProviderError("ai_curation_call_limit_reached", "quota");
  if (result !== "reserved") throw new AICurationProviderError("ai_curation_call_budget_not_configured");
}

/**
 * One paid attempt only. A timeout or invalid response must be reconciled, never retried here.
 * Token/request bounds are not a dollar budget: the key's external spending cap is authoritative.
 */
export async function evaluateOpenRouterBatch(
  items: AICurationItemInput[],
  systemInstruction: string,
  options: OpenRouterCurationOptions = {},
): Promise<AICurationItemOutput[]> {
  const { key, model, maxOutputTokens } = openRouterConfiguration(options.env ?? process.env);
  if (items.length < 1 || items.length > OPENROUTER_CURATION_MAX_BATCH
    || items.some((item) => typeof item.productId !== "string" || !item.productId || item.productId.length > 200)
    || new Set(items.map((item) => item.productId)).size !== items.length) {
    throw new AICurationProviderError("openrouter_batch_invalid");
  }
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > TIMEOUT_MS) throw new AICurationProviderError("openrouter_timeout_invalid");
  const body = JSON.stringify({
    model,
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: `Avalie todos os produtos abaixo, preservando seus IDs, e retorne o objeto JSON com a lista items:\n${JSON.stringify(items)}` },
    ],
    stream: false,
    temperature: 0,
    max_tokens: maxOutputTokens,
    provider: { require_parameters: true, allow_fallbacks: false },
    response_format: { type: "json_schema", json_schema: {
      name: "garimpa_curation", strict: true,
      schema: { type: "object", additionalProperties: false, required: ["items"], properties: {
        items: { type: "array", minItems: items.length, maxItems: items.length, items: {
          type: "object", additionalProperties: false, properties: itemProperties, required: itemKeys,
        } },
      } },
    } },
  });
  if (new TextEncoder().encode(body).byteLength > OPENROUTER_CURATION_MAX_REQUEST_BYTES) throw new AICurationProviderError("openrouter_request_too_large");
  await reserveConfiguredCall(key, model, "legacy", options);
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new AICurationProviderError("openrouter_timeout", "transient"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const response = await (options.fetch ?? globalThis.fetch)(OPENROUTER_CURATION_ENDPOINT, {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body,
      });
      const text = await boundedText(response);
      if (!response.ok) throw httpError(response.status, text);
      let envelope: unknown;
      try { envelope = JSON.parse(text); } catch { invalidResponse(); }
      if (!record(envelope) || envelope.error || !Array.isArray(envelope.choices) || envelope.choices.length !== 1) invalidResponse();
      const choice: unknown = envelope.choices[0];
      if (!record(choice) || choice.finish_reason !== "stop" || !record(choice.message)
        || choice.message.refusal || typeof choice.message.content !== "string") invalidResponse();
      let content: unknown;
      try { content = JSON.parse(choice.message.content); } catch { invalidResponse(); }
      return validateItems(content, items);
    })()]);
  } catch (error) {
    if (controller.signal.aborted) throw new AICurationProviderError("openrouter_timeout", "transient");
    if (error instanceof AICurationProviderError) throw error;
    throw new AICurationProviderError("openrouter_transport_failed", "transient");
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

/** A single bounded attempt. Callers persist an unknown outcome before retrying. */
export async function evaluateOpenRouterAttributes(items: AttributeAssessmentInput[], systemInstruction: string,
  options: OpenRouterCurationOptions = {}): Promise<AttributeAssessment[]> {
  const { key, model, maxOutputTokens } = openRouterConfiguration(options.env ?? process.env);
  if (!items.length || items.length > 20 || new Set(items.map(item => item.productId)).size !== items.length)
    throw new AICurationProviderError("attributes_batch_invalid");
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > TIMEOUT_MS) throw new AICurationProviderError("openrouter_timeout_invalid");
  const properties = {
    productId: { type: "string" }, qualidade: { type: ["number", "null"], minimum: 0, maximum: 100 },
    genuinidade_oferta: { type: ["number", "null"], minimum: 0, maximum: 100 },
    apelo_whatsapp: { type: ["number", "null"], minimum: 0, maximum: 100 },
    categoria: { type: ["string", "null"], enum: [...catalogCategories, null] },
    flags: { type: "array", items: { type: "string", enum: ATTRIBUTE_FLAGS }, maxItems: 20 },
    confianca: { type: "number", minimum: 0, maximum: 1 }, justificativa: { type: "string", minLength: 1, maxLength: 1000 },
    fatos_usados: { type: "array", items: { type: "string" }, maxItems: 20 },
    duvidas: { type: "array", items: { type: "string" }, maxItems: 20 },
  };
  const body = JSON.stringify({ model, stream: false, temperature: 0, max_tokens: maxOutputTokens,
    provider: { require_parameters: true, allow_fallbacks: false },
    messages: [{ role: "system", content: systemInstruction }, { role: "user", content: JSON.stringify(items) }],
    response_format: { type: "json_schema", json_schema: { name: "garimpa_attributes_v2", strict: true,
      schema: { type: "object", additionalProperties: false, required: ["items"], properties: {
        items: { type: "array", minItems: items.length, maxItems: items.length,
          items: { type: "object", additionalProperties: false, properties, required: Object.keys(properties) } },
      } } } },
  });
  if (new TextEncoder().encode(body).byteLength > OPENROUTER_CURATION_MAX_REQUEST_BYTES) throw new AICurationProviderError("openrouter_request_too_large");
  await reserveConfiguredCall(key, model, "attributes", options);
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => { controller.abort(); reject(new AICurationProviderError("openrouter_timeout", "transient")); }, timeoutMs);
  });
  try {
    return await Promise.race([deadline, (async () => {
    const response = await (options.fetch ?? globalThis.fetch)(OPENROUTER_CURATION_ENDPOINT, {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body,
    });
    const text = await boundedText(response);
    if (!response.ok) throw httpError(response.status, text);
    const envelope: unknown = JSON.parse(text);
    if (!record(envelope) || envelope.error || !Array.isArray(envelope.choices) || envelope.choices.length !== 1) invalidResponse();
    const choice: unknown = envelope.choices[0];
    if (!record(choice) || choice.finish_reason !== "stop" || !record(choice.message)
      || choice.message.refusal || typeof choice.message.content !== "string") invalidResponse();
    const content: unknown = JSON.parse(choice.message.content);
    if (!record(content) || Object.keys(content).length !== 1) invalidResponse();
    return parseAttributeAssessments(content.items, items.map(item => item.productId));
    })()]);
  } catch (error) {
    if (controller.signal.aborted) throw new AICurationProviderError("openrouter_timeout", "transient");
    if (error instanceof AICurationProviderError) throw error;
    throw new AICurationProviderError("openrouter_attributes_unconfirmed", "transient");
  } finally { clearTimeout(timeout); controller.abort(); }
}
