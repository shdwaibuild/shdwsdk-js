// ============================================================================
// @shdwsdk/sdk — Main Public Entrypoint
// Resilient, Non-Blocking Scope 3 AI Carbon & Energy Telemetry SDK
// ============================================================================

export {
  GRID_REGION_FACTORS,
  MODEL_ENERGY_COEFFICIENTS,
  calculateFootprint,
  resolveGridRegionFactor,
  resolveModelCoefficient,
  type CarbonCalculationResult,
  type GridRegionCarbonFactor,
  type ModelEnergyCoefficient,
} from "./coefficients.js";

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

export {
  SSEStreamTokenAccumulator,
  estimateTokensFromText,
  inferProviderFromModel,
  normalizeStandardPayload,
  type NormalizedTokenUsage,
} from "./normalizer.js";

export {
  ResilientTelemetryQueue,
  SDK_VERSION,
  type ShdwDeliveryFailure,
  type ShdwDeliveryReport,
  type ShdwDeliveryStats,
  type ShdwDropReason,
  type ShdwQueueOptions,
  type ShdwTelemetryEvent,
} from "./queue.js";

export {
  ShdwTelemetryClient,
  type ShdwClientConfig,
  type TrackCallMetadata,
  type VectorStoreInstrumentationConfig,
} from "./wrappers.js";

export {
  CANONICAL_MODEL_WEIGHTS_HASHES,
  DEFAULT_NIST_RMF_CATALOG,
  LEGACY_NIST_CONTROL_CODES,
  NIST_AI_RMF_REFERENCE_URL,
  UNVERSIONED_PROMPT,
  describeVectorStore,
  evaluateGovernanceControls,
  normalizeNistControlCode,
  sha256DigestHex,
  type GovernanceControlResult,
  type GovernanceControlStatus,
  type GovernanceEvidence,
  compileCycloneDxMlBom,
  compileSpdx3AiBom,
  computeComplianceReadinessScore,
  computeSyncPromptHash,
  computeZeroKnowledgePromptHash,
  resolveCanonicalWeightsHash,
  type CompileAiBomInput,
} from "./aibom.js";

export {
  detectAiSdksInManifest,
  scanProjectManifestForAiBom,
  type ManifestSdkDetection,
  type DiscoveredAiBomWorkload,
  type ScanManifestInput,
} from "./scanner.js";

export type {
  AIProvider,
  AiBomInventoryItem,
  ApiKeyRow,
  ComplianceAssessmentRow,
  ComplianceAssessmentStatus,
  CustomerAccountRow,
  IngestSource,
  UsageReconciliationRow,
  CycloneDxMlBomComponent,
  CycloneDxMlBomDocument,
  Database,
  EuAiRiskTier,
  ModelProvenanceRow,
  NistGovernanceStatus,
  NistRmfControlItem,
  NistRmfFunction,
  OrganizationRow,
  RegulatoryComplianceMapping,
  Spdx3AiBomDocument,
  Spdx3ElementNode,
  SubscriptionStatus,
  SubscriptionTier,
  TokenLogRow,
} from "./database.types.js";
