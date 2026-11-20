// ============================================================================
// @shdwsdk/cli — Boilerplate Integration Code Generator
// Generates a pre-configured `src/lib/shdw.ts` (or custom path) wired with
// `ShdwTelemetryClient` and `wrapClient` for the user's selected AI model
// provider and cloud datacenter grid region.
// ============================================================================

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  resolveGridRegionFactor,
  resolveModelCoefficient,
} from "@shdwsdk/sdk";

export interface GenerateBoilerplateParams {
  cwd: string;
  outputPath?: string;
  modelPattern: string;
  gridRegion: string;
}

export interface GeneratedBoilerplateResult {
  filePath: string;
  relativePath: string;
  overwroteExisting: boolean;
  providerLabel: string;
}

export function buildBoilerplateSource(params: {
  modelPattern: string;
  gridRegion: string;
}): { source: string; providerLabel: string } {
  const modelCoeff = resolveModelCoefficient(params.modelPattern);
  const gridFactor = resolveGridRegionFactor(params.gridRegion);

  const header = `// ============================================================================
// SHDWsdk Integration (${modelCoeff.displayName})
// Region: ${gridFactor.displayName} (${gridFactor.intensityGco2PerKwh} gCO2e/kWh)
// Strictly non-blocking: <=1500ms AbortController timeout & silent fallback.
// ============================================================================

`;

  if (modelCoeff.provider === "anthropic") {
    return {
      providerLabel: "Anthropic",
      source: `${header}import Anthropic from "@anthropic-ai/sdk";
import { ShdwTelemetryClient } from "@shdwsdk/sdk";

export const shdw = new ShdwTelemetryClient({
  apiKey: process.env.SHDW_API_KEY ?? "",
  endpoint: "https://www.shdwsdk.ai/api/v1/ingest-telemetry",
  defaultGridRegion: process.env.SHDW_GRID_REGION ?? "${gridFactor.region}",
  defaultWorkloadName: "Production Anthropic AI Service",
  timeoutMs: 1500,
});

export const anthropic = shdw.wrapClient(new Anthropic(), {
  provider: "anthropic",
  gridRegion: process.env.SHDW_GRID_REGION ?? "${gridFactor.region}",
  defaultModel: "${params.modelPattern}",
});
`,
    };
  }

  if (modelCoeff.provider === "gemini") {
    return {
      providerLabel: "Google Gemini",
      source: `${header}import { GoogleGenerativeAI } from "@google/generative-ai";
import { ShdwTelemetryClient } from "@shdwsdk/sdk";

export const shdw = new ShdwTelemetryClient({
  apiKey: process.env.SHDW_API_KEY ?? "",
  endpoint: "https://www.shdwsdk.ai/api/v1/ingest-telemetry",
  defaultGridRegion: process.env.SHDW_GRID_REGION ?? "${gridFactor.region}",
  defaultWorkloadName: "Production Google Gemini Service",
  timeoutMs: 1500,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

export const geminiModel = shdw.wrapClient(
  genAI.getGenerativeModel({ model: "${params.modelPattern}" }),
  {
    provider: "gemini",
    gridRegion: process.env.SHDW_GRID_REGION ?? "${gridFactor.region}",
    defaultModel: "${params.modelPattern}",
  }
);
`,
    };
  }

  if (modelCoeff.provider === "openai") {
    return {
      providerLabel: "OpenAI",
      source: `${header}import OpenAI from "openai";
import { ShdwTelemetryClient } from "@shdwsdk/sdk";

export const shdw = new ShdwTelemetryClient({
  apiKey: process.env.SHDW_API_KEY ?? "",
  endpoint: "https://www.shdwsdk.ai/api/v1/ingest-telemetry",
  defaultGridRegion: process.env.SHDW_GRID_REGION ?? "${gridFactor.region}",
  defaultWorkloadName: "Production OpenAI Service",
  timeoutMs: 1500,
});

export const openai = shdw.wrapClient(new OpenAI(), {
  provider: "openai",
  gridRegion: process.env.SHDW_GRID_REGION ?? "${gridFactor.region}",
  defaultModel: "${params.modelPattern}",
});
`,
    };
  }

  // Custom / OpenAI-compatible (Mistral, Llama, DeepSeek, Cohere)
  return {
    providerLabel: modelCoeff.vendorGroup,
    source: `${header}import OpenAI from "openai";
import { ShdwTelemetryClient } from "@shdwsdk/sdk";

export const shdw = new ShdwTelemetryClient({
  apiKey: process.env.SHDW_API_KEY ?? "",
  endpoint: "https://www.shdwsdk.ai/api/v1/ingest-telemetry",
  defaultGridRegion: process.env.SHDW_GRID_REGION ?? "${gridFactor.region}",
  defaultWorkloadName: "Production ${modelCoeff.vendorGroup} Service",
  timeoutMs: 1500,
});

// Works with any OpenAI-compatible client (Mistral, vLLM, DeepSeek, Together, etc.)
export const aiClient = shdw.wrapClient(
  new OpenAI({
    apiKey: process.env.AI_PROVIDER_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  }),
  {
    provider: "custom",
    gridRegion: process.env.SHDW_GRID_REGION ?? "${gridFactor.region}",
    defaultModel: "${params.modelPattern}",
  }
);
`,
  };
}

export function generateShdwBoilerplateFile(
  params: GenerateBoilerplateParams
): GeneratedBoilerplateResult {
  const relativePath = params.outputPath?.trim() || "src/lib/shdw.ts";
  const filePath = resolve(params.cwd, relativePath);
  const overwroteExisting = existsSync(filePath);

  mkdirSync(dirname(filePath), { recursive: true });
  const { source, providerLabel } = buildBoilerplateSource({
    modelPattern: params.modelPattern,
    gridRegion: params.gridRegion,
  });
  writeFileSync(filePath, source, "utf8");

  return {
    filePath,
    relativePath,
    overwroteExisting,
    providerLabel,
  };
}
