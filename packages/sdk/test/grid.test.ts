import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GRID_REGION_FACTORS, resolveGridRegionFactor } from "../src/index.js";

// The ingest Edge Function only exists in the private SHDWsdk monorepo.
const INGEST = new URL("../../../supabase/functions/_shared/ingest.ts", import.meta.url);
const itInMonorepo = existsSync(INGEST) ? it : it.skip;

describe("grid carbon factors", () => {
  it("falls back to us-east-1 for unknown or missing regions", () => {
    expect(resolveGridRegionFactor().region).toBe("us-east-1");
    expect(resolveGridRegionFactor("mars-1").region).toBe("us-east-1");
    expect(resolveGridRegionFactor(" EU-NORTH-1 ").region).toBe("eu-north-1");
  });

  itInMonorepo("keeps the Edge Function grid table in sync with GRID_REGION_FACTORS", () => {
    const edge = readFileSync(INGEST, "utf8");
    const block = edge.slice(edge.indexOf("const GRID_INTENSITY_BY_REGION"));
    const table = block.slice(block.indexOf("{") + 1, block.indexOf("};"));
    const parsed = Object.fromEntries(
      [...table.matchAll(/"([^"]+)":\s*([\d.]+)/g)].map((m) => [m[1], Number(m[2])])
    );
    const expected = Object.fromEntries(
      Object.values(GRID_REGION_FACTORS).map((g) => [g.region, g.intensityGco2PerKwh])
    );
    expect(parsed).toEqual(expected);
  });

});

import { ShdwTelemetryClient, type ShdwTelemetryEvent } from "../src/index.js";

function capture(config: ConstructorParameters<typeof ShdwTelemetryClient>[0]) {
  const events: ShdwTelemetryEvent[] = [];
  const client = new ShdwTelemetryClient({
    ...config,
    apiKey: "shdw_live_test",
    batchSize: 100,
    customFetch: async () => new Response("{}", { status: 202 }),
    onEventQueued: (ev) => events.push(ev),
  });
  return { client, events };
}

describe("telemetry payload (2.0)", () => {
  it("sends no client-side energy or carbon fields; the server computes them", () => {
    const { client, events } = capture({});
    client.recordUsage({ modelName: "gpt-4o", promptTokens: 10, completionTokens: 20 });
    const ev = events[0] as unknown as Record<string, unknown>;
    for (const k of [
      "estimated_energy_kwh",
      "estimated_energy_kwh_min",
      "estimated_energy_kwh_max",
      "energy_model_match",
      "energy_methodology",
      "carbon_gco2e",
    ]) {
      expect(ev).not.toHaveProperty(k);
    }
    expect(ev).not.toHaveProperty("grid_region");
    expect(ev.grid_intensity_gco2_kwh).toBe(GRID_REGION_FACTORS["us-east-1"].intensityGco2PerKwh);
  });

  it("reports the configured region, or a custom factor marked as custom", () => {
    const regional = capture({ defaultGridRegion: "eu-north-1" });
    regional.client.recordUsage({ modelName: "gpt-4o", promptTokens: 1, completionTokens: 1 });
    expect(regional.events[0].grid_region).toBe("eu-north-1");
    expect(regional.events[0].grid_intensity_gco2_kwh).toBe(
      GRID_REGION_FACTORS["eu-north-1"].intensityGco2PerKwh
    );

    const custom = capture({ customGridIntensityGco2Kwh: 12 });
    custom.client.recordUsage({ modelName: "gpt-4o", promptTokens: 1, completionTokens: 1 });
    expect(custom.events[0].grid_region).toBe("custom");
    expect(custom.events[0].grid_intensity_gco2_kwh).toBe(12);
  });
});
