// ============================================================================
// SHDWsdk Non-Blocking LLM Client Wrappers (OpenAI, Anthropic, Google Gemini)
// Wraps standard async calls and AsyncIterable SSE streams without adding
// latency or propagating telemetry exceptions.
// ============================================================================

import {
  computeSyncPromptHash,
  UNVERSIONED_PROMPT,
} from "./aibom.js";
import { calculateFootprint } from "./coefficients.js";
import type { AIProvider, EuAiRiskTier } from "./database.types.js";
import {
  SSEStreamTokenAccumulator,
  inferProviderFromModel,
  normalizeStandardPayload,
} from "./normalizer.js";
import {
  ResilientTelemetryQueue,
  type ShdwDeliveryStats,
  type ShdwQueueOptions,
  type ShdwTelemetryEvent,
} from "./queue.js";

export interface ShdwClientConfig extends ShdwQueueOptions {
  /**
   * Datacenter grid region (e.g. 'us-west-2', 'eu-north-1'). Leave unset to use
   * the default region chosen in your SHDWsdk Settings; the server applies it.
   */
  defaultGridRegion?: string;
  /** Optional custom carbon intensity override in gCO2e/kWh */
  customGridIntensityGco2Kwh?: number;
  /** Default workload name for automated AI-BOM registration */
  defaultWorkloadName?: string;
  /** Default EU AI Act risk classification for automated AI-BOM registration */
  defaultEuAiRiskTier?: EuAiRiskTier;
  /**
   * Returns the id of YOUR customer the current AI call serves (e.g. from
   * AsyncLocalStorage or request context). Used for per-customer Scope 3
   * statements. Use pseudonymous account ids, never emails.
   */
  resolveCustomerRef?: () => string | undefined;
}

export interface VectorStoreInstrumentationConfig {
  sourceUrl: string;
  embeddingModelId?: string;
  workloadName?: string;
}

export interface TrackCallMetadata {
  modelName?: string;
  provider?: AIProvider;
  gridRegion?: string;
  promptText?: string;
  workloadName?: string;
  systemPromptHash?: string;
  vectorDbConnected?: boolean;
  vectorDbSourceUrl?: string | null;
  embeddingModelId?: string | null;
  euAiRiskTier?: EuAiRiskTier;
  /** Your customer's account id for this call (overrides resolveCustomerRef). */
  customerRef?: string;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof (value as Record<symbol, unknown>)[Symbol.asyncIterator] === "function"
  );
}

function extractRequestHints(args: readonly unknown[]): {
  modelName?: string;
  promptText: string;
  systemPromptHash?: string;
} {
  try {
    const firstArg = args[0];
    if (typeof firstArg !== "object" || firstArg === null) {
      return { promptText: typeof firstArg === "string" ? firstArg : "" };
    }
    const record = firstArg as Record<string, unknown>;
    const modelName =
      typeof record.model === "string" ? record.model : undefined;
    let promptText = "";
    let systemInstructionText = "";

    // Anthropic top-level `system` string or Gemini `systemInstruction`
    if (typeof record.system === "string") {
      systemInstructionText += record.system;
    } else if (typeof record.systemInstruction === "string") {
      systemInstructionText += record.systemInstruction;
    }

    if (typeof record.prompt === "string") {
      promptText = record.prompt;
    } else if (typeof record.contents === "string") {
      promptText = record.contents;
    } else if (Array.isArray(record.messages)) {
      for (const msg of record.messages) {
        if (typeof msg === "object" && msg !== null) {
          const msgObj = msg as Record<string, unknown>;
          const role = typeof msgObj.role === "string" ? msgObj.role : "";
          const content =
            typeof msgObj.content === "string" ? msgObj.content : "";
          if (content) {
            promptText += `${content} `;
            if (role === "system" || role === "developer") {
              systemInstructionText += `${content}\n`;
            }
          }
        }
      }
    }
    const systemPromptHash = systemInstructionText.trim()
      ? computeSyncPromptHash(systemInstructionText)
      : undefined;
    return { modelName, promptText, systemPromptHash };
  } catch {
    return { promptText: "" };
  }
}

/** Region used only for the SDK's local estimate when none is configured. */
const LOCAL_ESTIMATE_REGION = "us-east-1";

export class ShdwTelemetryClient {
  private readonly queue: ResilientTelemetryQueue;
  private readonly defaultGridRegion?: string;
  private readonly customGridIntensityGco2Kwh?: number;
  private readonly defaultWorkloadName: string;
  private readonly defaultEuAiRiskTier: EuAiRiskTier;
  private activeVectorStore: VectorStoreInstrumentationConfig | null = null;
  private readonly resolveCustomerRef?: () => string | undefined;

  constructor(config: ShdwClientConfig) {
    this.queue = new ResilientTelemetryQueue(config);
    this.defaultGridRegion = config.defaultGridRegion;
    this.customGridIntensityGco2Kwh = config.customGridIntensityGco2Kwh;
    this.defaultWorkloadName =
      config.defaultWorkloadName ?? "Production AI Service (Auto-Discovered)";
    this.defaultEuAiRiskTier = config.defaultEuAiRiskTier ?? "limited";
    this.resolveCustomerRef = config.resolveCustomerRef;
  }

  private currentCustomerRef(explicit?: string): string | undefined {
    if (explicit) return explicit;
    try {
      return this.resolveCustomerRef?.() || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Auto-instruments a RAG / Vector Database client (Pinecone, pgvector, Weaviate,
   * Qdrant, or LangChain retriever) so all subsequent AI-BOM telemetry pings
   * automatically include the connected RAG source URL and embedding model ID.
   */
  public wrapVectorStore<TVectorClient extends object>(
    vectorClient: TVectorClient,
    config: VectorStoreInstrumentationConfig
  ): TVectorClient {
    this.activeVectorStore = {
      sourceUrl: config.sourceUrl,
      embeddingModelId: config.embeddingModelId ?? "text-embedding-3-large",
      workloadName: config.workloadName,
    };
    return vectorClient;
  }

  /**
   * Manually records token usage and zero-touch AI-BOM discovery metadata
   * in the background without blocking.
   */
  public recordUsage(params: {
    modelName: string;
    provider?: AIProvider;
    promptTokens: number;
    completionTokens: number;
    gridRegion?: string;
    isStreaming?: boolean;
    latencyMs?: number;
    workloadName?: string;
    systemPromptHash?: string;
    /** "sha256:<hex>" of weights you host yourself (omit for hosted APIs). */
    weightsHash?: string;
    vectorDbConnected?: boolean;
    vectorDbSourceUrl?: string | null;
    embeddingModelId?: string | null;
    euAiRiskTier?: EuAiRiskTier;
    /** Your customer's account id for this call. */
    customerRef?: string;
  }): void {
    try {
      const footprint = calculateFootprint({
        modelName: params.modelName,
        promptTokens: params.promptTokens,
        completionTokens: params.completionTokens,
        // Local estimate only; the server recomputes with the reported region.
        gridRegion: params.gridRegion ?? this.defaultGridRegion ?? LOCAL_ESTIMATE_REGION,
        customGridIntensityGco2Kwh: this.customGridIntensityGco2Kwh,
        provider: params.provider,
        latencyMs: params.latencyMs,
      });

      const hasVector =
        params.vectorDbConnected ?? Boolean(this.activeVectorStore);

      const event: ShdwTelemetryEvent = {
        model_name: params.modelName,
        provider:
          params.provider ?? inferProviderFromModel(params.modelName),
        prompt_tokens: Math.max(0, Math.floor(params.promptTokens)),
        completion_tokens: Math.max(0, Math.floor(params.completionTokens)),
        estimated_energy_kwh: footprint.estimatedEnergyKwh,
        estimated_energy_kwh_min: footprint.energyKwhRange.min,
        estimated_energy_kwh_max: footprint.energyKwhRange.max,
        energy_model_match: footprint.modelMatch,
        energy_methodology: footprint.methodology,
        carbon_gco2e: footprint.carbonGco2e,
        // Omitted when not configured so the organization's Settings region applies.
        ...(this.customGridIntensityGco2Kwh !== undefined || params.gridRegion || this.defaultGridRegion
          ? { grid_region: footprint.gridRegion }
          : {}),
        grid_intensity_gco2_kwh: footprint.gridIntensityGco2PerKwh,
        is_streaming: Boolean(params.isStreaming),
        latency_ms: params.latencyMs,
        timestamp: new Date().toISOString(),
        workload_name:
          params.workloadName ??
          this.activeVectorStore?.workloadName ??
          this.defaultWorkloadName,
        prompt_hash_version:
          params.systemPromptHash ?? UNVERSIONED_PROMPT,
        ...(params.weightsHash ? { weights_hash: params.weightsHash } : {}),
        vector_db_connected: hasVector,
        vector_db_source_url: hasVector
          ? (params.vectorDbSourceUrl ??
            this.activeVectorStore?.sourceUrl ??
            null)
          : null,
        embedding_model_id: hasVector
          ? (params.embeddingModelId ??
            this.activeVectorStore?.embeddingModelId ??
            "text-embedding-3-large")
          : null,
        eu_ai_risk_tier: params.euAiRiskTier ?? this.defaultEuAiRiskTier,
      };
      const customerRef = this.currentCustomerRef(params.customerRef);
      if (customerRef) event.customer_ref = customerRef;

      this.queue.enqueue(event);
    } catch {
      // Fail-silent
    }
  }

  /**
   * Wraps an AsyncIterable SSE stream (e.g. OpenAI/Anthropic/Gemini stream),
   * yielding every chunk untouched with zero buffering delay, and enqueuing
   * the normalized carbon telemetry once the stream finishes.
   */
  public wrapAsyncIterable<TChunk>(
    stream: AsyncIterable<TChunk>,
    metadata?: TrackCallMetadata,
    startedAtMs?: number
  ): AsyncIterable<TChunk> {
    const accumulator = new SSEStreamTokenAccumulator({
      fallbackModel: metadata?.modelName,
      fallbackProvider: metadata?.provider,
      promptText: metadata?.promptText,
    });
    const recordUsageFn = this.recordUsage.bind(this);
    const region = metadata?.gridRegion ?? this.defaultGridRegion;
    const customerRef = this.currentCustomerRef(metadata?.customerRef);
    const start = startedAtMs ?? Date.now();

    return {
      [Symbol.asyncIterator]: async function* () {
        try {
          for await (const chunk of stream) {
            try {
              accumulator.ingestChunk(chunk);
            } catch {
              // Ignore telemetry parsing failure
            }
            yield chunk;
          }
        } finally {
          try {
            const usage = accumulator.finalize();
            recordUsageFn({
              modelName: usage.modelName,
              provider: usage.provider,
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              gridRegion: region,
              isStreaming: true,
              latencyMs: Math.max(0, Date.now() - start),
              workloadName: metadata?.workloadName,
              systemPromptHash: metadata?.systemPromptHash,
              vectorDbConnected: metadata?.vectorDbConnected,
              vectorDbSourceUrl: metadata?.vectorDbSourceUrl,
              embeddingModelId: metadata?.embeddingModelId,
              euAiRiskTier: metadata?.euAiRiskTier,
              customerRef,
            });
          } catch {
            // Strictly fail-silent
          }
        }
      },
    };
  }

  /**
   * Wraps any async LLM invocation function (standard or streaming).
   * Host application errors propagate untouched; SHDW telemetry runs
   * strictly in a fire-and-forget microtask.
   */
  public observeCall<TArgs extends readonly unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    metadata?: TrackCallMetadata
  ): (...args: TArgs) => Promise<TResult> {
    return async (...args: TArgs): Promise<TResult> => {
      const startedAt = Date.now();
      const hints = extractRequestHints(args);
      const effectiveMeta: TrackCallMetadata = {
        modelName: metadata?.modelName ?? hints.modelName ?? "unknown-model",
        provider: metadata?.provider,
        gridRegion: metadata?.gridRegion ?? this.defaultGridRegion,
        promptText: metadata?.promptText ?? hints.promptText,
        workloadName: metadata?.workloadName,
        systemPromptHash: metadata?.systemPromptHash ?? hints.systemPromptHash,
        vectorDbConnected: metadata?.vectorDbConnected,
        vectorDbSourceUrl: metadata?.vectorDbSourceUrl,
        embeddingModelId: metadata?.embeddingModelId,
        euAiRiskTier: metadata?.euAiRiskTier,
        customerRef: this.currentCustomerRef(metadata?.customerRef),
      };

      const result = await fn(...args);

      try {
        if (isAsyncIterable(result)) {
          return this.wrapAsyncIterable(
            result,
            effectiveMeta,
            startedAt
          ) as unknown as TResult;
        }

        const latencyMs = Math.max(0, Date.now() - startedAt);
        queueMicrotask(() => {
          try {
            const usage = normalizeStandardPayload(
              result,
              effectiveMeta.modelName,
              effectiveMeta.provider,
              effectiveMeta.promptText
            );
            this.recordUsage({
              modelName: usage.modelName,
              provider: usage.provider,
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              gridRegion: effectiveMeta.gridRegion,
              isStreaming: false,
              latencyMs,
              workloadName: effectiveMeta.workloadName,
              systemPromptHash: effectiveMeta.systemPromptHash,
              vectorDbConnected: effectiveMeta.vectorDbConnected,
              vectorDbSourceUrl: effectiveMeta.vectorDbSourceUrl,
              embeddingModelId: effectiveMeta.embeddingModelId,
              euAiRiskTier: effectiveMeta.euAiRiskTier,
              customerRef: effectiveMeta.customerRef,
            });
          } catch {
            // Fail-silent
          }
        });
      } catch {
        // Fail-silent
      }

      return result;
    };
  }

  /**
   * Deep recursive Proxy wrapper for OpenAI, Anthropic, or Google Gemini SDK client instances.
   * Intercepts `.create()`, `.stream()`, `.generateContent()`, and `.generateContentStream()`
   * without mutating the underlying SDK instance.
   */
  public wrapClient<TClient extends object>(
    client: TClient,
    options?: { provider?: AIProvider; gridRegion?: string; defaultModel?: string }
  ): TClient {
    const self = this;
    const interceptedMethods = new Set([
      "create",
      "stream",
      "generateContent",
      "generateContentStream",
      "sendMessage",
    ]);

    const createRecursiveProxy = <TTarget extends object>(target: TTarget): TTarget => {
      return new Proxy(target, {
        get(obj, prop, receiver) {
          const value = Reflect.get(obj, prop, receiver);
          if (typeof value === "function") {
            const propName = typeof prop === "string" ? prop : "";
            if (interceptedMethods.has(propName)) {
              const boundFn = value.bind(obj) as (
                ...args: readonly unknown[]
              ) => Promise<unknown>;
              return self.observeCall(boundFn, {
                provider: options?.provider,
                gridRegion: options?.gridRegion ?? self.defaultGridRegion,
                modelName: options?.defaultModel,
              });
            }
            return value.bind(obj);
          }
          if (typeof value === "object" && value !== null) {
            return createRecursiveProxy(value);
          }
          return value;
        },
      });
    };

    return createRecursiveProxy(client);
  }

  public getPendingCount(): number {
    return this.queue.getPendingCount();
  }

  /** Delivered vs. dropped event counts, for monitoring reporting coverage. */
  public getDeliveryStats(): ShdwDeliveryStats {
    return this.queue.getDeliveryStats();
  }

  public async flush(): Promise<void> {
    await this.queue.flush();
  }

  public dispose(): void {
    this.queue.dispose();
  }
}
