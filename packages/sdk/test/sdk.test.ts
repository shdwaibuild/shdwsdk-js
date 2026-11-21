import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  SDK_VERSION,
  SSEStreamTokenAccumulator,
  ShdwTelemetryClient,
  compileCycloneDxMlBom,
  compileSpdx3AiBom,
  computeComplianceReadinessScore,
  normalizeStandardPayload,
} from "../src/index.js";

describe("@shdwsdk/sdk — Resilient Non-Blocking Carbon Telemetry", () => {
  it("normalizes OpenAI, Anthropic, and Gemini payloads accurately", () => {
    const openaiUsage = normalizeStandardPayload({
      model: "gpt-4o-2024-11-20",
      usage: { prompt_tokens: 1200, completion_tokens: 400 },
    });
    expect(openaiUsage.provider).toBe("openai");
    expect(openaiUsage.promptTokens).toBe(1200);
    expect(openaiUsage.completionTokens).toBe(400);
    expect(openaiUsage.isEstimatedFallback).toBe(false);

    const anthropicUsage = normalizeStandardPayload({
      model: "claude-3-7-sonnet-20250219",
      usage: { input_tokens: 2500, output_tokens: 850 },
    });
    expect(anthropicUsage.provider).toBe("anthropic");
    expect(anthropicUsage.promptTokens).toBe(2500);
    expect(anthropicUsage.completionTokens).toBe(850);

    const geminiUsage = normalizeStandardPayload({
      modelVersion: "gemini-2.5-pro",
      usageMetadata: { promptTokenCount: 3000, candidatesTokenCount: 600 },
    });
    expect(geminiUsage.provider).toBe("gemini");
    expect(geminiUsage.promptTokens).toBe(3000);
    expect(geminiUsage.completionTokens).toBe(600);
  });

  it("parses Server-Sent Events (SSE) streaming chunks accurately", () => {
    const acc = new SSEStreamTokenAccumulator({
      fallbackModel: "gpt-4o",
      promptText: "Analyze Scope 3 emissions for enterprise LLM workloads.",
    });

    acc.ingestChunk(
      'data: {"id":"chatcmpl-1","model":"gpt-4o","choices":[{"delta":{"content":"Scope 3 "}}]}\n\n'
    );
    acc.ingestChunk(
      'data: {"id":"chatcmpl-1","model":"gpt-4o","choices":[{"delta":{"content":"telemetry verified."}}],"usage":{"prompt_tokens":42,"completion_tokens":18}}\n\n'
    );
    acc.ingestChunk("data: [DONE]\n\n");

    const finalized = acc.finalize();
    expect(finalized.modelName).toBe("gpt-4o");
    expect(finalized.promptTokens).toBe(42);
    expect(finalized.completionTokens).toBe(18);
    expect(finalized.isEstimatedFallback).toBe(false);
  });

  it("fails silently and never interrupts host application when telemetry server is down or times out", async () => {
    const failingFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const shdw = new ShdwTelemetryClient({
      apiKey: "shdw_live_test_key_12345",
      endpoint: "https://unreachable.shdw.internal/ingest",
      timeoutMs: 1500,
      batchSize: 1,
      customFetch: failingFetch as unknown as typeof fetch,
    });

    const mockOpenAIClient = {
      chat: {
        completions: {
          create: async () => ({
            id: "chatcmpl-ok",
            model: "gpt-4o",
            choices: [{ message: { content: "Host response unaffected" } }],
            usage: { prompt_tokens: 150, completion_tokens: 50 },
          }),
        },
      },
    };

    const wrappedClient = shdw.wrapClient(mockOpenAIClient, {
      provider: "openai",
      gridRegion: "us-west-2",
    });

    const response = await wrappedClient.chat.completions.create();
    expect(response.choices[0]?.message.content).toBe(
      "Host response unaffected"
    );

    await shdw.flush();
    shdw.dispose();
  });

  it("counts 4xx rejections as dropped and reports them without throwing", async () => {
    // Simulates a misrouted endpoint (e.g. an SPA catch-all returning 405) or a revoked key
    const rejectingFetch = vi
      .fn()
      .mockResolvedValue(new Response("<!doctype html>", { status: 405 }));
    const failures: Array<{ reason: string; status?: number; droppedEvents: number }> = [];

    const shdw = new ShdwTelemetryClient({
      apiKey: "shdw_live_rejected_key",
      endpoint: "https://shdwsdk.ai/api/v1/ingest-telemetry",
      batchSize: 50,
      customFetch: rejectingFetch as unknown as typeof fetch,
      onDeliveryFailure: (failure) => {
        failures.push(failure);
      },
    });

    shdw.recordUsage({
      modelName: "gpt-4o",
      provider: "openai",
      promptTokens: 100,
      completionTokens: 20,
    });
    await shdw.flush();
    await Promise.resolve();

    const stats = shdw.getDeliveryStats();
    expect(stats.delivered).toBe(0);
    expect(stats.dropped).toBe(1);
    expect(stats.pending).toBe(0);
    expect(stats.lastFailureStatus).toBe(405);
    expect(stats.coverageRatio).toBe(0);
    expect(failures).toEqual([{ reason: "rejected", status: 405, droppedEvents: 1 }]);
    shdw.dispose();
  });

  it("keeps SDK_VERSION in sync with package.json", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    ) as { version: string };
    expect(SDK_VERSION).toBe(pkg.version);
  });

  it("sends the package version header and counts delivered events", async () => {
    const okFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 202 }));

    const shdw = new ShdwTelemetryClient({
      apiKey: "shdw_live_ok_key",
      batchSize: 50,
      customFetch: okFetch as unknown as typeof fetch,
    });
    shdw.recordUsage({ modelName: "gpt-4o", provider: "openai", promptTokens: 10, completionTokens: 5 });
    await shdw.flush();

    const init = okFetch.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-SHDW-SDK-Version"]).toBe(SDK_VERSION);
    expect(shdw.getDeliveryStats()).toMatchObject({ queued: 1, delivered: 1, dropped: 0, coverageRatio: 1 });
    shdw.dispose();
  });

  it("attaches customer refs from per-call metadata or the resolver", async () => {
    const okFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 202 }));
    let current: string | undefined = "acme-corp";
    const shdw = new ShdwTelemetryClient({
      apiKey: "shdw_live_ok_key",
      batchSize: 50,
      customFetch: okFetch as unknown as typeof fetch,
      resolveCustomerRef: () => current,
    });
    shdw.recordUsage({ modelName: "gpt-4o", provider: "openai", promptTokens: 1, completionTokens: 1 });
    shdw.recordUsage({ modelName: "gpt-4o", provider: "openai", promptTokens: 1, completionTokens: 1, customerRef: "globex" });
    current = undefined;
    shdw.recordUsage({ modelName: "gpt-4o", provider: "openai", promptTokens: 1, completionTokens: 1 });
    await shdw.flush();
    const body = JSON.parse(String((okFetch.mock.calls[0]?.[1] as RequestInit).body)) as {
      events: Array<{ customer_ref?: string }>;
    };
    expect(body.events.map((e) => e.customer_ref)).toEqual(["acme-corp", "globex", undefined]);
    shdw.dispose();
  });

  it("leaves grid_region to the server unless a region is configured", async () => {
    const okFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 202 }));
    const unset = new ShdwTelemetryClient({ apiKey: "shdw_live_ok_key", customFetch: okFetch as unknown as typeof fetch });
    unset.recordUsage({ modelName: "gpt-4o", provider: "openai", promptTokens: 1, completionTokens: 1 });
    unset.recordUsage({ modelName: "gpt-4o", provider: "openai", promptTokens: 1, completionTokens: 1, gridRegion: "eu-north-1" });
    await unset.flush();
    const set = new ShdwTelemetryClient({ apiKey: "shdw_live_ok_key", defaultGridRegion: "us-west-2", customFetch: okFetch as unknown as typeof fetch });
    set.recordUsage({ modelName: "gpt-4o", provider: "openai", promptTokens: 1, completionTokens: 1 });
    await set.flush();
    const regions = okFetch.mock.calls.flatMap((c) =>
      (JSON.parse(String((c[1] as RequestInit).body)) as { events: Array<{ grid_region?: string }> }).events.map((e) => e.grid_region)
    );
    expect(regions).toEqual([undefined, "eu-north-1", "us-west-2"]);
    unset.dispose();
    set.dispose();
  });

  it("re-queues failed batches on HTTP 5xx server errors when buffer capacity permits (< 450)", async () => {
    const serverErrorFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("Internal Server Error", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true }), { status: 202 }));

    const shdw = new ShdwTelemetryClient({
      apiKey: "shdw_live_retry_test_key",
      endpoint: "https://shdwsdk.ai/api/v1/ingest-telemetry",
      timeoutMs: 1500,
      batchSize: 50,
      customFetch: serverErrorFetch as unknown as typeof fetch,
    });

    shdw.recordUsage({
      modelName: "gpt-4o",
      provider: "openai",
      promptTokens: 500,
      completionTokens: 200,
      gridRegion: "us-west-2",
    });

    expect(shdw.getPendingCount()).toBe(1);

    // First flush receives 503 -> batch is unshifted back onto buffer
    await shdw.flush();
    expect(shdw.getPendingCount()).toBe(1);

    // Second flush receives 202 -> buffer is drained
    await shdw.flush();
    expect(shdw.getPendingCount()).toBe(0);

    shdw.dispose();
  });

  it("compiles CycloneDX ML-BOM v1.7 (.cdx.json) and SPDX 3.0 AI Profile JSON-LD (.spdx.json)", () => {
    const org = {
      id: "00000000-0000-4000-8000-000000000010",
      name: "Horizon Enterprise AI",
      slug: "horizon-ai",
      owner_id: null,
      stripe_customer_id: "cus_horizon_123",
      subscription_status: "active" as const,
      subscription_tier: "scale" as const,
      default_grid_region: "us-west-2",
      public_trust_enabled: true,
      created_at: "2026-11-15T00:00:00.000Z",
    };

    const provenanceRows = [
      {
        id: "prov-horizon-1",
        org_id: org.id,
        workload_name: "Enterprise Contract Review Copilot",
        provider: "anthropic" as const,
        base_model: "Claude 3.7 Sonnet",
        model_version: "claude-3-7-sonnet-20250219",
        weights_hash: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        vector_db_connected: true,
        vector_db_source_url: "https://pinecone.io/indexes/legal-corpus-v3",
        embedding_model_id: "text-embedding-3-large",
        prompt_hash_version: "sha256:4b227777d4dd1fc6",
        eu_ai_risk_tier: "limited" as const,
        updated_at: "2026-11-15T12:00:00.000Z",
      },
    ];

    const cdx = compileCycloneDxMlBom({
      organization: org,
      provenanceRows,
      energyByModel: {
        "claude-3-7-sonnet-20250219": { energyKwh: 14.2, carbonGco2e: 1959.6 },
      },
    });

    expect(cdx.bomFormat).toBe("CycloneDX");
    expect(cdx.specVersion).toBe("1.7");
    expect(cdx.components.length).toBe(3); // ML model + RAG data + embedding model
    const model = cdx.components[0];
    // The supplied digest is a real SHA-256 value, so it is kept as organization-supplied
    expect(model?.hashes?.[0]?.content).toBe(
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
    );
    expect(
      model?.modelCard?.considerations?.environmentalConsiderations?.energyConsumptions?.[0]
        ?.energyProvided?.value
    ).toBe(14.2);

    // Hosted API model without a digest: no hashes are invented
    const noDigest = compileCycloneDxMlBom({
      organization: org,
      provenanceRows: [{ ...provenanceRows[0]!, weights_hash: null as unknown as string }],
    });
    expect(noDigest.components[0]?.hashes).toBeUndefined();

    // Public downloads never contain infrastructure URLs
    const redacted = JSON.stringify(
      compileCycloneDxMlBom({ organization: org, provenanceRows, redactInfrastructure: true })
    );
    expect(redacted).not.toContain("pinecone.io/indexes");
    expect(redacted).toContain("Pinecone");

    const spdx = compileSpdx3AiBom({ organization: org, provenanceRows });

    expect(spdx["@context"]).toBe("https://spdx.org/rdf/3.0.1/spdx-context.jsonld");
    expect(spdx["@graph"].some((n) => n["@type"] === "ai_AIPackage")).toBe(true);
    expect(spdx["@graph"].some((n) => n["@type"] === "dataset_DatasetPackage")).toBe(true);
    expect(
      spdx["@graph"].some(
        (n) => n["@type"] === "Relationship" && n.relationshipType === "dependsOn"
      )
    ).toBe(true);
    // A RAG store is a runtime dependency, never training data
    expect(
      spdx["@graph"].some(
        (n) => n["@type"] === "Relationship" && n.relationshipType === "trainedOn"
      )
    ).toBe(false);

    const readiness = computeComplianceReadinessScore({
      provenanceCount: 2,
      euAiRiskTier: "limited",
      governControls: ["GV-1.1", "GV-3.2"],
      mapControls: ["MP-2.1", "MP-4.1"],
      measureControls: ["MS-1.1", "MS-2.5"],
      manageControls: ["MG-2.2", "MG-3.1"],
    });
    // Legacy codes map onto all 7 NIST subcategories (MG-2.2 has no equivalent)
    expect(readiness.score).toBe(100);
    expect(readiness.suggestedNistStatus).toBe("managed");
  });
});
