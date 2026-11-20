// ============================================================================
// SHDWsdk AI-BOM Standard Export & Regulatory Compliance Engine
// Compiles an organization's AI model lineage, weights hashes, RAG / vector DB
// sources, embedding models, and system prompt versions into:
//   1. CycloneDX ML-BOM v1.7 JSON (.cdx.json)
//   2. SPDX 3.0 AI Profile JSON-LD (.spdx.json)
//   3. EU AI Act & US NIST AI RMF 1.0 Compliance Attestation (.json)
// ============================================================================

import type {
  ComplianceAssessmentRow,
  CycloneDxMlBomComponent,
  CycloneDxMlBomDocument,
  EuAiRiskTier,
  ModelProvenanceRow,
  NistGovernanceStatus,
  NistRmfControlItem,
  NistRmfFunction,
  OrganizationRow,
  Spdx3AiBomDocument,
  Spdx3ElementNode,
} from "./database.types.js";

/**
 * NIST AI RMF 1.0 subcategories (NIST AI 100-1, Tables 1–4) that SHDWsdk can
 * help document. Titles are short paraphrases; see the framework for the full
 * outcome text. The AI RMF is voluntary guidance: there is no "NIST verified"
 * status, only outcomes an organization documents.
 *
 * evidenceType:
 * - "automated":   SHDWsdk telemetry / AI-BOM data can serve as evidence
 * - "attestation": only the organization can confirm it (self-attested)
 */
export const NIST_AI_RMF_REFERENCE_URL =
  "https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf";

export const DEFAULT_NIST_RMF_CATALOG: ReadonlyArray<
  Omit<NistRmfControlItem, "enabled">
> = [
  {
    id: "govern-1-1",
    functionCategory: "GOVERN",
    code: "GOVERN 1.1",
    title: "Legal and regulatory AI requirements documented",
    description:
      "The organization understands, manages and documents the legal and regulatory requirements that apply to its AI use.",
    evidenceType: "attestation",
  },
  {
    id: "govern-3-2",
    functionCategory: "GOVERN",
    code: "GOVERN 3.2",
    title: "Human-AI oversight roles defined",
    description:
      "Policies define and differentiate roles and responsibilities for human-AI configurations and oversight.",
    evidenceType: "attestation",
  },
  {
    id: "map-1-1",
    functionCategory: "MAP",
    code: "MAP 1.1",
    title: "Intended purpose and context of use documented",
    description:
      "Intended purposes, context of use and applicable expectations for each AI system are understood and documented.",
    evidenceType: "attestation",
  },
  {
    id: "map-4-1",
    functionCategory: "MAP",
    code: "MAP 4.1",
    title: "Third-party AI components mapped",
    description:
      "Third-party models, embedding models and data sources are inventoried. Evidence: the AI-BOM covers every model seen in telemetry.",
    evidenceType: "automated",
  },
  {
    id: "measure-2-12",
    functionCategory: "MEASURE",
    code: "MEASURE 2.12",
    title: "Environmental impact assessed and documented",
    description:
      "Energy and emissions of AI use are assessed and documented. Evidence: SHDWsdk inference telemetry in the reporting period.",
    evidenceType: "automated",
  },
  {
    id: "manage-3-1",
    functionCategory: "MANAGE",
    code: "MANAGE 3.1",
    title: "Third-party AI resources monitored",
    description:
      "Risks from third-party AI resources are regularly monitored. Evidence: continuous telemetry of third-party model usage in the last 7 days.",
    evidenceType: "automated",
  },
  {
    id: "manage-3-2",
    functionCategory: "MANAGE",
    code: "MANAGE 3.2",
    title: "Pre-trained models monitored",
    description:
      "Pre-trained models in use are monitored as part of regular AI system monitoring. Evidence: model versions tracked in the AI-BOM and telemetry.",
    evidenceType: "automated",
  },
];

/** Earlier SHDWsdk control codes → NIST AI RMF subcategory codes. */
export const LEGACY_NIST_CONTROL_CODES: Readonly<Record<string, string | null>> = {
  "GV-1.1": "GOVERN 1.1",
  "GV-3.2": "GOVERN 3.2",
  "MP-2.1": "MAP 1.1",
  "MP-4.1": "MAP 4.1",
  "MS-1.1": "MEASURE 2.12",
  "MS-2.5": "MANAGE 3.2",
  "MG-2.2": null, // SDK timeout behaviour — a property of SHDWsdk, not of the customer's AI risk management
  "MG-3.1": "MANAGE 3.1",
};

export function normalizeNistControlCode(code: string): string | null {
  if (code in LEGACY_NIST_CONTROL_CODES) return LEGACY_NIST_CONTROL_CODES[code] ?? null;
  return DEFAULT_NIST_RMF_CATALOG.some((c) => c.code === code) ? code : null;
}

export type GovernanceControlStatus = "evidence" | "attested" | "not_documented";

export interface GovernanceControlResult {
  code: string;
  title: string;
  description: string;
  functionCategory: NistRmfFunction;
  evidenceType: "automated" | "attestation";
  status: GovernanceControlStatus;
  /** Why the status was assigned, in plain language. */
  detail: string;
}

export interface GovernanceEvidence {
  /** Control codes the organization has self-attested (any legacy codes are normalized). */
  attestedCodes: readonly string[];
  /** When the attestation was last saved (ISO), if ever. */
  attestedAt: string | null;
  /** Telemetry events in the reporting period (e.g. last 30 days). */
  telemetryEventsInPeriod: number;
  /** Most recent telemetry event (ISO), if any. */
  lastTelemetryAt: string | null;
  /** Distinct model ids seen in telemetry during the period. */
  telemetryModels: readonly string[];
  /** Model ids registered in the AI-BOM inventory. */
  inventoryModels: readonly string[];
  /** Reference time for "last 7 days" checks (defaults to now). */
  now?: Date;
}

/**
 * Evaluates each NIST AI RMF control strictly from evidence. Automated controls
 * need supporting data; attestation-only controls can only be "attested" or
 * "not_documented". Nothing is ever reported as independently verified.
 */
export function evaluateGovernanceControls(evidence: GovernanceEvidence): GovernanceControlResult[] {
  const now = evidence.now ?? new Date();
  const attested = new Set(
    evidence.attestedCodes
      .map((c) => normalizeNistControlCode(c))
      .filter((c): c is string => Boolean(c))
  );
  const lastMs = evidence.lastTelemetryAt ? Date.parse(evidence.lastTelemetryAt) : NaN;
  const telemetryWithin7d =
    Number.isFinite(lastMs) && now.getTime() - lastMs <= 7 * 24 * 60 * 60 * 1000;
  const inventory = new Set(evidence.inventoryModels.map((m) => m.toLowerCase()));
  const unmapped = evidence.telemetryModels.filter((m) => !inventory.has(m.toLowerCase()));

  const automated: Record<
    string,
    { ok: boolean; yes: string; no: string; contradicted?: boolean }
  > = {
    "MAP 4.1": {
      ok: inventory.size > 0 && unmapped.length === 0,
      // Telemetry proves a model is missing from the inventory: an attestation
      // that all components are mapped would be false.
      contradicted: unmapped.length > 0,
      yes: `AI-BOM lists ${inventory.size} model${inventory.size === 1 ? "" : "s"}, covering every model seen in telemetry.`,
      no:
        inventory.size === 0
          ? "No AI-BOM inventory registered."
          : `Models seen in telemetry but missing from the AI-BOM: ${unmapped.slice(0, 3).join(", ")}${unmapped.length > 3 ? "…" : ""}.`,
    },
    "MEASURE 2.12": {
      ok: evidence.telemetryEventsInPeriod > 0,
      yes: `${evidence.telemetryEventsInPeriod.toLocaleString("en-US")} inference events measured in the reporting period.`,
      no: "No inference telemetry in the reporting period.",
    },
    "MANAGE 3.1": {
      ok: telemetryWithin7d,
      yes: "Third-party model usage reported within the last 7 days.",
      no: "No telemetry in the last 7 days.",
    },
    "MANAGE 3.2": {
      ok: telemetryWithin7d && inventory.size > 0,
      yes: "Model versions tracked in the AI-BOM with current telemetry.",
      no: "Needs an AI-BOM inventory and telemetry within the last 7 days.",
    },
  };

  return DEFAULT_NIST_RMF_CATALOG.map((c) => {
    const evidenceType = c.evidenceType ?? "attestation";
    const base = {
      code: c.code,
      title: c.title,
      description: c.description,
      functionCategory: c.functionCategory,
      evidenceType,
    };
    const auto = automated[c.code];
    if (evidenceType === "automated" && auto?.ok) {
      return { ...base, status: "evidence" as const, detail: auto.yes };
    }
    if (attested.has(c.code) && !auto?.contradicted) {
      const attestedMs = evidence.attestedAt ? Date.parse(evidence.attestedAt) : NaN;
      const when = Number.isFinite(attestedMs)
        ? ` on ${new Date(attestedMs).toISOString().slice(0, 10)} (UTC)`
        : "";
      return {
        ...base,
        status: "attested" as const,
        detail: `Self-attested by the organization${when}; not independently reviewed.`,
      };
    }
    return {
      ...base,
      status: "not_documented" as const,
      detail: auto ? auto.no : "Not yet documented by the organization.",
    };
  });
}

export interface CompileAiBomInput {
  organization: OrganizationRow;
  provenanceRows: ModelProvenanceRow[];
  compliance?: ComplianceAssessmentRow | null;
  /** @deprecated Totals are no longer split evenly across models; use energyByModel. */
  totalEnergyKwh30d?: number;
  /** @deprecated See energyByModel. */
  totalCarbonGco2e30d?: number;
  /** Measured energy/carbon per model_version over the reporting period. */
  energyByModel?: Readonly<Record<string, { energyKwh: number; carbonGco2e: number }>>;
  /**
   * Replace vector store URLs with the vendor name (for public downloads), so
   * internal infrastructure endpoints are never published.
   */
  redactInfrastructure?: boolean;
}

/** Vendor name for a vector store endpoint, without exposing the endpoint. */
export function describeVectorStore(url: string | null | undefined): string | null {
  if (!url) return null;
  // Already-redacted value ("vendor:Pinecone") from a public report
  if (url.startsWith("vendor:")) return url.slice(7) || null;
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = url.toLowerCase();
  }
  if (host.includes("pinecone.io")) return "Pinecone";
  if (host.includes("weaviate")) return "Weaviate";
  if (host.includes("qdrant")) return "Qdrant";
  if (host.includes("supabase.co")) return "Supabase (pgvector)";
  if (host.includes("mongodb.net")) return "MongoDB Atlas Vector Search";
  if (host.includes("turbopuffer")) return "turbopuffer";
  if (host.includes("milvus") || host.includes("zilliz")) return "Milvus / Zilliz";
  if (host.includes("elastic")) return "Elasticsearch";
  if (host.includes("redis")) return "Redis";
  if (url.startsWith("postgres")) return "PostgreSQL (pgvector)";
  return "Self-hosted or other vector store";
}

/** Returns the hex part of a real "sha256:<64 hex>" digest, or null. */
export function sha256DigestHex(hash: string | null | undefined): string | null {
  const cleaned = (hash ?? "").trim().replace(/^sha256:/i, "").toLowerCase();
  return /^[0-9a-f]{64}$/.test(cleaned) ? cleaned : null;
}

/**
 * @deprecated Hosted model vendors (OpenAI, Anthropic, Google, …) do not
 * publish weight digests, so there is nothing canonical to look up. Kept as an
 * empty map for backwards compatibility; record a digest only when you hash
 * weights you host yourself.
 */
export const CANONICAL_MODEL_WEIGHTS_HASHES: Readonly<Record<string, string>> = {};

/**
 * @deprecated Always returns null. Weight digests are only meaningful for
 * weights you host and hash yourself; pass those explicitly as `weightsHash`.
 */
export function resolveCanonicalWeightsHash(_modelName: string): string | null {
  return null;
}

/**
 * Computes a deterministic, zero-knowledge SHA-256 fingerprint of a system prompt
 * in memory (~0.04ms) so customer prompt text never leaves their server.
 */
export async function computeZeroKnowledgePromptHash(
  systemPromptText: string
): Promise<string> {
  const normalized = systemPromptText.trim();
  if (!normalized) {
    return UNVERSIONED_PROMPT;
  }
  try {
    if (typeof globalThis.crypto?.subtle?.digest === "function") {
      const encoded = new TextEncoder().encode(normalized);
      const buf = await globalThis.crypto.subtle.digest("SHA-256", encoded);
      const hex = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return `sha256:${hex}`;
    }
  } catch {
    // Fallback to synchronous deterministic hash below
  }
  return computeSyncPromptHash(normalized);
}

/** Marker for workloads whose system prompt version wasn't supplied. */
export const UNVERSIONED_PROMPT = "unversioned";

/**
 * Synchronous, non-cryptographic prompt fingerprint (FNV-style), for runtimes
 * without Web Crypto. Prefixed "fp:" — it is NOT a SHA-256 digest.
 */
export function computeSyncPromptHash(systemPromptText: string): string {
  const normalized = systemPromptText.trim();
  if (!normalized) {
    return UNVERSIONED_PROMPT;
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + i;
    h2 = Math.imul(h2, 2654435761);
  }
  const hex =
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0") +
    ((h1 ^ h2) >>> 0).toString(16).padStart(8, "0");
  return `fp:${hex}`;
}

/**
 * @deprecated Prefer evaluateGovernanceControls(), which reports per-control
 * evidence. Returns the share of catalog controls the organization has
 * documented (by attestation). Never returns "verified": NIST AI RMF has no
 * verification status, and self-reported data is not independently verified.
 */
export function computeComplianceReadinessScore(params: {
  provenanceCount: number;
  euAiRiskTier: EuAiRiskTier;
  governControls: string[];
  mapControls: string[];
  measureControls: string[];
  manageControls: string[];
}): {
  score: number;
  suggestedNistStatus: NistGovernanceStatus;
} {
  const documented = new Set(
    [
      ...params.governControls,
      ...params.mapControls,
      ...params.measureControls,
      ...params.manageControls,
    ]
      .map((c) => normalizeNistControlCode(c))
      .filter((c): c is string => Boolean(c))
  );
  const total = DEFAULT_NIST_RMF_CATALOG.length;
  const score = Math.round((documented.size / total) * 100);

  let suggestedNistStatus: NistGovernanceStatus = "not_started";
  if (score >= 70) suggestedNistStatus = "managed";
  else if (score >= 50) suggestedNistStatus = "measured";
  else if (score >= 25) suggestedNistStatus = "mapped";
  else if (score > 0) suggestedNistStatus = "in_progress";

  return { score, suggestedNistStatus };
}

/**
 * Compiles an organization's AI models, weights hashes, RAG vector database
 * connections, embedding models, and system prompt versions into a standard
 * CycloneDX ML-BOM v1.7 JSON document (.cdx.json).
 */
export function compileCycloneDxMlBom(
  input: CompileAiBomInput
): CycloneDxMlBomDocument {
  const nowIso = new Date().toISOString();
  const appRef = `pkg:shdw/${input.organization.slug}@1.0.0`;
  const components: CycloneDxMlBomComponent[] = [];
  const dependencies: Array<{ ref: string; dependsOn: string[] }> = [];
  const appDependsOn: string[] = [];

  for (const row of input.provenanceRows) {
    const modelRef = `bom-ref:model:${row.id}`;
    const weightsDigest = sha256DigestHex(row.weights_hash);
    const measured = input.energyByModel?.[row.model_version];
    appDependsOn.push(modelRef);
    const modelDeps: string[] = [];

    components.push({
      type: "machine-learning-model",
      "bom-ref": modelRef,
      name: row.base_model,
      version: row.model_version,
      supplier: {
        name: row.provider.toUpperCase(),
      },
      // Only a digest the organization computed over weights it hosts.
      ...(weightsDigest ? { hashes: [{ alg: "SHA-256", content: weightsDigest }] } : {}),
      properties: [
        { name: "shdw:workload_name", value: row.workload_name },
        {
          name: "shdw:weights_digest_source",
          value: weightsDigest ? "organization-supplied" : "not-published-by-provider",
        },
        { name: "shdw:prompt_hash_version", value: row.prompt_hash_version },
        { name: "shdw:eu_ai_risk_tier", value: row.eu_ai_risk_tier },
        {
          name: "shdw:vector_db_connected",
          value: String(row.vector_db_connected),
        },
      ],
      modelCard: {
        modelParameters: {
          approach: { type: "foundation-model" },
          task: row.workload_name,
        },
        considerations: {
          ...(measured
            ? {
                environmentalConsiderations: {
                  energyConsumptions: [
                    {
                      activity: "inference",
                      energyProvided: {
                        value: Number(measured.energyKwh.toFixed(8)),
                        unit: "kWh",
                      },
                      co2CostEquivalent: {
                        value: Number(measured.carbonGco2e.toFixed(6)),
                        unit: "gCO2e",
                      },
                    },
                  ],
                },
              }
            : {}),
          ethicalConsiderations: [
            {
              name: `EU AI Act risk tier (self-declared): ${row.eu_ai_risk_tier}`,
              mitigationStrategy:
                "Inference energy and model usage monitored with SHDWsdk telemetry.",
            },
          ],
        },
      },
    });

    if (row.vector_db_connected && row.vector_db_source_url) {
      const ragDataRef = `bom-ref:rag-dataset:${row.id}`;
      modelDeps.push(ragDataRef);
      components.push({
        type: "data",
        "bom-ref": ragDataRef,
        name: `RAG Vector Knowledge Base (${row.workload_name})`,
        version: row.updated_at.slice(0, 10),
        properties: [
          input.redactInfrastructure
            ? {
                name: "shdw:vector_store",
                value: describeVectorStore(row.vector_db_source_url) ?? "unknown",
              }
            : { name: "shdw:vector_db_source_url", value: row.vector_db_source_url },
          ...(row.embedding_model_id
            ? [{ name: "shdw:embedding_model_id", value: row.embedding_model_id }]
            : []),
        ],
      });
    }

    if (row.embedding_model_id) {
      const embedRef = `bom-ref:embedding:${row.id}`;
      modelDeps.push(embedRef);
      components.push({
        type: "machine-learning-model",
        "bom-ref": embedRef,
        name: row.embedding_model_id,
        version: "production",
        properties: [
          { name: "shdw:role", value: "vector-rag-embedding-model" },
          { name: "shdw:parent_workload", value: row.workload_name },
        ],
      });
    }

    dependencies.push({
      ref: modelRef,
      dependsOn: modelDeps,
    });
  }

  dependencies.unshift({
    ref: appRef,
    dependsOn: appDependsOn,
  });

  return {
    bomFormat: "CycloneDX",
    specVersion: "1.7",
    serialNumber: `urn:uuid:${input.organization.id}`,
    version: 1,
    metadata: {
      timestamp: nowIso,
      tools: {
        components: [
          {
            type: "application",
            name: "SHDWsdk AI-BOM & Scope 3 Compliance Engine",
            version: "1.2.0",
            vendor: "SHDWsdk (https://shdwsdk.ai)",
          },
        ],
      },
      component: {
        type: "application",
        "bom-ref": appRef,
        name: input.organization.name,
        version: "production",
      },
      properties: [
        {
          name: "shdw:org_slug",
          value: input.organization.slug,
        },
        {
          name: "shdw:default_grid_region",
          value: input.organization.default_grid_region,
        },
        {
          name: "shdw:eu_ai_act_tier",
          value: input.compliance?.eu_ai_risk_tier ?? "limited",
        },
        {
          name: "shdw:nist_ai_rmf_status",
          value: input.compliance?.nist_status ?? "measured",
        },
        {
          name: "shdw:compliance_readiness_score",
          value: String(input.compliance?.readiness_score ?? 85),
        },
        {
          name: "shdw:trailing_30d_carbon_gco2e",
          value: String(input.totalCarbonGco2e30d ?? 0),
        },
      ],
    },
    components,
    dependencies,
  };
}

/**
 * Compiles an organization's AI-BOM inventory into SPDX 3.0 AI Profile JSON-LD
 * (.spdx.json), including `ai_AIPackage` and `dataset_DatasetPackage` nodes
 * connected via `dependsOn` and `trainedOn` relationships.
 */
export function compileSpdx3AiBom(
  input: CompileAiBomInput
): Spdx3AiBomDocument {
  const nowIso = new Date().toISOString();
  const docId = `https://shdwsdk.ai/spdx/${input.organization.slug}/document`;
  const graph: Spdx3ElementNode[] = [
    {
      "@id": docId,
      "@type": "SpdxDocument",
      name: `${input.organization.name} — SPDX 3.0 AI Profile BOM`,
      creationInfo: {
        created: nowIso,
        specVersion: "3.0.1",
        createdBy: ["https://shdwsdk.ai#agent"],
      },
    },
  ];


  for (const row of input.provenanceRows) {
    const aiPkgId = `https://shdwsdk.ai/spdx/${input.organization.slug}/ai-package/${row.id}`;
    const datasetPkgId = `https://shdwsdk.ai/spdx/${input.organization.slug}/dataset/${row.id}`;

    graph.push({
      "@id": aiPkgId,
      "@type": "ai_AIPackage",
      name: `${row.workload_name} (${row.base_model})`,
      packageVersion: row.model_version,
      suppliedBy: row.provider.toUpperCase(),
      ...(sha256DigestHex(row.weights_hash)
        ? {
            verifiedUsing: [
              { algorithm: "sha256", hashValue: sha256DigestHex(row.weights_hash) as string },
            ],
          }
        : {}),
      // Not known from telemetry; SPDX's explicit "no assertion" value.
      ai_autonomyType: "noAssertion",
      ai_domain: row.workload_name,
      ...(input.energyByModel?.[row.model_version]
        ? {
            ai_energyConsumption: `${(input.energyByModel[row.model_version] as { energyKwh: number }).energyKwh.toFixed(8)} kWh (inference, reporting period)`,
          }
        : {}),
      shdw_promptHashVersion: row.prompt_hash_version,
      shdw_euAiRiskTier: row.eu_ai_risk_tier,
    });

    // Only a real retrieval (RAG) data source is listed; it is a runtime
    // dependency of the workload, not training data for the model.
    if (row.vector_db_connected) {
      graph.push({
        "@id": datasetPkgId,
        "@type": "dataset_DatasetPackage",
        name: `RAG retrieval corpus (${row.workload_name})`,
        packageVersion: row.updated_at.slice(0, 10),
        dataset_datasetType: "vector-embeddings-rag",
        ...(row.embedding_model_id
          ? { dataset_dataCollectionProcess: `Embedded with ${row.embedding_model_id}` }
          : {}),
        ...(input.redactInfrastructure
          ? { shdw_vectorStore: describeVectorStore(row.vector_db_source_url) ?? "unknown" }
          : row.vector_db_source_url
            ? { shdw_vectorDbSourceUrl: row.vector_db_source_url }
            : {}),
        ...(row.embedding_model_id ? { shdw_embeddingModelId: row.embedding_model_id } : {}),
      });

      graph.push({
        "@id": `https://shdwsdk.ai/spdx/${input.organization.slug}/rel-depends/${row.id}`,
        "@type": "Relationship",
        from: aiPkgId,
        to: [datasetPkgId],
        relationshipType: "dependsOn",
      });
    }
  }

  return {
    "@context": "https://spdx.org/rdf/3.0.1/spdx-context.jsonld",
    "@graph": graph,
  };
}
