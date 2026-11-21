# @shdwsdk/energy-model

Optional client-side AI inference energy and carbon estimates for [SHDWsdk](https://www.shdwsdk.ai), based on the [EcoLogits](https://ecologits.ai) methodology.

You don't need this package to send telemetry: [`@shdwsdk/sdk`](https://www.npmjs.com/package/@shdwsdk/sdk) reports model IDs and token counts, and SHDWsdk computes energy and carbon on the server with this same model. Install it when you want the numbers locally, for example in a CLI, an internal dashboard or a what-if calculator.

## Install

```bash
npm install @shdwsdk/energy-model
```

## Usage

```ts
import { calculateFootprint, estimateInferenceEnergy } from "@shdwsdk/energy-model";

const f = calculateFootprint({
  modelName: "claude-sonnet-5-5",
  promptTokens: 1200,
  completionTokens: 800,
  gridRegion: "eu-north-1",
});
// f.estimatedEnergyKwh, f.energyKwhRange, f.carbonGco2e, f.carbonGco2eRange, f.modelMatch

const e = estimateInferenceEnergy({ modelName: "gpt-4o", outputTokens: 500 });
// e.energyKwh = { min, max, mid }
```

Also exported: `resolveEnergyModel`, `resolveModelCoefficient`, `MODEL_ENERGY_COEFFICIENTS`, `ENERGY_MODEL_CATALOG`, `ENERGY_METHODOLOGY`, `ECOLOGITS_VERSION`, and (re-exported from `@shdwsdk/sdk`) `GRID_REGION_FACTORS` and `resolveGridRegionFactor`.

## Methodology

Energy is driven by generated (output) tokens, the model's active and total parameter estimates, and the provider's data center PUE, following EcoLogits v0.11.3. Results are ranges because parameter counts for closed models are estimates. Carbon is energy × grid carbon intensity for the region. Full details: [methodology](https://www.shdwsdk.ai/docs/scope3-methodology-eu-regions).

## License

`src/energy-model.generated.ts` is derived from EcoLogits and is licensed under the Mozilla Public License 2.0 (`vendor/ecologits/LICENSE`). All other files are MIT. See [`LICENSE`](./LICENSE).
