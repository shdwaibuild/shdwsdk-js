// ============================================================================
// SHDWsdk Automated AI-BOM Static Manifest & CI/CD Scanner (@shdwsdk/sdk/scanner)
// Tree-shakeable zero-dependency scanner that inspects package.json and/or
// requirements.txt to auto-discover AI providers, foundation models, and
// RAG / Vector Database connections for instant AI-BOM population.
// ============================================================================

import { resolveCanonicalWeightsHash } from "./aibom.js";
import type { AIProvider, EuAiRiskTier } from "./database.types.js";

export interface DiscoveredAiBomWorkload {
  workloadName: string;
  provider: AIProvider;
  baseModel: string;
  modelVersion: string;
  /** Only set when you hash weights you host yourself. */
  weightsHash: string | null;
  vectorDbConnected: boolean;
  vectorDbSourceUrl: string | null;
  embeddingModelId: string | null;
  promptHashVersion: string;
  euAiRiskTier: EuAiRiskTier;
  detectedFromDependency: string;
}

export interface ScanManifestInput {
  packageJsonContent?: string;
  requirementsTxtContent?: string;
  workloadPrefix?: string;
}

interface DependencyRule {
  pkgPattern: string;
  workloadName: string;
  provider: AIProvider;
  baseModel: string;
  modelVersion: string;
  defaultRiskTier: EuAiRiskTier;
}

const AI_SDK_RULES: readonly DependencyRule[] = [
  {
    pkgPattern: "@anthropic-ai/sdk",
    workloadName: "Anthropic Claude Service (Auto-Discovered)",
    provider: "anthropic",
    baseModel: "Anthropic Claude 3.7 Sonnet",
    modelVersion: "claude-3-7-sonnet-20250219",
    defaultRiskTier: "limited",
  },
  {
    pkgPattern: "anthropic",
    workloadName: "Python Anthropic Claude Service (Auto-Discovered)",
    provider: "anthropic",
    baseModel: "Anthropic Claude 3.7 Sonnet",
    modelVersion: "claude-3-7-sonnet-20250219",
    defaultRiskTier: "limited",
  },
  {
    pkgPattern: "openai",
    workloadName: "OpenAI GPT-4o Service (Auto-Discovered)",
    provider: "openai",
    baseModel: "OpenAI GPT-4o Omni",
    modelVersion: "gpt-4o-2024-11-20",
    defaultRiskTier: "limited",
  },
  {
    pkgPattern: "@google/generative-ai",
    workloadName: "Google Gemini Service (Auto-Discovered)",
    provider: "gemini",
    baseModel: "Google Gemini 2.5 Pro",
    modelVersion: "gemini-2.5-pro",
    defaultRiskTier: "limited",
  },
  {
    pkgPattern: "google-generativeai",
    workloadName: "Python Google Gemini Service (Auto-Discovered)",
    provider: "gemini",
    baseModel: "Google Gemini 2.5 Pro",
    modelVersion: "gemini-2.5-pro",
    defaultRiskTier: "limited",
  },
  {
    pkgPattern: "@mistralai/mistralai",
    workloadName: "Mistral AI EU Sovereign Workload (Auto-Discovered)",
    provider: "custom",
    baseModel: "Mistral Large 2 (123B — EU Sovereign)",
    modelVersion: "mistral-large-2411",
    defaultRiskTier: "limited",
  },
  {
    pkgPattern: "mistralai",
    workloadName: "Python Mistral AI EU Workload (Auto-Discovered)",
    provider: "custom",
    baseModel: "Mistral Large 2 (123B — EU Sovereign)",
    modelVersion: "mistral-large-2411",
    defaultRiskTier: "limited",
  },
  {
    pkgPattern: "cohere-ai",
    workloadName: "Cohere Enterprise RAG Service (Auto-Discovered)",
    provider: "custom",
    baseModel: "Cohere Command R+ (104B)",
    modelVersion: "command-r-plus-08-2024",
    defaultRiskTier: "limited",
  },
];

const VECTOR_DB_RULES: ReadonlyArray<{
  pkgPattern: string;
  sourceUrl: string;
  embeddingModelId: string;
}> = [
  {
    pkgPattern: "@pinecone-database/pinecone",
    sourceUrl: "https://index.pinecone.io/auto-discovered-rag",
    embeddingModelId: "text-embedding-3-large",
  },
  {
    pkgPattern: "pinecone-client",
    sourceUrl: "https://index.pinecone.io/python-rag-index",
    embeddingModelId: "text-embedding-3-large",
  },
  {
    pkgPattern: "@supabase/supabase-js",
    sourceUrl: "pgvector://supabase.db/public.documents_embedding",
    embeddingModelId: "text-embedding-3-small",
  },
  {
    pkgPattern: "pgvector",
    sourceUrl: "pgvector://postgres.db/embeddings",
    embeddingModelId: "text-embedding-3-large",
  },
  {
    pkgPattern: "weaviate",
    sourceUrl: "https://weaviate.cluster.internal/v1/objects",
    embeddingModelId: "text-embedding-3-large",
  },
  {
    pkgPattern: "@qdrant/js-client-rest",
    sourceUrl: "https://qdrant.cluster.internal:6333/collections/rag",
    embeddingModelId: "text-embedding-3-large",
  },
  {
    pkgPattern: "chromadb",
    sourceUrl: "chroma://localhost:8000/enterprise_collection",
    embeddingModelId: "text-embedding-3-small",
  },
];

function collectManifestPackages(input: ScanManifestInput): Set<string> {
  const foundPackages = new Set<string>();

  if (input.packageJsonContent) {
    try {
      const parsed = JSON.parse(input.packageJsonContent) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      for (const k of Object.keys(parsed.dependencies ?? {})) {
        foundPackages.add(k.toLowerCase());
      }
      for (const k of Object.keys(parsed.devDependencies ?? {})) {
        foundPackages.add(k.toLowerCase());
      }
    } catch {
      // Fallback substring matching if user pastes partial JSON snippet
      const lower = input.packageJsonContent.toLowerCase();
      for (const rule of AI_SDK_RULES) {
        if (lower.includes(rule.pkgPattern)) foundPackages.add(rule.pkgPattern);
      }
      for (const vRule of VECTOR_DB_RULES) {
        if (lower.includes(vRule.pkgPattern)) foundPackages.add(vRule.pkgPattern);
      }
    }
  }

  if (input.requirementsTxtContent) {
    const lines = input.requirementsTxtContent.split(/\r?\n/);
    for (const line of lines) {
      const cleaned = line.split(/[=<>~!#]/)[0]?.trim().toLowerCase();
      if (cleaned) {
        foundPackages.add(cleaned);
      }
    }
  }

  return foundPackages;
}

const VECTOR_VENDOR: Record<string, string> = {
  "@pinecone-database/pinecone": "Pinecone",
  "pinecone-client": "Pinecone",
  pinecone: "Pinecone",
  "@supabase/supabase-js": "Supabase (pgvector)",
  pgvector: "PostgreSQL (pgvector)",
  weaviate: "Weaviate",
  "weaviate-client": "Weaviate",
  "@qdrant/js-client-rest": "Qdrant",
  "qdrant-client": "Qdrant",
  chromadb: "Chroma",
};

export interface ManifestSdkDetection {
  /** AI provider SDKs found. A package says which vendor you use, not which model. */
  providers: Array<{ provider: AIProvider; packageName: string }>;
  /** Vector database clients found (vendor only; endpoints aren't in manifests). */
  vectorStores: Array<{ vendor: string; packageName: string }>;
}

/**
 * Detects AI provider SDKs and vector database clients in a package.json or
 * requirements.txt. Unlike scanProjectManifestForAiBom it doesn't guess model
 * versions, endpoints or prompt hashes — those aren't knowable from a manifest.
 */
export function detectAiSdksInManifest(input: ScanManifestInput): ManifestSdkDetection {
  const found = collectManifestPackages(input);
  const providers: ManifestSdkDetection["providers"] = [];
  const seenProviders = new Set<string>();
  for (const rule of AI_SDK_RULES) {
    if (found.has(rule.pkgPattern) && !seenProviders.has(rule.provider + rule.pkgPattern)) {
      seenProviders.add(rule.provider + rule.pkgPattern);
      providers.push({ provider: rule.provider, packageName: rule.pkgPattern });
    }
  }
  const vectorStores: ManifestSdkDetection["vectorStores"] = [];
  for (const vRule of VECTOR_DB_RULES) {
    if (found.has(vRule.pkgPattern)) {
      vectorStores.push({
        vendor: VECTOR_VENDOR[vRule.pkgPattern] ?? vRule.pkgPattern,
        packageName: vRule.pkgPattern,
      });
    }
  }
  return { providers, vectorStores };
}

/**
 * @deprecated Guesses a model version, vector endpoint and prompt hash for
 * each SDK it finds, which a manifest can't tell you. Use
 * detectAiSdksInManifest() and let the user confirm the models they use.
 */
export function scanProjectManifestForAiBom(
  input: ScanManifestInput
): DiscoveredAiBomWorkload[] {
  const foundPackages = collectManifestPackages(input);

  // Detect connected Vector DB / RAG dependency if any
  let detectedVector: { sourceUrl: string; embeddingModelId: string } | null =
    null;
  for (const vRule of VECTOR_DB_RULES) {
    if (foundPackages.has(vRule.pkgPattern)) {
      detectedVector = {
        sourceUrl: vRule.sourceUrl,
        embeddingModelId: vRule.embeddingModelId,
      };
      break;
    }
  }

  const results: DiscoveredAiBomWorkload[] = [];
  const seenModelVersions = new Set<string>();

  for (const rule of AI_SDK_RULES) {
    if (
      foundPackages.has(rule.pkgPattern) &&
      !seenModelVersions.has(rule.modelVersion)
    ) {
      seenModelVersions.add(rule.modelVersion);
      const prefix = input.workloadPrefix ? `${input.workloadPrefix} — ` : "";
      results.push({
        workloadName: `${prefix}${rule.workloadName}`,
        provider: rule.provider,
        baseModel: rule.baseModel,
        modelVersion: rule.modelVersion,
        weightsHash: resolveCanonicalWeightsHash(rule.modelVersion),
        vectorDbConnected: Boolean(detectedVector),
        vectorDbSourceUrl: detectedVector?.sourceUrl ?? null,
        embeddingModelId: detectedVector?.embeddingModelId ?? null,
        promptHashVersion: `sha256:manifest_scan_${rule.pkgPattern.replace(/[^a-z0-9]/g, "")}`,
        euAiRiskTier: rule.defaultRiskTier,
        detectedFromDependency: rule.pkgPattern,
      });
    }
  }

  return results;
}
