// ============================================================================
// @shdwsdk/cli — Interactive Setup Wizard (npx @shdwsdk/sdk init / npx shdw-init)
// ============================================================================

import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import { createInterface } from "node:readline/promises";
import { GRID_REGION_FACTORS, resolveGridRegionFactor } from "@shdwsdk/sdk";
import { MODEL_ENERGY_COEFFICIENTS, resolveModelCoefficient } from "@shdwsdk/energy-model";
import { generateShdwBoilerplateFile } from "./codegen.js";
import {
  DEFAULT_SHDW_INGEST_ENDPOINT,
  testShdwConnectivity,
  type ConnectivityTestResult,
} from "./connectivity.js";
import { injectShdwEnvVariables } from "./env.js";

export interface CliWizardOptions {
  cwd?: string;
  apiKey?: string;
  region?: string;
  model?: string;
  outputPath?: string;
  endpoint?: string;
  skipPing?: boolean;
  customFetch?: typeof fetch;
}

export interface CliWizardResult {
  apiKeyPrefix: string;
  gridRegion: string;
  modelPattern: string;
  envFilePath: string;
  boilerplateFilePath: string;
  connectivity: ConnectivityTestResult | null;
}

export function parseCliArgs(argv: readonly string[]): CliWizardOptions & {
  help?: boolean;
} {
  const opts: CliWizardOptions & { help?: boolean } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--skip-ping") {
      opts.skipPing = true;
    } else if (arg === "--api-key" && argv[i + 1]) {
      opts.apiKey = argv[++i];
    } else if (arg === "--region" && argv[i + 1]) {
      opts.region = argv[++i];
    } else if (arg === "--model" && argv[i + 1]) {
      opts.model = argv[++i];
    } else if ((arg === "--out" || arg === "--output") && argv[i + 1]) {
      opts.outputPath = argv[++i];
    } else if (arg === "--endpoint" && argv[i + 1]) {
      opts.endpoint = argv[++i];
    }
  }
  return opts;
}

function printHelp(): void {
  defaultOutput.write(`
SHDWsdk (@shdwsdk/sdk) Interactive Setup Wizard

Usage:
  npx @shdwsdk/sdk init
  npx shdw-init

Options:
  --api-key <key>      SHDW API key (shdw_live_*)
  --region <region>    Primary cloud datacenter region (e.g., us-west-2, eu-north-1)
  --model <pattern>    Primary AI model id (e.g., claude-sonnet-5-5, gpt-6.1-sol, gemini-3.8-flash)
  --out <path>         Boilerplate output path (default: src/lib/shdw.ts)
  --endpoint <url>     Custom telemetry ingest URL (default: ${DEFAULT_SHDW_INGEST_ENDPOINT})
  --skip-ping          Skip the live connectivity validation ping
  -h, --help           Show this help message
`);
}

export async function runInitWizard(
  options: CliWizardOptions = {}
): Promise<CliWizardResult> {
  const cwd = options.cwd ?? process.cwd();
  const regions = Object.values(GRID_REGION_FACTORS);
  const models = [...MODEL_ENERGY_COEFFICIENTS];

  const needsInteractive =
    !options.apiKey || !options.region || !options.model || !options.outputPath;

  const rl = needsInteractive
    ? createInterface({ input: defaultInput, output: defaultOutput })
    : null;

  try {
    if (needsInteractive) {
      defaultOutput.write(
        "\n=== SHDWsdk (@shdwsdk/sdk) Setup Wizard — Scope 3 Carbon & AI-BOM ===\n\n"
      );
    }

    // 1. Prompt for SHDW API Key (shdw_live_*)
    let apiKey = options.apiKey?.trim() ?? "";
    while (!apiKey && rl) {
      const answer = await rl.question(
        "1. Enter your SHDW API key (shdw_live_*): "
      );
      const trimmed = answer.trim();
      if (trimmed.length < 12) {
        defaultOutput.write(
          "   Invalid API key. Please enter a valid key (at least 12 characters, e.g., shdw_live_...).\n"
        );
        continue;
      }
      if (!trimmed.startsWith("shdw_live_") && !trimmed.startsWith("shdw_test_")) {
        defaultOutput.write(
          "   Note: Production keys typically start with 'shdw_live_'. Proceeding with provided key.\n"
        );
      }
      apiKey = trimmed;
    }

    // 2. Select Primary Cloud Data Center Region
    let selectedRegion = options.region?.trim() ?? "";
    if (!selectedRegion && rl) {
      defaultOutput.write(
        "\n2. Select your primary cloud data center region:\n"
      );
      regions.forEach((r, idx) => {
        defaultOutput.write(
          `   [${idx + 1}] ${r.region.padEnd(16)} — ${r.displayName} (${r.intensityGco2PerKwh} gCO2e/kWh)\n`
        );
      });
      const defaultIdx = regions.findIndex((r) => r.region === "us-west-2") + 1;
      const answer = await rl.question(
        `   Choose region number or code [default: ${defaultIdx} (us-west-2)]: `
      );
      const trimmed = answer.trim();
      if (!trimmed) {
        selectedRegion = "us-west-2";
      } else {
        const num = Number(trimmed);
        if (Number.isInteger(num) && num >= 1 && num <= regions.length) {
          selectedRegion = regions[num - 1]?.region ?? "us-west-2";
        } else {
          selectedRegion = resolveGridRegionFactor(trimmed).region;
        }
      }
    }
    const resolvedRegion = resolveGridRegionFactor(
      selectedRegion || "us-west-2"
    );

    // 3. Select Primary AI Model Pattern
    let selectedModel = options.model?.trim() ?? "";
    if (!selectedModel && rl) {
      defaultOutput.write("\n3. Select your primary AI model in production:\n");
      models.forEach((m, idx) => {
        defaultOutput.write(
          `   [${idx + 1}] ${m.modelPattern.padEnd(22)} — ${m.displayName}\n`
        );
      });
      const answer = await rl.question(
        `   Choose model number or id [default: 1 (${models[0]?.modelPattern ?? "claude-sonnet-5-5"})]: `
      );
      const trimmed = answer.trim();
      if (!trimmed) {
        selectedModel = models[0]?.modelPattern ?? "claude-sonnet-5-5";
      } else {
        const num = Number(trimmed);
        if (Number.isInteger(num) && num >= 1 && num <= models.length) {
          selectedModel = models[num - 1]?.modelPattern ?? "claude-sonnet-5-5";
        } else {
          selectedModel = trimmed;
        }
      }
    }
    const resolvedModel = resolveModelCoefficient(
      selectedModel || models[0]?.modelPattern || "claude-sonnet-5-5"
    );
    // Keep the id the user will actually send to their provider; the catalog
    // match is only used to pick provider-specific boilerplate.
    const effectiveModelPattern = selectedModel || resolvedModel.modelPattern;

    // 4. Output Path for Boilerplate File
    let outputPath = options.outputPath?.trim() ?? "";
    if (!outputPath && rl) {
      const answer = await rl.question(
        "\n4. Boilerplate integration file path [default: src/lib/shdw.ts]: "
      );
      outputPath = answer.trim() || "src/lib/shdw.ts";
    }
    if (!outputPath) {
      outputPath = "src/lib/shdw.ts";
    }

    // 5. Environment File Injection (.env / .env.local)
    const envResult = injectShdwEnvVariables({
      cwd,
      apiKey,
      gridRegion: resolvedRegion.region,
    });
    defaultOutput.write(
      `\n[1/3] ${envResult.createdNew ? "Created" : "Updated"} ${envResult.fileName} (${envResult.filePath})\n`
    );

    // 6. Boilerplate Code Generation
    const codeResult = generateShdwBoilerplateFile({
      cwd,
      outputPath,
      modelPattern: effectiveModelPattern,
      gridRegion: resolvedRegion.region,
    });
    defaultOutput.write(
      `[2/3] Generated ${codeResult.providerLabel} integration at ${codeResult.relativePath}\n`
    );

    // 7. Live Connectivity Test (<= 1500ms AbortController timeout)
    let connectivity: ConnectivityTestResult | null = null;
    if (!options.skipPing) {
      defaultOutput.write(
        "[3/3] Testing live connectivity (1500ms timeout guard)...\n"
      );
      connectivity = await testShdwConnectivity({
        apiKey,
        modelPattern: effectiveModelPattern,
        gridRegion: resolvedRegion.region,
        endpoint: options.endpoint,
        timeoutMs: 1500,
        customFetch: options.customFetch,
      });
      defaultOutput.write(
        `      ${connectivity.ok ? "OK:" : "WARN:"} ${connectivity.message}\n`
      );
    }

    defaultOutput.write(
      `\nSetup complete. Import your wrapped AI client from "./${codeResult.relativePath.replace(/\.ts$/, "")}" to begin tracking Scope 3 carbon & AI-BOM lineage.\n\n`
    );

    return {
      apiKeyPrefix: apiKey.slice(0, 14),
      gridRegion: resolvedRegion.region,
      modelPattern: effectiveModelPattern,
      envFilePath: envResult.filePath,
      boilerplateFilePath: codeResult.filePath,
      connectivity,
    };
  } finally {
    rl?.close();
  }
}

export async function runCliFromArgv(argv: readonly string[]): Promise<void> {
  const cleaned = argv[0] === "init" ? argv.slice(1) : argv;
  const parsed = parseCliArgs(cleaned);
  if (parsed.help) {
    printHelp();
    return;
  }
  await runInitWizard(parsed);
}
