// ============================================================================
// SHDWsdk Multi-Provider Token & SSE Stream Normalization Engine
// Supports OpenAI, Anthropic, and Google Gemini standard payloads + SSE streams
// ============================================================================

import type { AIProvider } from "./database.types.js";

export interface NormalizedTokenUsage {
  provider: AIProvider;
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  isEstimatedFallback: boolean;
}

interface OpenAIUsageShape {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface AnthropicUsageShape {
  input_tokens?: number;
  output_tokens?: number;
}

interface GeminiUsageMetadataShape {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GenericProviderResponse {
  model?: string;
  modelVersion?: string;
  usage?: OpenAIUsageShape & AnthropicUsageShape;
  usageMetadata?: GeminiUsageMetadataShape;
  choices?: Array<{
    message?: { content?: string | null };
    delta?: { content?: string | null };
  }>;
  content?: Array<{ type?: string; text?: string }>;
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  message?: {
    model?: string;
    usage?: AnthropicUsageShape;
  };
  type?: string;
}

/**
 * Estimates BPE token count from raw text when a streaming provider omits
 * final token usage chunks (~4 characters per token heuristic).
 */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function inferProviderFromModel(
  modelName: string,
  fallback: AIProvider = "custom"
): AIProvider {
  const lower = modelName.toLowerCase();
  if (
    lower.includes("gpt") ||
    lower.startsWith("o1") ||
    lower.startsWith("o3") ||
    lower.includes("text-embedding")
  ) {
    return "openai";
  }
  if (lower.includes("claude")) {
    return "anthropic";
  }
  if (lower.includes("gemini")) {
    return "gemini";
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Normalizes a non-streaming response payload from OpenAI, Anthropic, or Gemini.
 */
export function normalizeStandardPayload(
  payload: unknown,
  fallbackModel = "unknown-model",
  fallbackProvider?: AIProvider,
  promptFallbackText = ""
): NormalizedTokenUsage {
  if (!isRecord(payload)) {
    const promptEst = estimateTokensFromText(promptFallbackText);
    const provider = fallbackProvider ?? inferProviderFromModel(fallbackModel);
    return {
      provider,
      modelName: fallbackModel,
      promptTokens: promptEst,
      completionTokens: 0,
      totalTokens: promptEst,
      isEstimatedFallback: true,
    };
  }

  const typed = payload as GenericProviderResponse;
  const resolvedModel =
    (typeof typed.model === "string" && typed.model) ||
    (typeof typed.modelVersion === "string" && typed.modelVersion) ||
    fallbackModel;

  // 1. OpenAI standard usage shape
  if (
    typed.usage &&
    (typeof typed.usage.prompt_tokens === "number" ||
      typeof typed.usage.completion_tokens === "number")
  ) {
    const promptTokens = Math.max(0, typed.usage.prompt_tokens ?? 0);
    const completionTokens = Math.max(0, typed.usage.completion_tokens ?? 0);
    return {
      provider: fallbackProvider ?? inferProviderFromModel(resolvedModel, "openai"),
      modelName: resolvedModel,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      isEstimatedFallback: false,
    };
  }

  // 2. Anthropic standard usage shape
  if (
    typed.usage &&
    (typeof typed.usage.input_tokens === "number" ||
      typeof typed.usage.output_tokens === "number")
  ) {
    const promptTokens = Math.max(0, typed.usage.input_tokens ?? 0);
    const completionTokens = Math.max(0, typed.usage.output_tokens ?? 0);
    return {
      provider:
        fallbackProvider ?? inferProviderFromModel(resolvedModel, "anthropic"),
      modelName: resolvedModel,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      isEstimatedFallback: false,
    };
  }

  // 3. Google Gemini usageMetadata shape
  if (
    typed.usageMetadata &&
    (typeof typed.usageMetadata.promptTokenCount === "number" ||
      typeof typed.usageMetadata.candidatesTokenCount === "number")
  ) {
    const promptTokens = Math.max(0, typed.usageMetadata.promptTokenCount ?? 0);
    const completionTokens = Math.max(
      0,
      typed.usageMetadata.candidatesTokenCount ?? 0
    );
    return {
      provider: fallbackProvider ?? inferProviderFromModel(resolvedModel, "gemini"),
      modelName: resolvedModel,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      isEstimatedFallback: false,
    };
  }

  // 4. Fallback estimation from text content
  let extractedText = "";
  if (Array.isArray(typed.choices)) {
    for (const c of typed.choices) {
      if (typeof c.message?.content === "string") {
        extractedText += c.message.content;
      }
    }
  } else if (Array.isArray(typed.content)) {
    for (const block of typed.content) {
      if (typeof block.text === "string") {
        extractedText += block.text;
      }
    }
  } else if (Array.isArray(typed.candidates)) {
    for (const cand of typed.candidates) {
      const parts = cand.content?.parts ?? [];
      for (const p of parts) {
        if (typeof p.text === "string") {
          extractedText += p.text;
        }
      }
    }
  }

  const promptTokens = estimateTokensFromText(promptFallbackText);
  const completionTokens = estimateTokensFromText(extractedText);

  return {
    provider: fallbackProvider ?? inferProviderFromModel(resolvedModel),
    modelName: resolvedModel,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    isEstimatedFallback: true,
  };
}

/**
 * Stateful accumulator that inspects SSE streaming chunks (objects or raw SSE text lines)
 * in real time without blocking or mutating the stream yielded to the host application.
 */
export class SSEStreamTokenAccumulator {
  private modelName: string;
  private provider: AIProvider;
  private promptTokens = 0;
  private completionTokens = 0;
  private hasExplicitPromptTokens = false;
  private hasExplicitCompletionTokens = false;
  private accumulatedCompletionText = "";
  private readonly fallbackPromptTokens: number;

  constructor(options?: {
    fallbackModel?: string;
    fallbackProvider?: AIProvider;
    promptText?: string;
    estimatedPromptTokens?: number;
  }) {
    this.modelName = options?.fallbackModel ?? "unknown-model";
    this.provider =
      options?.fallbackProvider ?? inferProviderFromModel(this.modelName);
    this.fallbackPromptTokens =
      options?.estimatedPromptTokens ??
      estimateTokensFromText(options?.promptText ?? "");
  }

  /**
   * Ingests either a parsed chunk object or raw SSE string (including multi-line `data: {...}`).
   */
  public ingestChunk(chunk: unknown): void {
    try {
      if (typeof chunk === "string") {
        this.ingestRawSSEString(chunk);
        return;
      }
      if (chunk instanceof Uint8Array) {
        const text = new TextDecoder().decode(chunk);
        this.ingestRawSSEString(text);
        return;
      }
      if (isRecord(chunk)) {
        this.ingestParsedObject(chunk as GenericProviderResponse);
      }
    } catch {
      // Fail-silent: never allow stream parsing anomalies to surface
    }
  }

  private ingestRawSSEString(raw: string): void {
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const dataStr = trimmed.slice(5).trim();
      if (!dataStr || dataStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(dataStr) as GenericProviderResponse;
        this.ingestParsedObject(parsed);
      } catch {
        // Ignore partial JSON frames
      }
    }
  }

  private ingestParsedObject(obj: GenericProviderResponse): void {
    if (typeof obj.model === "string" && obj.model.length > 0) {
      this.modelName = obj.model;
      this.provider = inferProviderFromModel(obj.model, this.provider);
    } else if (
      typeof obj.message?.model === "string" &&
      obj.message.model.length > 0
    ) {
      this.modelName = obj.message.model;
      this.provider = inferProviderFromModel(obj.message.model, "anthropic");
    } else if (
      typeof obj.modelVersion === "string" &&
      obj.modelVersion.length > 0
    ) {
      this.modelName = obj.modelVersion;
      this.provider = inferProviderFromModel(obj.modelVersion, "gemini");
    }

    // OpenAI final stream usage chunk (`stream_options: { include_usage: true }`)
    if (obj.usage) {
      if (typeof obj.usage.prompt_tokens === "number") {
        this.promptTokens = obj.usage.prompt_tokens;
        this.hasExplicitPromptTokens = true;
      }
      if (typeof obj.usage.completion_tokens === "number") {
        this.completionTokens = obj.usage.completion_tokens;
        this.hasExplicitCompletionTokens = true;
      }
      // Anthropic `message_delta` usage
      if (typeof obj.usage.input_tokens === "number") {
        this.promptTokens = obj.usage.input_tokens;
        this.hasExplicitPromptTokens = true;
      }
      if (typeof obj.usage.output_tokens === "number") {
        this.completionTokens = obj.usage.output_tokens;
        this.hasExplicitCompletionTokens = true;
      }
    }

    // Anthropic `message_start` usage nested under `message.usage`
    if (obj.message?.usage) {
      if (typeof obj.message.usage.input_tokens === "number") {
        this.promptTokens = obj.message.usage.input_tokens;
        this.hasExplicitPromptTokens = true;
      }
      if (typeof obj.message.usage.output_tokens === "number") {
        this.completionTokens = obj.message.usage.output_tokens;
        this.hasExplicitCompletionTokens = true;
      }
    }

    // Gemini streaming `usageMetadata`
    if (obj.usageMetadata) {
      if (typeof obj.usageMetadata.promptTokenCount === "number") {
        this.promptTokens = obj.usageMetadata.promptTokenCount;
        this.hasExplicitPromptTokens = true;
      }
      if (typeof obj.usageMetadata.candidatesTokenCount === "number") {
        this.completionTokens = obj.usageMetadata.candidatesTokenCount;
        this.hasExplicitCompletionTokens = true;
      }
    }

    // Accumulate delta text for fallback token estimation if stream omits usage block
    if (Array.isArray(obj.choices)) {
      for (const choice of obj.choices) {
        if (typeof choice.delta?.content === "string") {
          this.accumulatedCompletionText += choice.delta.content;
        }
      }
    }

    const rawRecord = obj as Record<string, unknown>;
    if (isRecord(rawRecord.delta) && typeof rawRecord.delta.text === "string") {
      this.accumulatedCompletionText += rawRecord.delta.text;
    }

    if (Array.isArray(obj.candidates)) {
      for (const cand of obj.candidates) {
        const parts = cand.content?.parts ?? [];
        for (const p of parts) {
          if (typeof p.text === "string") {
            this.accumulatedCompletionText += p.text;
          }
        }
      }
    }
  }

  public finalize(): NormalizedTokenUsage {
    const finalPrompt = this.hasExplicitPromptTokens
      ? this.promptTokens
      : this.fallbackPromptTokens;
    const finalCompletion = this.hasExplicitCompletionTokens
      ? this.completionTokens
      : estimateTokensFromText(this.accumulatedCompletionText);

    return {
      provider: this.provider,
      modelName: this.modelName,
      promptTokens: Math.max(0, finalPrompt),
      completionTokens: Math.max(0, finalCompletion),
      totalTokens: Math.max(0, finalPrompt + finalCompletion),
      isEstimatedFallback:
        !this.hasExplicitPromptTokens || !this.hasExplicitCompletionTokens,
    };
  }
}
