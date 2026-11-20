// ============================================================================
// @shdwsdk/cli — Safe Environment File Injection (.env / .env.local)
// Updates or appends SHDW_API_KEY and SHDW_GRID_REGION without overwriting
// unrelated environment variables or existing comments.
// ============================================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export interface EnvInjectionResult {
  filePath: string;
  fileName: string;
  createdNew: boolean;
  updatedKeys: string[];
  appendedKeys: string[];
}

/**
 * Resolves the target environment file in `cwd`.
 * Prefers an existing `.env.local` or `.env`; if neither exists and a Next.js
 * config is detected, defaults to `.env.local`, otherwise `.env`.
 */
export function resolveTargetEnvFile(cwd: string): {
  filePath: string;
  fileName: string;
  exists: boolean;
} {
  const envLocalPath = resolve(cwd, ".env.local");
  if (existsSync(envLocalPath)) {
    return { filePath: envLocalPath, fileName: ".env.local", exists: true };
  }

  const envPath = resolve(cwd, ".env");
  if (existsSync(envPath)) {
    return { filePath: envPath, fileName: ".env", exists: true };
  }

  const isNextProject =
    existsSync(resolve(cwd, "next.config.ts")) ||
    existsSync(resolve(cwd, "next.config.mjs")) ||
    existsSync(resolve(cwd, "next.config.js"));

  const fileName = isNextProject ? ".env.local" : ".env";
  return {
    filePath: resolve(cwd, fileName),
    fileName,
    exists: false,
  };
}

function formatEnvValue(val: string): string {
  // Quote only if value contains spaces, hashes, or quotes
  if (/[\s#"']/.test(val)) {
    return `"${val.replace(/"/g, '\\"')}"`;
  }
  return val;
}

/**
 * Upserts a set of key-value pairs into an `.env`-formatted string while
 * preserving all unrelated variables, comments, and blank lines.
 */
export function upsertEnvContent(
  existingContent: string,
  entries: Readonly<Record<string, string>>
): {
  content: string;
  updatedKeys: string[];
  appendedKeys: string[];
} {
  const eol = existingContent.includes("\r\n") ? "\r\n" : "\n";
  const lines = existingContent.length > 0 ? existingContent.split(/\r?\n/) : [];
  const remaining = new Map<string, string>(Object.entries(entries));
  const updatedKeys: string[] = [];
  const appendedKeys: string[] = [];

  const nextLines = lines.map((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) {
      return line;
    }
    const key = match[1];
    if (!key || !remaining.has(key)) {
      return line;
    }
    const nextValue = remaining.get(key) ?? "";
    remaining.delete(key);
    updatedKeys.push(key);
    const hasExportPrefix = /^\s*export\s+/.test(line);
    return `${hasExportPrefix ? "export " : ""}${key}=${formatEnvValue(nextValue)}`;
  });

  if (remaining.size > 0) {
    // Trim trailing empty lines before appending a clean SHDWsdk block
    while (
      nextLines.length > 0 &&
      nextLines[nextLines.length - 1]?.trim() === ""
    ) {
      nextLines.pop();
    }
    if (nextLines.length > 0) {
      nextLines.push("");
    }
    nextLines.push("# SHDWsdk Scope 3 AI Carbon & AI-BOM Telemetry");
    for (const [key, val] of remaining.entries()) {
      nextLines.push(`${key}=${formatEnvValue(val)}`);
      appendedKeys.push(key);
    }
  }

  return {
    content: nextLines.join(eol) + eol,
    updatedKeys,
    appendedKeys,
  };
}

/**
 * Injects `SHDW_API_KEY` and `SHDW_GRID_REGION` into `.env` or `.env.local`
 * in the target directory without disturbing unrelated variables.
 */
export function injectShdwEnvVariables(params: {
  cwd: string;
  apiKey: string;
  gridRegion: string;
}): EnvInjectionResult {
  const target = resolveTargetEnvFile(params.cwd);
  const existing = target.exists ? readFileSync(target.filePath, "utf8") : "";

  const { content, updatedKeys, appendedKeys } = upsertEnvContent(existing, {
    SHDW_API_KEY: params.apiKey,
    SHDW_GRID_REGION: params.gridRegion,
  });

  writeFileSync(target.filePath, content, "utf8");

  return {
    filePath: target.filePath,
    fileName: target.fileName,
    createdNew: !target.exists,
    updatedKeys,
    appendedKeys,
  };
}
