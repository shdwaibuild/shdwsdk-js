// ============================================================================
// SHDWsdk Resilient Non-Blocking Background Telemetry Dispatcher
// CRITICAL ARCHITECTURAL RULE:
// - All network calls use AbortController timeouts (strictly <= 1500ms).
// - All dispatch routines are wrapped in silent try/catch blocks.
// - Never throws unhandled rejections, lags, or interrupts the host application.
// ============================================================================

import type { AIHosting, AIOperation, AIProvider, EuAiRiskTier } from "./database.types.js";

/**
 * One telemetry event as sent to the ingest API. Energy and carbon are not
 * part of the payload: the ingest server computes them (EcoLogits model,
 * organization grid region) and stores them with the event.
 */
export interface ShdwTelemetryEvent {
  model_name: string;
  provider: AIProvider;
  prompt_tokens: number;
  completion_tokens: number;
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
  /** A second attribution level under the customer (a matter, case or project id). */
  matter_ref?: string;
  /** Groups the calls of one multi-step agent run. */
  trace_id?: string;
  /** Partner keys only: the client organization (slug) this call belongs to. */
  org_slug?: string;
  workflow_name?: string;
  hosting?: AIHosting;
  operation?: AIOperation;
  audio_seconds?: number;
  image_count?: number;
}

export interface ShdwQueueOptions {
  apiKey: string;
  /**
   * Data region of your SHDWsdk organization: "us" (default) or "eu". Use the
   * region shown in Settings → Data; a key only works in its own region.
   */
  region?: ShdwDataRegion;
  /** Overrides the region's endpoint (e.g. a private relay). */
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
  /**
   * Send delivery counters (delivered, dropped by reason, retried) to SHDWsdk
   * so the developer console can show real drop rates. Counters only, never
   * payloads. Defaults to true.
   */
  deliveryReports?: boolean;
}

/** Why events were dropped, as reported to the developer console. */
export type ShdwDropReason =
  | "buffer_overflow"
  | "rejected_auth"
  | "rejected_payload"
  | "rejected_other";

/** Counters sent with telemetry so the developer console can show drop rates. */
export interface ShdwDeliveryReport {
  sdk: "sdk-js";
  sdk_version: string;
  delivered: number;
  dropped: number;
  retried: number;
  drop_reasons: Partial<Record<ShdwDropReason, number>>;
  pending: number;
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
  /** Events re-queued after a timeout, network error, 429 or 5xx. */
  retried: number;
  pending: number;
  lastFailureStatus: number | null;
  /** delivered / (delivered + dropped); 1 when nothing has been attempted yet */
  coverageRatio: number;
}

export const SDK_VERSION = "2.0.0";

/** Where telemetry is stored. "eu" keeps it in Frankfurt (eu-central-1). */
export type ShdwDataRegion = "us" | "eu";

export const INGEST_ENDPOINTS: Record<ShdwDataRegion, string> = {
  us: "https://www.shdwsdk.ai/api/v1/ingest-telemetry",
  eu: "https://www.shdwsdk.ai/eu/api/v1/ingest-telemetry",
};
const DEFAULT_INGEST_ENDPOINT = INGEST_ENDPOINTS.us;
const MAX_ALLOWED_TIMEOUT_MS = 1500;
/** Counters ride along with a batch at most this often... */
const REPORT_WITH_BATCH_MS = 60_000;
/** ...and are sent on their own when idle, only if there is something to report. */
const REPORT_WHEN_IDLE_MS = 300_000;

function dropReasonFor(failure: ShdwDeliveryFailure): ShdwDropReason {
  if (failure.reason === "buffer_overflow") return "buffer_overflow";
  if (failure.status === 401 || failure.status === 403) return "rejected_auth";
  if (failure.status === 400 || failure.status === 413 || failure.status === 422) return "rejected_payload";
  return "rejected_other";
}

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
  private retriedCount = 0;
  private lastFailureStatus: number | null = null;
  private readonly deliveryReports: boolean;
  private unreported = { delivered: 0, dropped: 0, retried: 0, reasons: {} as Partial<Record<ShdwDropReason, number>> };
  private lastReportAt = Date.now();
  private buffer: ShdwTelemetryEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;
  private beforeExitHandler: (() => void) | null = null;

  constructor(options: ShdwQueueOptions) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? (options.region ? INGEST_ENDPOINTS[options.region] : undefined) ?? DEFAULT_INGEST_ENDPOINT;
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
    this.deliveryReports = options.deliveryReports !== false;

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
    if (this.isFlushing) {
      return;
    }
    const now = Date.now();
    const hasUnreported = this.hasUnreportedCounters();
    const reportDue =
      this.deliveryReports &&
      hasUnreported &&
      (now - this.lastReportAt >= (this.buffer.length > 0 ? REPORT_WITH_BATCH_MS : REPORT_WHEN_IDLE_MS) ||
        (this.buffer.length > 0 && this.unreported.dropped > 0));
    if (this.buffer.length === 0 && !reportDue) {
      return;
    }

    this.isFlushing = true;
    const batch = this.buffer.splice(0, this.batchSize);
    const report = reportDue ? this.buildReport() : null;
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
        body: JSON.stringify(report ? { events: batch, delivery: report } : { events: batch }),
        signal: controller.signal,
        keepalive: true,
      });

      if (res.ok) {
        this.deliveredCount += batch.length;
        this.unreported.delivered += batch.length;
        if (report) this.markReported(report);
      } else if (res.status >= 500 || res.status === 429) {
        this.requeueOrDrop(batch);
      } else {
        // 4xx (bad key, wrong endpoint, malformed payload) will not succeed on
        // retry. Count it so the gap is visible instead of silently vanishing.
        // Unreported counters are kept and sent with the next accepted request.
        if (batch.length > 0) {
          this.recordDrop({
            reason: "rejected",
            status: res.status,
            droppedEvents: batch.length,
          });
        }
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

  private hasUnreportedCounters(): boolean {
    const u = this.unreported;
    return u.delivered + u.dropped + u.retried > 0;
  }

  private buildReport(): ShdwDeliveryReport {
    return {
      sdk: "sdk-js",
      sdk_version: SDK_VERSION,
      delivered: this.unreported.delivered,
      dropped: this.unreported.dropped,
      retried: this.unreported.retried,
      drop_reasons: { ...this.unreported.reasons },
      pending: this.buffer.length,
    };
  }

  /** Subtracts what was just reported, keeping anything counted meanwhile. */
  private markReported(report: ShdwDeliveryReport): void {
    const u = this.unreported;
    u.delivered = Math.max(0, u.delivered - report.delivered);
    u.dropped = Math.max(0, u.dropped - report.dropped);
    u.retried = Math.max(0, u.retried - report.retried);
    for (const [k, n] of Object.entries(report.drop_reasons) as [ShdwDropReason, number][]) {
      const left = (u.reasons[k] ?? 0) - n;
      if (left > 0) u.reasons[k] = left;
      else delete u.reasons[k];
    }
    this.lastReportAt = Date.now();
  }

  private requeueOrDrop(batch: ShdwTelemetryEvent[]): void {
    if (batch.length === 0) return;
    if (this.buffer.length < 450) {
      this.retriedCount += batch.length;
      this.unreported.retried += batch.length;
      this.buffer.unshift(...batch);
    } else {
      this.recordDrop({ reason: "buffer_overflow", droppedEvents: batch.length });
    }
  }

  private recordDrop(failure: ShdwDeliveryFailure): void {
    try {
      this.droppedCount += failure.droppedEvents;
      this.unreported.dropped += failure.droppedEvents;
      const reason = dropReasonFor(failure);
      this.unreported.reasons[reason] = (this.unreported.reasons[reason] ?? 0) + failure.droppedEvents;
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
      retried: this.retriedCount,
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
