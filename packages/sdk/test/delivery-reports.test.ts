import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SDK_VERSION, ShdwTelemetryClient } from "../src/index.js";

type Sent = { events: unknown[]; delivery?: Record<string, unknown> };

function recorder(statuses: number[]) {
  const bodies: Sent[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)) as Sent);
    const status = statuses.length > 1 ? statuses.shift()! : statuses[0]!;
    return new Response("{}", { status });
  });
  return { bodies, fetchImpl: fetchImpl as unknown as typeof fetch };
}

const usage = { modelName: "gpt-5.5", provider: "openai" as const, promptTokens: 10, completionTokens: 5 };

describe("delivery reports", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("reports a drop with the next accepted batch, then clears the counters", async () => {
    const { bodies, fetchImpl } = recorder([401, 202]);
    const shdw = new ShdwTelemetryClient({ apiKey: "shdw_live_k", batchSize: 50, customFetch: fetchImpl });

    shdw.recordUsage(usage);
    await shdw.flush(); // rejected: revoked key
    shdw.recordUsage(usage);
    await shdw.flush(); // accepted, carries the report

    expect(bodies[0]!.delivery).toBeUndefined();
    expect(bodies[1]!.delivery).toEqual({
      sdk: "sdk-js",
      sdk_version: SDK_VERSION,
      delivered: 0,
      dropped: 1,
      retried: 0,
      drop_reasons: { rejected_auth: 1 },
      pending: 0,
    });

    shdw.recordUsage(usage);
    await shdw.flush();
    expect(bodies[2]!.delivery).toBeUndefined(); // nothing new to report within a minute
    shdw.dispose();
  });

  it("counts retries and includes delivered events once a minute", async () => {
    const { bodies, fetchImpl } = recorder([503, 202]);
    const shdw = new ShdwTelemetryClient({ apiKey: "shdw_live_k", batchSize: 50, customFetch: fetchImpl });

    shdw.recordUsage(usage);
    await shdw.flush(); // 503: re-queued
    expect(shdw.getDeliveryStats()).toMatchObject({ retried: 1, pending: 1, dropped: 0 });

    vi.advanceTimersByTime(61_000);
    await shdw.flush(); // delivered, with report
    expect(bodies[1]!.delivery).toMatchObject({ delivered: 0, retried: 1, dropped: 0 });

    vi.advanceTimersByTime(61_000);
    shdw.recordUsage(usage);
    await shdw.flush();
    expect(bodies[2]!.delivery).toMatchObject({ delivered: 1, retried: 0 });
    shdw.dispose();
  });

  it("sends a report on its own when idle, only if there is something to report", async () => {
    const { bodies, fetchImpl } = recorder([202]);
    const shdw = new ShdwTelemetryClient({ apiKey: "shdw_live_k", batchSize: 50, customFetch: fetchImpl });

    await shdw.flush();
    expect(bodies).toHaveLength(0); // nothing at all yet

    shdw.recordUsage(usage);
    await shdw.flush();
    vi.advanceTimersByTime(120_000);
    await shdw.flush();
    expect(bodies).toHaveLength(1); // idle reports wait five minutes

    vi.advanceTimersByTime(181_000);
    await shdw.flush();
    expect(bodies[1]).toEqual({
      events: [],
      delivery: expect.objectContaining({ delivered: 1, dropped: 0 }),
    });

    vi.advanceTimersByTime(400_000);
    await shdw.flush();
    expect(bodies).toHaveLength(2); // counters were cleared, so no empty reports
    shdw.dispose();
  });

  it("keeps counters when a report can't be delivered and resends them", async () => {
    const { bodies, fetchImpl } = recorder([400, 500, 202]);
    const shdw = new ShdwTelemetryClient({ apiKey: "shdw_live_k", batchSize: 50, customFetch: fetchImpl });

    shdw.recordUsage(usage);
    await shdw.flush(); // 400: dropped (rejected_payload)
    shdw.recordUsage(usage);
    await shdw.flush(); // 500 with report: report not acknowledged
    await shdw.flush(); // 202 with the same report again

    expect(bodies[1]!.delivery).toMatchObject({ dropped: 1, drop_reasons: { rejected_payload: 1 } });
    expect(bodies[2]!.delivery).toMatchObject({ dropped: 1, retried: 1, drop_reasons: { rejected_payload: 1 } });
    shdw.recordUsage(usage);
    await shdw.flush();
    expect(bodies[3]!.delivery).toBeUndefined();
    shdw.dispose();
  });

  it("never sends counters when deliveryReports is false", async () => {
    const { bodies, fetchImpl } = recorder([401, 202]);
    const shdw = new ShdwTelemetryClient({
      apiKey: "shdw_live_k",
      batchSize: 50,
      customFetch: fetchImpl,
      deliveryReports: false,
    });
    shdw.recordUsage(usage);
    await shdw.flush();
    vi.advanceTimersByTime(600_000);
    shdw.recordUsage(usage);
    await shdw.flush();
    await shdw.flush();
    expect(bodies.every((b) => b.delivery === undefined)).toBe(true);
    expect(bodies).toHaveLength(2);
    shdw.dispose();
  });
});
