import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_MODEL_WEIGHTS_HASHES,
  DEFAULT_NIST_RMF_CATALOG,
  computeComplianceReadinessScore,
  computeSyncPromptHash,
  computeZeroKnowledgePromptHash,
  describeVectorStore,
  evaluateGovernanceControls,
  resolveCanonicalWeightsHash,
  sha256DigestHex,
} from "../src/index.js";

const NOW = new Date("2026-11-19T12:00:00Z");

describe("AI-BOM integrity", () => {
  it("never invents weight digests for hosted models", () => {
    expect(Object.keys(CANONICAL_MODEL_WEIGHTS_HASHES)).toHaveLength(0);
    for (const m of ["gpt-4o-mini", "claude-sonnet-4-5", "gemini-2.5-pro", "my-model"]) {
      expect(resolveCanonicalWeightsHash(m)).toBeNull();
    }
  });

  it("only accepts real 64-hex SHA-256 digests", () => {
    const real = createHash("sha256").update("weights").digest("hex");
    expect(sha256DigestHex(`sha256:${real}`)).toBe(real);
    expect(sha256DigestHex("sha256:default_system_prompt_v1")).toBeNull();
    expect(sha256DigestHex("sha256:abcd")).toBeNull();
    expect(sha256DigestHex(null)).toBeNull();
  });

  it("produces full SHA-256 prompt digests and labels non-SHA fallbacks honestly", async () => {
    const digest = await computeZeroKnowledgePromptHash("You are a helpful assistant.");
    expect(digest).toBe(
      `sha256:${createHash("sha256").update("You are a helpful assistant.").digest("hex")}`
    );
    expect(computeSyncPromptHash("x").startsWith("fp:")).toBe(true);
    expect(await computeZeroKnowledgePromptHash("  ")).toBe("unversioned");
  });

  it("names vector store vendors without exposing endpoints", () => {
    expect(describeVectorStore("https://enterprise-kb-123.svc.us-west2.pinecone.io")).toBe("Pinecone");
    expect(describeVectorStore("https://abc.supabase.co/rest/v1")).toBe("Supabase (pgvector)");
    expect(describeVectorStore("https://10.0.0.5:6333")).toBe("Self-hosted or other vector store");
    expect(describeVectorStore(null)).toBeNull();
  });
});

describe("NIST AI RMF governance evaluation", () => {
  it("uses real NIST AI RMF subcategory codes", () => {
    for (const c of DEFAULT_NIST_RMF_CATALOG) {
      expect(c.code).toMatch(/^(GOVERN|MAP|MEASURE|MANAGE) \d+\.\d+$/);
    }
    expect(DEFAULT_NIST_RMF_CATALOG.map((c) => c.code)).toContain("MEASURE 2.12");
  });

  it("reports nothing as documented without evidence or attestation", () => {
    const results = evaluateGovernanceControls({
      attestedCodes: [],
      attestedAt: null,
      telemetryEventsInPeriod: 0,
      lastTelemetryAt: null,
      telemetryModels: [],
      inventoryModels: [],
      now: NOW,
    });
    expect(results.every((r) => r.status === "not_documented")).toBe(true);
  });

  it("derives automated evidence from telemetry and inventory", () => {
    const results = evaluateGovernanceControls({
      attestedCodes: [],
      attestedAt: null,
      telemetryEventsInPeriod: 120,
      lastTelemetryAt: "2026-11-18T09:00:00Z",
      telemetryModels: ["gpt-4o"],
      inventoryModels: ["gpt-4o"],
      now: NOW,
    });
    const byCode = Object.fromEntries(results.map((r) => [r.code, r.status]));
    expect(byCode["MEASURE 2.12"]).toBe("evidence");
    expect(byCode["MAP 4.1"]).toBe("evidence");
    expect(byCode["MANAGE 3.1"]).toBe("evidence");
    // Policy controls can't be evidenced by telemetry
    expect(byCode["GOVERN 1.1"]).toBe("not_documented");
  });

  it("flags models missing from the AI-BOM and stale telemetry", () => {
    const results = evaluateGovernanceControls({
      attestedCodes: [],
      attestedAt: null,
      telemetryEventsInPeriod: 5,
      lastTelemetryAt: "2026-11-01T00:00:00Z",
      telemetryModels: ["gpt-4o", "claude-opus-5-5"],
      inventoryModels: ["gpt-4o"],
      now: NOW,
    });
    const map41 = results.find((r) => r.code === "MAP 4.1");
    expect(map41?.status).toBe("not_documented");
    expect(map41?.detail).toContain("claude-opus-5-5");
    expect(results.find((r) => r.code === "MANAGE 3.1")?.status).toBe("not_documented");
  });

  it("shows attested controls as self-attested with a date, normalizing legacy codes", () => {
    const results = evaluateGovernanceControls({
      attestedCodes: ["GV-1.1", "GOVERN 3.2"],
      attestedAt: "2026-11-10T00:00:00Z",
      telemetryEventsInPeriod: 0,
      lastTelemetryAt: null,
      telemetryModels: [],
      inventoryModels: [],
      now: NOW,
    });
    const gov = results.filter((r) => r.functionCategory === "GOVERN");
    expect(gov.map((r) => r.status)).toEqual(["attested", "attested"]);
    expect(gov[0]?.detail).toContain("2026-11-10");
    expect(gov[0]?.detail).toContain("not independently reviewed");
  });

  it("does not let an attestation override contradicting telemetry", () => {
    const results = evaluateGovernanceControls({
      attestedCodes: ["MAP 4.1"],
      attestedAt: "2026-11-10T00:00:00Z",
      telemetryEventsInPeriod: 5,
      lastTelemetryAt: "2026-11-18T00:00:00Z",
      telemetryModels: ["gpt-4o", "gpt-4o-mini"],
      inventoryModels: ["gpt-4o"],
      now: NOW,
    });
    const map41 = results.find((r) => r.code === "MAP 4.1");
    expect(map41?.status).toBe("not_documented");
    expect(map41?.detail).toContain("gpt-4o-mini");
  });

  it("never reports a 'verified' NIST status", () => {
    const all = DEFAULT_NIST_RMF_CATALOG.map((c) => c.code);
    const r = computeComplianceReadinessScore({
      provenanceCount: 5,
      euAiRiskTier: "limited",
      governControls: all,
      mapControls: [],
      measureControls: [],
      manageControls: [],
    });
    expect(r.score).toBe(100);
    expect(r.suggestedNistStatus).not.toBe("verified");
  });
});

describe("manifest detection", () => {
  it("reports SDK vendors without inventing models, endpoints or hashes", async () => {
    const { detectAiSdksInManifest } = await import("../src/index.js");
    const r = detectAiSdksInManifest({
      packageJsonContent: JSON.stringify({
        dependencies: { openai: "^5", "@pinecone-database/pinecone": "^4", react: "^18" },
      }),
    });
    expect(r.providers.map((p) => p.provider)).toEqual(["openai"]);
    expect(r.vectorStores).toEqual([{ vendor: "Pinecone", packageName: "@pinecone-database/pinecone" }]);
    expect(JSON.stringify(r)).not.toMatch(/gpt-|claude-|https?:|sha256/);
  });
});
