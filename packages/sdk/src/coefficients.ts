// ============================================================================
// SHDWsdk Energy & Carbon Coefficients
// ============================================================================
// Methodology:
//   E_inference (kWh) = EcoLogits LLM inference model (see energy-model.generated.ts):
//                       driven by output tokens, the model's active/total parameter
//                       estimates, and the provider's datacenter PUE. Reported as a
//                       {min, max} range; `estimatedEnergyKwh` is the midpoint.
//   C_scope3 (gCO2e)  = E_inference (kWh) * I_grid (gCO2e/kWh)
//
// Sources:
// - EcoLogits model catalog & methodology (vendored, see vendor/ecologits)
// - US EPA eGRID (2024/2025 Release)
// - European Environment Agency (EEA), Ember Climate & Electricity Maps (2025)
// - Environment Canada, UK DESNZ, ONS Brazil, EMA Singapore, MOE Japan, CEA India
// ============================================================================

import type { AIProvider } from "./database.types.js";
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

export interface GridRegionCarbonFactor {
  region: string;
  regionGroup:
    | "European Union, EEA, UK & Switzerland"
    | "North America (United States & Canada)"
    | "Asia-Pacific & Latin America";
  displayName: string;
  cloudProviderEquivalent: string;
  /** Grid carbon intensity in gCO2e per kWh (EPA eGRID / EEA / Ember 2025) */
  intensityGco2PerKwh: number;
  /** Standard regulatory jurisdiction note */
  jurisdictionNote: string;
}

export const GRID_REGION_FACTORS: Record<string, GridRegionCarbonFactor> = {
  // --------------------------------------------------------------------------
  // 1. EUROPEAN UNION, EEA, UK & SWITZERLAND (EU AI Act & CSRD / ESRS E1)
  // --------------------------------------------------------------------------
  "eu-north-1": {
    region: "eu-north-1",
    regionGroup: "European Union, EEA, UK & Switzerland",
    displayName: "EU North — Stockholm, Sweden (Hydro & Nuclear)",
    cloudProviderEquivalent: "AWS eu-north-1 / GCP europe-north1 / Azure Sweden Central",
    intensityGco2PerKwh: 28.0,
    jurisdictionNote: "EU AI Act & CSRD ESRS E1 · EEA / Ember Verified",
  },
  "eu-central-2": {
    region: "eu-central-2",
    regionGroup: "European Union, EEA, UK & Switzerland",
    displayName: "Europe — Zurich, Switzerland (Alpine Hydro & Nuclear)",
    cloudProviderEquivalent: "AWS eu-central-2 / GCP europe-west6 / Azure Switzerland North",
    intensityGco2PerKwh: 42.0,
    jurisdictionNote: "Swiss FOEN & European Grid Interconnect Verified",
  },
  "eu-west-3": {
    region: "eu-west-3",
    regionGroup: "European Union, EEA, UK & Switzerland",
    displayName: "EU West — Paris, France (Low-Carbon Nuclear)",
    cloudProviderEquivalent: "AWS eu-west-3 / GCP europe-west9 / Azure France Central",
    intensityGco2PerKwh: 56.0,
    jurisdictionNote: "EU AI Act & CSRD ESRS E1 · RTE / EEA Verified",
  },
  "eu-south-2": {
    region: "eu-south-2",
    regionGroup: "European Union, EEA, UK & Switzerland",
    displayName: "EU South — Madrid & Aragon, Spain (Wind & Solar)",
    cloudProviderEquivalent: "AWS eu-south-2 / GCP europe-southwest1 / Azure Spain Central",
    intensityGco2PerKwh: 162.0,
    jurisdictionNote: "EU AI Act & CSRD ESRS E1 · Red Eléctrica / EEA Verified",
  },
  "eu-west-2": {
    region: "eu-west-2",
    regionGroup: "European Union, EEA, UK & Switzerland",
    displayName: "Europe (UK) — London, United Kingdom",
    cloudProviderEquivalent: "AWS eu-west-2 / GCP europe-west2 / Azure UK South",
    intensityGco2PerKwh: 207.0,
    jurisdictionNote: "UK DESNZ / National Grid ESO Greenhouse Gas Conversion",
  },
  "europe-west4": {
    region: "europe-west4",
    regionGroup: "European Union, EEA, UK & Switzerland",
    displayName: "EU West — Eemshaven & Amsterdam, Netherlands",
    cloudProviderEquivalent: "GCP europe-west4 / Azure West Europe",
    intensityGco2PerKwh: 258.0,
    jurisdictionNote: "EU AI Act & CSRD ESRS E1 · EEA Verified",
  },
  "eu-west-1": {
    region: "eu-west-1",
    regionGroup: "European Union, EEA, UK & Switzerland",
    displayName: "EU West — Dublin, Ireland",
    cloudProviderEquivalent: "AWS eu-west-1 / Azure North Europe",
    intensityGco2PerKwh: 274.0,
    jurisdictionNote: "EU AI Act & CSRD ESRS E1 · EirGrid / SEAI / EEA Verified",
  },
  "eu-south-1": {
    region: "eu-south-1",
    regionGroup: "European Union, EEA, UK & Switzerland",
    displayName: "EU South — Milan, Italy",
    cloudProviderEquivalent: "AWS eu-south-1 / GCP europe-west8 / Azure Italy North",
    intensityGco2PerKwh: 296.0,
    jurisdictionNote: "EU AI Act & CSRD ESRS E1 · ISPRA / EEA Verified",
  },
  "eu-central-1": {
    region: "eu-central-1",
    regionGroup: "European Union, EEA, UK & Switzerland",
    displayName: "EU Central — Frankfurt, Germany",
    cloudProviderEquivalent: "AWS eu-central-1 / GCP europe-west3 / Azure Germany West Central",
    intensityGco2PerKwh: 348.0,
    jurisdictionNote: "EU AI Act & CSRD ESRS E1 · Umweltbundesamt (UBA) / EEA Verified",
  },
  "europe-central2": {
    region: "europe-central2",
    regionGroup: "European Union, EEA, UK & Switzerland",
    displayName: "EU Central — Warsaw, Poland",
    cloudProviderEquivalent: "GCP europe-central2 / Azure Poland Central",
    intensityGco2PerKwh: 615.0,
    jurisdictionNote: "EU AI Act & CSRD ESRS E1 · KOBiZE / EEA Verified",
  },

  // --------------------------------------------------------------------------
  // 2. NORTH AMERICA (UNITED STATES & CANADA — EPA eGRID & Environment Canada)
  // --------------------------------------------------------------------------
  "ca-central-1": {
    region: "ca-central-1",
    regionGroup: "North America (United States & Canada)",
    displayName: "Canada Central — Montréal, Québec (99% Hydro)",
    cloudProviderEquivalent: "AWS ca-central-1 / GCP northamerica-northeast1",
    intensityGco2PerKwh: 14.0,
    jurisdictionNote: "Environment and Climate Change Canada (NIR) Verified",
  },
  "us-west-2": {
    region: "us-west-2",
    regionGroup: "North America (United States & Canada)",
    displayName: "US West — Oregon (NWPP Hydro Clean Grid)",
    cloudProviderEquivalent: "AWS us-west-2 / GCP us-west1 / Azure West US 2",
    intensityGco2PerKwh: 138.0,
    jurisdictionNote: "US EPA eGRID NWPP Subregion Verified",
  },
  "us-west-1": {
    region: "us-west-1",
    regionGroup: "North America (United States & Canada)",
    displayName: "US West — N. California (CAMX Solar & Hydro)",
    cloudProviderEquivalent: "AWS us-west-1 / GCP us-west2 / Azure West US",
    intensityGco2PerKwh: 214.0,
    jurisdictionNote: "US EPA eGRID CAMX Subregion & California SB 253 Ready",
  },
  "us-east-1": {
    region: "us-east-1",
    regionGroup: "North America (United States & Canada)",
    displayName: "US East — N. Virginia (SERC / PJM)",
    cloudProviderEquivalent: "AWS us-east-1 / GCP us-east4 / Azure East US",
    intensityGco2PerKwh: 367.0,
    jurisdictionNote: "US EPA eGRID SRVC Subregion Verified",
  },
  "us-central1": {
    region: "us-central1",
    regionGroup: "North America (United States & Canada)",
    displayName: "US Central — Iowa & Texas (MROW / ERCOT Wind & Gas)",
    cloudProviderEquivalent: "GCP us-central1 / Azure Central US / AWS us-south",
    intensityGco2PerKwh: 392.0,
    jurisdictionNote: "US EPA eGRID MROW / ERCT Subregion Verified",
  },
  "us-east-2": {
    region: "us-east-2",
    regionGroup: "North America (United States & Canada)",
    displayName: "US East — Ohio (RFCW)",
    cloudProviderEquivalent: "AWS us-east-2 / GCP us-east5",
    intensityGco2PerKwh: 412.0,
    jurisdictionNote: "US EPA eGRID RFCW Subregion Verified",
  },

  // --------------------------------------------------------------------------
  // 3. ASIA-PACIFIC & LATIN AMERICA
  // --------------------------------------------------------------------------
  "sa-east-1": {
    region: "sa-east-1",
    regionGroup: "Asia-Pacific & Latin America",
    displayName: "South America — São Paulo, Brazil (88% Renewables)",
    cloudProviderEquivalent: "AWS sa-east-1 / GCP southamerica-east1 / Azure Brazil South",
    intensityGco2PerKwh: 74.0,
    jurisdictionNote: "Brazil ONS / MCTI SIN National Grid Verified",
  },
  "ap-southeast-1": {
    region: "ap-southeast-1",
    regionGroup: "Asia-Pacific & Latin America",
    displayName: "Asia Pacific — Singapore",
    cloudProviderEquivalent: "AWS ap-southeast-1 / GCP asia-southeast1 / Azure Southeast Asia",
    intensityGco2PerKwh: 398.0,
    jurisdictionNote: "Singapore Energy Market Authority (EMA) Grid Factor",
  },
  "ap-northeast-1": {
    region: "ap-northeast-1",
    regionGroup: "Asia-Pacific & Latin America",
    displayName: "Asia Pacific — Tokyo, Japan",
    cloudProviderEquivalent: "AWS ap-northeast-1 / GCP asia-northeast1 / Azure Japan East",
    intensityGco2PerKwh: 462.0,
    jurisdictionNote: "Japan Ministry of the Environment (MOE) Verified",
  },
  "ap-southeast-2": {
    region: "ap-southeast-2",
    regionGroup: "Asia-Pacific & Latin America",
    displayName: "Asia Pacific — Sydney, Australia",
    cloudProviderEquivalent: "AWS ap-southeast-2 / GCP australia-southeast1 / Azure Australia East",
    intensityGco2PerKwh: 485.0,
    jurisdictionNote: "Australian National Greenhouse Accounts (NGA) Verified",
  },
  "ap-south-1": {
    region: "ap-south-1",
    regionGroup: "Asia-Pacific & Latin America",
    displayName: "Asia Pacific — Mumbai, India",
    cloudProviderEquivalent: "AWS ap-south-1 / GCP asia-south1 / Azure Central India",
    intensityGco2PerKwh: 632.0,
    jurisdictionNote: "Central Electricity Authority (CEA) India CO2 Baseline",
  },
  "global-average": {
    region: "global-average",
    regionGroup: "Asia-Pacific & Latin America",
    displayName: "Global Multi-Region Anycast Average",
    cloudProviderEquivalent: "Global Multi-Cloud Routing",
    intensityGco2PerKwh: 385.0,
    jurisdictionNote: "IEA / Ember Global Datacenter Weighted Mean",
  },
};

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

export function resolveGridRegionFactor(region?: string): GridRegionCarbonFactor {
  if (!region) {
    return GRID_REGION_FACTORS["us-east-1"];
  }
  const key = region.toLowerCase().trim();
  return GRID_REGION_FACTORS[key] ?? GRID_REGION_FACTORS["us-east-1"];
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
