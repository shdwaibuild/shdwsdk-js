// ============================================================================
// SHDWsdk Resilient Non-Blocking Background Telemetry Dispatcher
// CRITICAL ARCHITECTURAL RULE:
// - All network calls use AbortController timeouts (strictly <= 1500ms).
// - All dispatch routines are wrapped in silent try/catch blocks.
// - Never throws unhandled rejections, lags, or interrupts the host application.
// ============================================================================

import type { AIProvider, EuAiRiskTier } from "./database.types.js";

export interface ShdwTelemetryEvent {
  model_name: string;
  provider: AIProvider;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_energy_kwh: number;
  /** Lower/upper bound of the energy estimate (kWh); the server recomputes these. */
  estimated_energy_kwh_min?: number;
  estimated_energy_kwh_max?: number;
  /** How the model id was resolved against the EcoLogits catalog. */
  energy_model_match?: "exact" | "alias" | "normalized" | "family" | "fallback";
  energy_methodology?: string;
  carbon_gco2e: number;
  /** Omitted when not configured: the server uses the organization's default region. */
  grid_region?: string;
  grid_intensity_gco2_kwh: number;
  is_streaming: boolean;
  latency_ms?: number;
  timestamp: string;
  /** Optional zero-touch AI-BOM discovery fields piggybacking on the telemetry ping */
  workload_name?: string;
  prompt_hash_version?: string;
  weights_hash?: string;
  vector_db_connected?: boolean;
  vector_db_source_url?: string | null;
  embedding_model_id?: string | null;
  eu_ai_risk_tier?: EuAiRiskTier;
  /** Your customer's pseudonymous account id (per-customer Scope 3 statements). */
  customer_ref?: string;
}

export interface ShdwQueueOptions {
  apiKey: string;
  endpoint?: string;
  /** Maximum network timeout in ms. Clamped to 1500ms per architectural rule. */
  timeoutMs?: number;
  /** Batch size threshold before immediate background flush */
  batchSize?: number;
  /** Periodic flush interval in ms */
  flushIntervalMs?: number;
  /** Optional custom fetch implementation (useful for testing or custom runtimes) */
  customFetch?: typeof fetch;
  /** Optional local listener for debugging or in-app live telemetry inspection */
  onEventQueued?: (event: ShdwTelemetryEvent) => void;
  /**
   * Optional listener fired (in the background, never throwing) when a batch is
   * permanently dropped — e.g. a 4xx from a misconfigured endpoint or revoked
   * key, or buffer overflow during a long outage. Lets hosts alert on gaps in
   * reporting coverage without the SDK ever interrupting the request path.
   */
  onDeliveryFailure?: (failure: ShdwDeliveryFailure) => void;
}

export interface ShdwDeliveryFailure {
  reason: "rejected" | "buffer_overflow";
  /** HTTP status for "rejected" failures */
  status?: number;
  droppedEvents: number;
}

/** Running delivery counters, so reporting coverage can be audited. */
export interface ShdwDeliveryStats {
  queued: number;
  delivered: number;
  dropped: number;
  pending: number;
  lastFailureStatus: number | null;
  /** delivered / (delivered + dropped); 1 when nothing has been attempted yet */
  coverageRatio: number;
}

export const SDK_VERSION = "1.7.1";

const DEFAULT_INGEST_ENDPOINT =
  "https://www.shdwsdk.ai/api/v1/ingest-telemetry";
const MAX_ALLOWED_TIMEOUT_MS = 1500;

export class ResilientTelemetryQueue {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly batchSize: number;
  private readonly fetchImpl: typeof fetch;
  private readonly onEventQueued?: (event: ShdwTelemetryEvent) => void;
  private readonly onDeliveryFailure?: (failure: ShdwDeliveryFailure) => void;
  private queuedCount = 0;
  private deliveredCount = 0;
  private droppedCount = 0;
  private lastFailureStatus: number | null = null;
  private buffer: ShdwTelemetryEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;
  private beforeExitHandler: (() => void) | null = null;

  constructor(options: ShdwQueueOptions) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? DEFAULT_INGEST_ENDPOINT;
    // Enforce architectural rule: network timeout never exceeds 1500ms
    const requestedTimeout = options.timeoutMs ?? MAX_ALLOWED_TIMEOUT_MS;
    this.timeoutMs = Math.min(
      MAX_ALLOWED_TIMEOUT_MS,
      Math.max(100, requestedTimeout)
    );
    this.batchSize = Math.max(1, options.batchSize ?? 10);
    this.fetchImpl = options.customFetch ?? globalThis.fetch.bind(globalThis);
    this.onEventQueued = options.onEventQueued;
    this.onDeliveryFailure = options.onDeliveryFailure;

    const intervalMs = Math.max(500, options.flushIntervalMs ?? 3000);
    this.startBackgroundTimer(intervalMs);
    this.registerBeforeExitHook();
  }

  private registerBeforeExitHook(): void {
    try {
      const proc = (
        globalThis as {
          process?: {
            once?: (event: string, listener: () => void) => void;
          };
        }
      ).process;
      if (proc && typeof proc.once === "function") {
        this.beforeExitHandler = () => {
          if (this.buffer.length > 0) {
            void this.flush();
          }
        };
        proc.once("beforeExit", this.beforeExitHandler);
      }
    } catch {
      // Fail-silent in non-Node runtimes
    }
  }

  private startBackgroundTimer(intervalMs: number): void {
    try {
      this.flushTimer = setInterval(() => {
        void this.flush();
      }, intervalMs);

      // Ensure timer never prevents Node.js process from exiting cleanly
      if (
        this.flushTimer &&
        typeof this.flushTimer === "object" &&
        "unref" in this.flushTimer &&
        typeof (this.flushTimer as { unref?: () => void }).unref === "function"
      ) {
        (this.flushTimer as { unref: () => void }).unref();
      }
    } catch {
      // Fail-silent
    }
  }

  /**
   * Enqueues a telemetry event synchronously without blocking the caller,
   * scheduling an asynchronous background flush on the microtask queue.
   */
  public enqueue(event: ShdwTelemetryEvent): void {
    try {
      // Cap buffer at 500 events so memory stays bounded during extended offline periods
      if (this.buffer.length >= 500) {
        this.buffer.shift();
        this.recordDrop({ reason: "buffer_overflow", droppedEvents: 1 });
      }
      this.buffer.push(event);
      this.queuedCount += 1;

      if (this.onEventQueued) {
        try {
          this.onEventQueued(event);
        } catch {
          // Isolate callback errors
        }
      }

      if (this.buffer.length >= this.batchSize) {
        queueMicrotask(() => {
          void this.flush();
        });
      }
    } catch {
      // Strictly fail-silent
    }
  }

  /**
   * Flushes queued events using an AbortController strictly capped at <= 1500ms.
   * Never throws or rejects.
   */
  public async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) {
      return;
    }

    this.isFlushing = true;
    const batch = this.buffer.splice(0, this.batchSize);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch {
        // Ignore abort errors
      }
    }, this.timeoutMs);

    try {
      const res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SHDW-Key": this.apiKey,
          "X-SHDW-SDK-Version": SDK_VERSION,
        },
        body: JSON.stringify({ events: batch }),
        signal: controller.signal,
        keepalive: true,
      });

      if (res.ok) {
        this.deliveredCount += batch.length;
      } else if (res.status >= 500 || res.status === 429) {
        this.requeueOrDrop(batch);
      } else {
        // 4xx (bad key, wrong endpoint, malformed payload) will not succeed on
        // retry. Count it so the gap is visible instead of silently vanishing.
        this.recordDrop({
          reason: "rejected",
          status: res.status,
          droppedEvents: batch.length,
        });
      }
    } catch {
      // CRITICAL ARCHITECTURAL GUARANTEE:
      // Network timeouts, DNS errors, 5xx downtime, or CORS issues never throw to host.
      this.requeueOrDrop(batch);
    } finally {
      clearTimeout(timeoutId);
      this.isFlushing = false;
    }
  }

  private requeueOrDrop(batch: ShdwTelemetryEvent[]): void {
    if (this.buffer.length < 450) {
      this.buffer.unshift(...batch);
    } else {
      this.recordDrop({ reason: "buffer_overflow", droppedEvents: batch.length });
    }
  }

  private recordDrop(failure: ShdwDeliveryFailure): void {
    try {
      this.droppedCount += failure.droppedEvents;
      if (failure.status !== undefined) {
        this.lastFailureStatus = failure.status;
      }
      if (this.onDeliveryFailure) {
        const listener = this.onDeliveryFailure;
        queueMicrotask(() => {
          try {
            listener(failure);
          } catch {
            // Isolate callback errors
          }
        });
      }
    } catch {
      // Strictly fail-silent
    }
  }

  public getPendingCount(): number {
    return this.buffer.length;
  }

  public getDeliveryStats(): ShdwDeliveryStats {
    const attempted = this.deliveredCount + this.droppedCount;
    return {
      queued: this.queuedCount,
      delivered: this.deliveredCount,
      dropped: this.droppedCount,
      pending: this.buffer.length,
      lastFailureStatus: this.lastFailureStatus,
      coverageRatio: attempted === 0 ? 1 : this.deliveredCount / attempted,
    };
  }

  public dispose(): void {
    try {
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }
      if (this.beforeExitHandler) {
        const proc = (
          globalThis as {
            process?: {
              removeListener?: (event: string, listener: () => void) => void;
            };
          }
        ).process;
        if (proc && typeof proc.removeListener === "function") {
          proc.removeListener("beforeExit", this.beforeExitHandler);
        }
        this.beforeExitHandler = null;
      }
    } catch {
      // Fail-silent
    }
  }
}
