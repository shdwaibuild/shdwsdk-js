import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildBoilerplateSource,
  injectShdwEnvVariables,
  runInitWizard,
  testShdwConnectivity,
  upsertEnvContent,
} from "../src/index.js";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "shdw-cli-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("@shdwsdk/cli — Interactive Setup Wizard", () => {
  it("appends SHDW_API_KEY and SHDW_GRID_REGION to .env without overwriting unrelated variables", () => {
    const existing = [
      "# Existing app config",
      "DATABASE_URL=postgres://localhost:5432/app",
      "OPENAI_API_KEY=sk-proj-existing",
      "",
    ].join("\n");

    const { content, updatedKeys, appendedKeys } = upsertEnvContent(existing, {
      SHDW_API_KEY: "shdw_live_test_123456",
      SHDW_GRID_REGION: "eu-north-1",
    });

    expect(updatedKeys).toEqual([]);
    expect(appendedKeys).toEqual(["SHDW_API_KEY", "SHDW_GRID_REGION"]);
    expect(content).toContain("DATABASE_URL=postgres://localhost:5432/app");
    expect(content).toContain("OPENAI_API_KEY=sk-proj-existing");
    expect(content).toContain("SHDW_API_KEY=shdw_live_test_123456");
    expect(content).toContain("SHDW_GRID_REGION=eu-north-1");

    // Re-running updates in-place without duplicating keys
    const secondPass = upsertEnvContent(content, {
      SHDW_API_KEY: "shdw_live_rotated_999",
      SHDW_GRID_REGION: "us-west-2",
    });
    expect(secondPass.updatedKeys).toEqual(["SHDW_API_KEY", "SHDW_GRID_REGION"]);
    expect(secondPass.appendedKeys).toEqual([]);
    expect(secondPass.content).toContain("SHDW_API_KEY=shdw_live_rotated_999");
    expect(secondPass.content).toContain("SHDW_GRID_REGION=us-west-2");
    expect(secondPass.content).toContain("DATABASE_URL=postgres://localhost:5432/app");
  });

  it("prefers .env.local when present and generates provider-specific boilerplate", () => {
    const dir = createTempDir();
    writeFileSync(join(dir, ".env.local"), "NEXT_PUBLIC_APP_NAME=AcmeAI\n", "utf8");

    const envRes = injectShdwEnvVariables({
      cwd: dir,
      apiKey: "shdw_live_abc123def456",
      gridRegion: "eu-west-3",
    });
    expect(envRes.fileName).toBe(".env.local");
    const envBody = readFileSync(join(dir, ".env.local"), "utf8");
    expect(envBody).toContain("NEXT_PUBLIC_APP_NAME=AcmeAI");
    expect(envBody).toContain("SHDW_API_KEY=shdw_live_abc123def456");
    expect(envBody).toContain("SHDW_GRID_REGION=eu-west-3");

    const anthropicCode = buildBoilerplateSource({
      modelPattern: "claude-3-7-sonnet",
      gridRegion: "eu-west-3",
    });
    expect(anthropicCode.providerLabel).toBe("Anthropic");
    expect(anthropicCode.source).toContain("ShdwTelemetryClient");
    expect(anthropicCode.source).toContain("shdw.wrapClient(new Anthropic()");

    const openaiCode = buildBoilerplateSource({
      modelPattern: "gpt-4o",
      gridRegion: "us-west-2",
    });
    expect(openaiCode.providerLabel).toBe("OpenAI");
    expect(openaiCode.source).toContain("shdw.wrapClient(new OpenAI()");

    const geminiCode = buildBoilerplateSource({
      modelPattern: "gemini-2.5-pro",
      gridRegion: "us-east-1",
    });
    expect(geminiCode.providerLabel).toBe("Google Gemini");
    expect(geminiCode.source).toContain("GoogleGenerativeAI");
  });

  it("validates live connectivity with a <= 1500ms AbortController timeout", async () => {
    const okFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ accepted: true }), { status: 202 })
      );

    const okResult = await testShdwConnectivity({
      apiKey: "shdw_live_valid_123456",
      modelPattern: "gpt-4o",
      gridRegion: "us-west-2",
      timeoutMs: 5000, // Should be clamped to <= 1500ms internally
      customFetch: okFetch as unknown as typeof fetch,
    });
    expect(okResult.ok).toBe(true);
    expect(okResult.status).toBe(202);

    const unauthorizedFetch = vi
      .fn()
      .mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    const unauthResult = await testShdwConnectivity({
      apiKey: "shdw_live_bad_key_1234",
      modelPattern: "gpt-4o",
      gridRegion: "us-west-2",
      customFetch: unauthorizedFetch as unknown as typeof fetch,
    });
    expect(unauthResult.ok).toBe(false);
    expect(unauthResult.status).toBe(401);

    const hungFetch = vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        })
    );
    const timeoutResult = await testShdwConnectivity({
      apiKey: "shdw_live_timeout_1234",
      modelPattern: "claude-3-7-sonnet",
      gridRegion: "eu-north-1",
      timeoutMs: 120,
      customFetch: hungFetch as unknown as typeof fetch,
    });
    expect(timeoutResult.ok).toBe(false);
    expect(timeoutResult.status).toBeNull();
    expect(timeoutResult.message).toContain("timed out");
  });

  it("runs the full wizard end-to-end and writes .env, boilerplate, and pings ingest", async () => {
    const dir = createTempDir();
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ accepted: true }), { status: 202 })
      );

    const res = await runInitWizard({
      cwd: dir,
      apiKey: "shdw_live_wizard_e2e_key",
      region: "eu-north-1",
      model: "claude-3-7-sonnet",
      outputPath: "src/lib/ai.ts",
      customFetch: mockFetch as unknown as typeof fetch,
    });

    expect(res.gridRegion).toBe("eu-north-1");
    expect(res.modelPattern).toBe("claude-3-7-sonnet");
    expect(res.connectivity?.ok).toBe(true);
    expect(existsSync(join(dir, ".env"))).toBe(true);
    expect(existsSync(join(dir, "src/lib/ai.ts"))).toBe(true);
  });
});
