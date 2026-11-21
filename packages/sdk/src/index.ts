// ============================================================================
// @shdwsdk/sdk — Main Public Entrypoint
// Resilient, Non-Blocking Scope 3 AI Carbon & Energy Telemetry SDK
// ============================================================================

export {
  GRID_REGION_FACTORS,
  resolveGridRegionFactor,
  type GridRegionCarbonFactor,
} from "./grid.js";

// Client-side energy estimates (calculateFootprint, estimateInferenceEnergy,
// MODEL_ENERGY_COEFFICIENTS, ...) moved to the optional @shdwsdk/energy-model
// package in 2.0.0. The ingest server computes energy and carbon for every event.

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
  type ShdwDataRegion,
  INGEST_ENDPOINTS,
} from "./queue.js";

export {
  ShdwTelemetryClient,
  type ShdwClientConfig,
  type TrackCallMetadata,
  type ShdwCallContext,
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
  AIHosting,
  AIOperation,
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

export {
  ISO_42001_ANNEX_A,
  ISO_42001_EVIDENCE_LABELS,
  ISO_42001_REFERENCE_URL,
  evaluateIso42001,
  type Iso42001Control,
  type Iso42001Evidence,
  type Iso42001EvidenceKey,
  type Iso42001Result,
  type Iso42001Support,
} from "./iso42001.js";
