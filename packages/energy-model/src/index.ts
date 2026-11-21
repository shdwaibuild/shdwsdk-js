// ============================================================================
// @shdwsdk/energy-model — client-side AI inference energy & carbon estimates
// ============================================================================
// Optional companion to @shdwsdk/sdk. The SDK sends model IDs and token counts;
// the SHDWsdk ingest server computes energy and carbon with this same model.
// Install this package only if you want estimates locally (CLIs, dashboards,
// offline what-if tools).
// ============================================================================

export {
  MODEL_ENERGY_COEFFICIENTS,
  calculateFootprint,
  resolveModelCoefficient,
  type CarbonCalculationResult,
  type ModelEnergyCoefficient,
} from "./footprint.js";

export {
  ECOLOGITS_VERSION,
  ENERGY_METHODOLOGY,
  ENERGY_MODEL_CATALOG,
  estimateInferenceEnergy,
  resolveEnergyModel,
  type EnergyModelEntry,
  type EnergyModelMatch,
  type EnergyProvider,
  type EnergyRange,
  type InferenceEnergyEstimate,
} from "./energy-model.generated.js";

// Re-exported for convenience so callers need one import.
export {
  GRID_REGION_FACTORS,
  resolveGridRegionFactor,
  type GridRegionCarbonFactor,
} from "@shdwsdk/sdk";
