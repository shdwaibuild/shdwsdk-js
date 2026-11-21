import { describe, expect, it, vi } from "vitest";
import { ShdwTelemetryClient } from "../src/index.js";

function capture() {
  const events: Array<Record<string, unknown>> = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    events.push(...(JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> }).events);
    return new Response("{}", { status: 202 });
  });
  return { events, fetchImpl: fetchImpl as unknown as typeof fetch };
}

describe("attribution, hosting and operations", () => {
  it("takes matter, workflow and trace from the context resolver", async () => {
    const { events, fetchImpl } = capture();
    const shdw = new ShdwTelemetryClient({
      apiKey: "shdw_live_k",
      batchSize: 50,
      customFetch: fetchImpl,
      defaultHosting: "azure",
      resolveContext: () => ({ customerRef: "firm-42", matterRef: "M-2026-0042", workflowName: "Due diligence", traceId: "4bf92f3577b34da6a3ce929d0e0e4736" }),
    });
    shdw.recordUsage({ modelName: "gpt-4o", provider: "openai", promptTokens: 10, completionTokens: 5 });
    await shdw.flush();
    expect(events[0]).toMatchObject({
      customer_ref: "firm-42",
      matter_ref: "M-2026-0042",
      workflow_name: "Due diligence",
      trace_id: "4bf92f3577b34da6a3ce929d0e0e4736",
      hosting: "azure",
    });
  });

  it("per-call values win over the resolver, and a throwing resolver never breaks the call", async () => {
    const { events, fetchImpl } = capture();
    const shdw = new ShdwTelemetryClient({
      apiKey: "shdw_live_k",
      batchSize: 50,
      customFetch: fetchImpl,
      resolveContext: () => {
        throw new Error("no request context");
      },
    });
    shdw.recordUsage({
      modelName: "text-embedding-3-large",
      provider: "openai",
      promptTokens: 800,
      completionTokens: 0,
      operation: "embedding",
      matterRef: "M-1",
      hosting: "self_hosted",
    });
    shdw.recordUsage({ modelName: "whisper-1", promptTokens: 0, completionTokens: 0, operation: "transcription", audioSeconds: 90 });
    await shdw.flush();
    expect(events[0]).toMatchObject({ operation: "embedding", matter_ref: "M-1", hosting: "self_hosted" });
    expect(events[0]).not.toHaveProperty("customer_ref");
    expect(events[1]).toMatchObject({ operation: "transcription", audio_seconds: 90 });
  });

  it("observeCall carries context into wrapped calls", async () => {
    const { events, fetchImpl } = capture();
    const shdw = new ShdwTelemetryClient({ apiKey: "shdw_live_k", batchSize: 50, customFetch: fetchImpl });
    const call = shdw.observeCall(
      async (_req: { model: string }) => ({ model: "mistral-large-latest", usage: { prompt_tokens: 12, completion_tokens: 3 } }),
      { provider: "mistral", matterRef: "M-7", workflowName: "Contract review", hosting: "vendor_api" }
    );
    await call({ model: "mistral-large-latest" });
    await new Promise((r) => setTimeout(r, 0));
    await shdw.flush();
    expect(events[0]).toMatchObject({ provider: "mistral", matter_ref: "M-7", workflow_name: "Contract review", hosting: "vendor_api" });
  });
});

describe("partner accounts", () => {
  it("tags events with the client organization slug", async () => {
    const { events, fetchImpl } = capture();
    const shdw = new ShdwTelemetryClient({
      apiKey: "shdw_live_partner",
      batchSize: 50,
      customFetch: fetchImpl,
      resolveContext: () => ({ orgSlug: "firm-one", customerRef: "firm-one" }),
    });
    shdw.recordUsage({ modelName: "gpt-4o", promptTokens: 1, completionTokens: 1 });
    shdw.recordUsage({ modelName: "gpt-4o", promptTokens: 1, completionTokens: 1, orgSlug: "firm-two" });
    await shdw.flush();
    expect(events[0]).toMatchObject({ org_slug: "firm-one" });
    expect(events[1]).toMatchObject({ org_slug: "firm-two" });
  });
});

describe("data region", () => {
  it("sends to the EU endpoint when region is eu, and an explicit endpoint still wins", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return new Response("{}", { status: 202 });
    }) as unknown as typeof fetch;
    const eu = new ShdwTelemetryClient({ apiKey: "k", region: "eu", batchSize: 50, customFetch: fetchImpl });
    eu.recordUsage({ modelName: "gpt-4o", promptTokens: 1, completionTokens: 1 });
    await eu.flush();
    const custom = new ShdwTelemetryClient({ apiKey: "k", region: "eu", endpoint: "https://relay.internal/ingest", batchSize: 50, customFetch: fetchImpl });
    custom.recordUsage({ modelName: "gpt-4o", promptTokens: 1, completionTokens: 1 });
    await custom.flush();
    expect(urls).toEqual(["https://www.shdwsdk.ai/eu/api/v1/ingest-telemetry", "https://relay.internal/ingest"]);
  });
});
