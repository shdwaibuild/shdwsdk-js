// ============================================================================
// SHDWsdk energy & carbon footprint (client-side estimate)
// ============================================================================
// Methodology:
//   E_inference (kWh) = EcoLogits LLM inference model (see energy-model.generated.ts):
//                       driven by output tokens, the model's active/total parameter
//                       estimates, and the provider's datacenter PUE. Reported as a
//                       {min, max} range; `estimatedEnergyKwh` is the midpoint.
//   C_scope3 (gCO2e)  = E_inference (kWh) * I_grid (gCO2e/kWh)
//
// This file is MIT-licensed. It uses energy-model.generated.ts, which is
// MPL-2.0 because it is derived from EcoLogits; see LICENSE.
// The SHDWsdk ingest server runs the same model, so these numbers match what
// your dashboard shows.
// ============================================================================

import {
  resolveGridRegionFactor,
  type AIProvider,
} from "@shdwsdk/sdk";
import {
  ENERGY_METHODOLOGY,
  estimateInferenceEnergy,
  resolveEnergyModel,
  type EnergyModelEntry,
  type EnergyModelMatch,
  type EnergyProvider,
  type EnergyRange,
} from "./energy-model.generated.js";

export interface ModelEnergyCoefficient {
  modelPattern: string;
  provider: AIProvider;
  vendorGroup:
    | "Anthropic"
    | "OpenAI"
    | "Google DeepMind"
    | "Mistral AI (EU Sovereign)"
    | "Meta Llama"
    | "DeepSeek"
    | "Cohere";
  displayName: string;
  parameterClass:
    | "frontier-moe"
    | "large-dense"
    | "mid-tier"
    | "compact-flash"
    | "reasoning";
  /**
   * Energy per 1,000 prompt tokens in kWh (pre-PUE). Always 0: the EcoLogits
   * methodology attributes inference energy to generated tokens only.
   */
  promptKwhPer1kTokens: number;
  /** Midpoint energy per 1,000 completion tokens in kWh (pre-PUE), for display. */
  completionKwhPer1kTokens: number;
  /** Hyperscaler datacenter Power Usage Effectiveness multiplier */
  datacenterPue: number;
  /** Accelerator reference class */
  acceleratorClass: string;
}


/** Current flagship models offered in the CLI setup wizard. */
const FEATURED_MODELS: readonly string[] = [
  "claude-opus-5-5",
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
  "gpt-6.1-sol",
  "gpt-6-luna",
  "gpt-5.5",
  "gemini-3.8-flash",
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash-lite",
  "mistral-large-latest",
  "command-a-plus-05-2026",
];

const VENDOR_GROUP: Record<EnergyProvider, ModelEnergyCoefficient["vendorGroup"]> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google_genai: "Google DeepMind",
  mistralai: "Mistral AI (EU Sovereign)",
  cohere: "Cohere",
  huggingface_hub: "Meta Llama",
};

const SDK_PROVIDER: Record<EnergyProvider, AIProvider> = {
  anthropic: "anthropic",
  openai: "openai",
  google_genai: "gemini",
  mistralai: "custom",
  cohere: "custom",
  huggingface_hub: "custom",
};

function parameterClassFor(entry: EnergyModelEntry): ModelEnergyCoefficient["parameterClass"] {
  const active = (entry.activeParamsB.min + entry.activeParamsB.max) / 2;
  const isMoe = entry.totalParamsB.max > entry.activeParamsB.max;
  if (active < 40) return "compact-flash";
  if (active < 100) return isMoe ? "frontier-moe" : "mid-tier";
  return isMoe ? "frontier-moe" : "large-dense";
}

function toCoefficient(entry: EnergyModelEntry, match: EnergyModelMatch): ModelEnergyCoefficient {
  const per1k = estimateInferenceEnergy({
    modelName: entry.name,
    outputTokens: 1000,
    providerHint: entry.provider,
  });
  const pueMid = (per1k.pue.min + per1k.pue.max) / 2;
  if (match === "fallback") {
    return {
      modelPattern: "default-frontier",
      provider: "custom",
      vendorGroup: "OpenAI",
      displayName: "Unrecognized model (generic frontier-class estimate)",
      parameterClass: "frontier-moe",
      promptKwhPer1kTokens: 0,
      completionKwhPer1kTokens: Number((per1k.energyKwh.mid / pueMid).toFixed(8)),
      datacenterPue: Number(pueMid.toFixed(3)),
      acceleratorClass: "NVIDIA H100 80GB reference (EcoLogits)",
    };
  }
  return {
    modelPattern: entry.name,
    provider: SDK_PROVIDER[entry.provider],
    vendorGroup: VENDOR_GROUP[entry.provider],
    displayName: entry.name,
    parameterClass: parameterClassFor(entry),
    promptKwhPer1kTokens: 0,
    completionKwhPer1kTokens: Number((per1k.energyKwh.mid / pueMid).toFixed(8)),
    datacenterPue: Number(pueMid.toFixed(3)),
    acceleratorClass: "NVIDIA H100 80GB reference (EcoLogits)",
  };
}

export const MODEL_ENERGY_COEFFICIENTS: readonly ModelEnergyCoefficient[] = FEATURED_MODELS.map(
  (name) => {
    const { entry, match } = resolveEnergyModel(name);
    return toCoefficient(entry, match);
  }
);

export function resolveModelCoefficient(modelName: string): ModelEnergyCoefficient {
  const { entry, match } = resolveEnergyModel(modelName);
  return toCoefficient(entry, match);
}


export interface CarbonCalculationResult {
  /** Midpoint of the energy range, in kWh (PUE included). */
  estimatedEnergyKwh: number;
  energyKwhRange: EnergyRange;
  /** Midpoint of the carbon range, in gCO2e. */
  carbonGco2e: number;
  carbonGco2eRange: EnergyRange;
  gridRegion: string;
  gridIntensityGco2PerKwh: number;
  /** Catalog model used for the estimate, or null when a generic fallback was used. */
  matchedModel: string | null;
  modelMatch: EnergyModelMatch;
  methodology: string;
  coefficientUsed: ModelEnergyCoefficient;
}

/**
 * Computes Scope 3 inference energy (kWh) and carbon emissions (gCO2e) for one
 * request using the EcoLogits methodology. Never throws.
 */
export function calculateFootprint(params: {
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  gridRegion?: string;
  customGridIntensityGco2Kwh?: number;
  provider?: string;
  /** Measured request latency; caps modelled generation time as in EcoLogits. */
  latencyMs?: number;
}): CarbonCalculationResult {
  const grid = resolveGridRegionFactor(params.gridRegion);
  const usesCustomGrid =
    typeof params.customGridIntensityGco2Kwh === "number" &&
    params.customGridIntensityGco2Kwh > 0;
  const gridIntensity = usesCustomGrid
    ? (params.customGridIntensityGco2Kwh as number)
    : grid.intensityGco2PerKwh;

  const estimate = estimateInferenceEnergy({
    modelName: params.modelName,
    outputTokens: Math.max(0, params.completionTokens),
    providerHint: params.provider,
    requestLatencySeconds:
      typeof params.latencyMs === "number" ? params.latencyMs / 1000 : undefined,
  });
  const { entry, match } = resolveEnergyModel(params.modelName, params.provider);

  const round = (n: number, digits: number) => Number(n.toFixed(digits));
  const energyMin = round(estimate.energyKwh.min, 10);
  const energyMax = round(estimate.energyKwh.max, 10);

  return {
    estimatedEnergyKwh: round(estimate.energyKwh.mid, 10),
    energyKwhRange: { min: energyMin, max: energyMax },
    carbonGco2e: round(estimate.energyKwh.mid * gridIntensity, 8),
    carbonGco2eRange: {
      min: round(estimate.energyKwh.min * gridIntensity, 8),
      max: round(estimate.energyKwh.max * gridIntensity, 8),
    },
    // "custom" tells the ingest server to accept the customer-supplied factor
    // instead of its own table value for a known region.
    gridRegion: usesCustomGrid ? "custom" : grid.region,
    gridIntensityGco2PerKwh: gridIntensity,
    matchedModel: estimate.matchedModel,
    modelMatch: estimate.match,
    methodology: ENERGY_METHODOLOGY,
    coefficientUsed: toCoefficient(entry, match),
  };
}
