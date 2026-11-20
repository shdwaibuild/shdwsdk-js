import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ECOLOGITS_VERSION,
  GRID_REGION_FACTORS,
  MODEL_ENERGY_COEFFICIENTS,
  calculateFootprint,
  estimateInferenceEnergy,
  resolveEnergyModel,
} from "../src/index.js";

// Reference values computed with the EcoLogits Python package v0.11.3:
//   ecologits.tracers.utils.llm_impacts(provider, model_name, output_token_count,
//                                       request_latency=1e9).energy
// [provider, model, outputTokens, minKwh, maxKwh]
// The server-side copies only exist in the private SHDWsdk monorepo; skip the
// sync checks when the SDK is built on its own.
const EDGE_SHARED = new URL("../../../supabase/functions/_shared/", import.meta.url);
const itInMonorepo = existsSync(EDGE_SHARED) ? it : it.skip;

const ECOLOGITS_REFERENCE: [string, string, number, number, number][] = [
  ["anthropic", "claude-sonnet-4-5-20250929", 800, 0.001144348020276559, 0.0019280231434650318],
  ["openai", "gpt-4o", 500, 0.000721685987445733, 0.0012027268392453513],
  ["openai", "gpt-5.5", 1200, 0.004642312562485883, 0.010152416864917874],
  ["google_genai", "gemini-2.5-flash-lite", 300, 1.7014466465806015e-05, 2.073843328726613e-05],
  ["mistralai", "mistral-large-latest", 400, 0.001150750493663741, 0.001150750493663741],
  ["cohere", "command-r7b-12-2024", 200, 1.2492426476166978e-05, 1.2492426476166978e-05],
  ["huggingface_hub", "meta-llama/Meta-Llama-3.1-8B", 650, 5.265866381941562e-05, 5.5074198857003484e-05],
  ["anthropic", "claude-opus-5-5", 3000, 0.009135379738640306, 0.017655599109262538],
  ["openai", "gpt-5.4-pro", 50, 0.00788058741939116, 0.01890079602425514],
];

describe("EcoLogits inference energy model", () => {
  it("tracks the vendored EcoLogits version", () => {
    expect(ECOLOGITS_VERSION).toBe("0.11.3");
  });

  it.each(ECOLOGITS_REFERENCE)(
    "matches EcoLogits for %s %s (%i output tokens)",
    (provider, model, tokens, minKwh, maxKwh) => {
      const estimate = estimateInferenceEnergy({
        modelName: model,
        outputTokens: tokens,
        providerHint: provider,
      });
      expect(estimate.match).toBe("exact");
      expect(estimate.energyKwh.min / minKwh).toBeCloseTo(1, 9);
      expect(estimate.energyKwh.max / maxKwh).toBeCloseTo(1, 9);
    }
  );

  it.each([
    ["claude-sonnet-4-5", "alias", "claude-sonnet-4-5-20250929"],
    ["us.anthropic.claude-sonnet-4-5-20250929-v1:0", "normalized", "claude-sonnet-4-5-20250929"],
    ["claude-opus-4-5@20251101", "normalized", "claude-opus-4-5-20251101"],
    ["models/gemini-2.5-pro", "normalized", "gemini-2.5-pro"],
    ["openai/gpt-5.5", "normalized", "gpt-5.5"],
    ["gpt-5.6-terra-2026-10-01", "normalized", "gpt-5.6-terra"],
    ["claude-3-7-sonnet", "family", "claude-3-7-sonnet-latest"],
    ["claude-3-7-sonnet-20250219", "exact", "claude-3-7-sonnet-20250219"],
    ["o1-mini", "exact", "o1-mini"],
    ["my-azure-deployment", "fallback", "unknown-model"],
  ])("resolves %s as %s", (input, match, name) => {
    const resolved = resolveEnergyModel(input);
    expect(resolved.match).toBe(match);
    expect(resolved.entry.name).toBe(name);
  });

  it("does not match short ids by accident (e.g. 'o1' inside another name)", () => {
    expect(resolveEnergyModel("gpt-4o-2024-11-20").entry.name).toBe("gpt-4o-2024-11-20");
    expect(resolveEnergyModel("foo1-bar").match).toBe("fallback");
  });

  it("caps generation time at the measured request latency", () => {
    const uncapped = estimateInferenceEnergy({ modelName: "gpt-4o", outputTokens: 500 });
    const capped = estimateInferenceEnergy({
      modelName: "gpt-4o",
      outputTokens: 500,
      requestLatencySeconds: 0.5,
    });
    expect(capped.energyKwh.mid).toBeLessThan(uncapped.energyKwh.mid);
  });

  it("never throws or returns negative/NaN energy for bad input", () => {
    for (const tokens of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const e = estimateInferenceEnergy({ modelName: "", outputTokens: tokens });
      expect(Number.isFinite(e.energyKwh.mid)).toBe(true);
      expect(e.energyKwh.min).toBeGreaterThanOrEqual(0);
    }
  });

  it("reports a range, the match type and methodology from calculateFootprint", () => {
    const f = calculateFootprint({
      modelName: "claude-sonnet-4-5",
      promptTokens: 2000,
      completionTokens: 800,
      gridRegion: "us-east-1",
    });
    expect(f.energyKwhRange.min).toBeLessThan(f.energyKwhRange.max);
    expect(f.estimatedEnergyKwh).toBeGreaterThan(f.energyKwhRange.min);
    expect(f.estimatedEnergyKwh).toBeLessThan(f.energyKwhRange.max);
    expect(f.carbonGco2eRange.max).toBeCloseTo(f.energyKwhRange.max * 367, 6);
    expect(f.modelMatch).toBe("alias");
    expect(f.methodology).toBe("ecologits-0.11.3");
  });

  it("only features models that resolve exactly", () => {
    for (const c of MODEL_ENERGY_COEFFICIENTS) {
      expect(resolveEnergyModel(c.modelPattern).match).toBe("exact");
    }
  });

  itInMonorepo("keeps the Supabase Edge Function copy identical to the SDK copy", () => {
    const sdkCopy = readFileSync(new URL("../src/energy-model.generated.ts", import.meta.url), "utf8");
    const edgeCopy = readFileSync(
      new URL("../../../supabase/functions/_shared/energy-model.generated.ts", import.meta.url),
      "utf8"
    );
    expect(edgeCopy).toBe(sdkCopy);
  });

  itInMonorepo("keeps the Edge Function grid table in sync with GRID_REGION_FACTORS", () => {
    const edge = readFileSync(
      new URL("../../../supabase/functions/_shared/ingest.ts", import.meta.url),
      "utf8"
    );
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

  it("marks custom grid factors so the server accepts them", () => {
    const f = calculateFootprint({
      modelName: "gpt-4o",
      promptTokens: 0,
      completionTokens: 100,
      gridRegion: "us-east-1",
      customGridIntensityGco2Kwh: 12,
    });
    expect(f.gridRegion).toBe("custom");
    expect(f.gridIntensityGco2PerKwh).toBe(12);
  });
});
