#!/usr/bin/env node
// Generates the shared inference energy model from the vendored EcoLogits catalog.
// Writes identical copies to @shdwsdk/energy-model and the Supabase Edge Functions _shared folder.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ECOLOGITS_VERSION = "0.11.3";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const repoRoot = resolve(pkgRoot, "../..");
const catalog = JSON.parse(
  readFileSync(resolve(pkgRoot, "vendor/ecologits/models.json"), "utf8")
);
const retired = JSON.parse(
  readFileSync(resolve(pkgRoot, "vendor/ecologits/retired-models.json"), "utf8")
);
const template = readFileSync(resolve(here, "energy-engine.template.ts"), "utf8");

const PROVIDERS = ["openai", "anthropic", "google_genai", "mistralai", "cohere", "huggingface_hub"];
// EcoLogits PROVIDER_CONFIG_MAP (ecologits/tracers/utils.py) datacenter PUE [min, max]
const PROVIDER_PUE = {
  anthropic: [1.09, 1.14],
  cohere: [1.09, 1.09],
  google_genai: [1.09, 1.09],
  huggingface_hub: [1.09, 1.14],
  mistralai: [1.16, 1.16],
  openai: [1.2, 1.2],
};

const range = (v) =>
  typeof v === "number" ? [v, v] : [Number(v.min), Number(v.max)];

const rows = [];
// Current catalog first so it always wins; retired entries only fill gaps.
for (const m of [...catalog.models, ...retired.models]) {
  if (m.type !== "model") continue;
  const p = PROVIDERS.indexOf(m.provider);
  if (p < 0) continue;
  const params = m.architecture.parameters;
  let active;
  let total;
  if (m.architecture.type === "moe") {
    active = range(params.active);
    total = range(params.total);
  } else {
    active = range(params);
    total = range(params);
  }
  const estimated = (m.warnings ?? []).includes("model-arch-not-released") ? 1 : 0;
  rows.push([
    p,
    m.name,
    active[0],
    active[1],
    total[0],
    total[1],
    m.deployment?.tps ?? null,
    m.deployment?.ttft ?? null,
    estimated,
  ]);
}
const aliases = [...catalog.aliases, ...retired.aliases]
  .filter((a) => PROVIDERS.includes(a.provider))
  .map((a) => [PROVIDERS.indexOf(a.provider), a.name, a.alias]);

const data = `export const ECOLOGITS_VERSION = ${JSON.stringify(ECOLOGITS_VERSION)};

/** [providerIndex, name, activeMinB, activeMaxB, totalMinB, totalMaxB, tps, ttft, architectureEstimated] */
type CatalogRow = [number, string, number, number, number, number, number | null, number | null, number];

const PROVIDERS: readonly string[] = ${JSON.stringify(PROVIDERS)};

const PROVIDER_PUE: Record<string, [number, number]> = ${JSON.stringify(PROVIDER_PUE)};

// prettier-ignore
const CATALOG: readonly CatalogRow[] = [
${rows.map((r) => `  ${JSON.stringify(r)},`).join("\n")}
];

// prettier-ignore
const ALIASES: readonly [number, string, string][] = [
${aliases.map((r) => `  ${JSON.stringify(r)},`).join("\n")}
];`;

const output = template.replace("/* __DATA__ */", data);
for (const target of [
  resolve(pkgRoot, "src/energy-model.generated.ts"),
  resolve(repoRoot, "supabase/functions/_shared/energy-model.generated.ts"),
]) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, output);
  console.log(`wrote ${target} (${rows.length} models, ${aliases.length} aliases)`);
}
