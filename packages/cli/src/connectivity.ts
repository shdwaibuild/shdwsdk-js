// ============================================================================
// @shdwsdk/cli — Live Connectivity Validation Ping
// Sends a lightweight validation ping to the SHDWsdk ingestion endpoint using
// an AbortController strictly clamped to <= 1500ms.
// ============================================================================

import { calculateFootprint, resolveModelCoefficient } from "@shdwsdk/energy-model";

export const DEFAULT_SHDW_INGEST_ENDPOINT =
  "https://www.shdwsdk.ai/api/v1/ingest-telemetry";
const MAX_CONNECTIVITY_TIMEOUT_MS = 1500;

export interface ConnectivityTestResult {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  endpoint: string;
  message: string;
}

export async function testShdwConnectivity(params: {
  apiKey: string;
  modelPattern: string;
  gridRegion: string;
  endpoint?: string;
  timeoutMs?: number;
  customFetch?: typeof fetch;
}): Promise<ConnectivityTestResult> {
  const endpoint = params.endpoint ?? DEFAULT_SHDW_INGEST_ENDPOINT;
  const timeoutMs = Math.min(
    MAX_CONNECTIVITY_TIMEOUT_MS,
    Math.max(100, params.timeoutMs ?? MAX_CONNECTIVITY_TIMEOUT_MS)
  );
  const fetchImpl = params.customFetch ?? globalThis.fetch.bind(globalThis);

  const coeff = resolveModelCoefficient(params.modelPattern);
  const footprint = calculateFootprint({
    modelName: params.modelPattern,
    promptTokens: 1,
    completionTokens: 1,
    gridRegion: params.gridRegion,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    try {
      controller.abort();
    } catch {
      // Ignore abort errors
    }
  }, timeoutMs);

  const startedAt = Date.now();

  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SHDW-Key": params.apiKey,
        "X-SHDW-SDK-Version": "1.2.0-cli-init",
      },
      body: JSON.stringify({
        events: [
          {
            model_name: params.modelPattern,
            provider: coeff.provider,
            prompt_tokens: 1,
            completion_tokens: 1,
            estimated_energy_kwh: footprint.estimatedEnergyKwh,
            carbon_gco2e: footprint.carbonGco2e,
            grid_region: footprint.gridRegion,
            grid_intensity_gco2_kwh: footprint.gridIntensityGco2PerKwh,
            is_streaming: false,
            latency_ms: 1,
            timestamp: new Date().toISOString(),
            workload_name: "CLI Setup Verification Ping",
          },
        ],
      }),
      signal: controller.signal,
    });

    const latencyMs = Math.max(1, Date.now() - startedAt);

    if (res.ok || res.status === 202) {
      return {
        ok: true,
        status: res.status,
        latencyMs,
        endpoint,
        message: `Connected (${res.status}) in ${latencyMs}ms — API key and telemetry route verified.`,
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: res.status,
        latencyMs,
        endpoint,
        message: `Endpoint reachable (${res.status}), but API key was rejected. Verify your shdw_live_* key in the Dashboard.`,
      };
    }

    return {
      ok: false,
      status: res.status,
      latencyMs,
      endpoint,
      message: `Endpoint returned HTTP ${res.status} in ${latencyMs}ms. Local config was saved; telemetry will fail silently until the endpoint recovers.`,
    };
  } catch (err: unknown) {
    const latencyMs = Math.max(1, Date.now() - startedAt);
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.toLowerCase().includes("abort"));

    return {
      ok: false,
      status: null,
      latencyMs,
      endpoint,
      message: isAbort
        ? `Connectivity check timed out after ${timeoutMs}ms (non-blocking guard active). Local config was saved.`
        : `Could not reach ${endpoint} (${err instanceof Error ? err.message : "network error"}). Local config was saved.`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
