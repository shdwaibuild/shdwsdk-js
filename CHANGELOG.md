# Changelog

## @shdwsdk/sdk 2.0.0 · @shdwsdk/energy-model 1.0.0 · @shdwsdk/cli 1.3.0 (2026-11-21)

**@shdwsdk/sdk 2.0.0** is MIT-only with zero dependencies.
- **Breaking:** the client-side energy model moved to the new optional `@shdwsdk/energy-model` package. Removed exports: `calculateFootprint`, `estimateInferenceEnergy`, `resolveEnergyModel`, `resolveModelCoefficient`, `MODEL_ENERGY_COEFFICIENTS`, `ENERGY_MODEL_CATALOG`, `ENERGY_METHODOLOGY`, `ECOLOGITS_VERSION` and their types. Import them from `@shdwsdk/energy-model` instead. `GRID_REGION_FACTORS` and `resolveGridRegionFactor` stay here.
- **Breaking:** telemetry events no longer carry `estimated_energy_kwh*`, `energy_model_match`, `energy_methodology` or `carbon_gco2e`. The ingest server already computed these for every event and ignored the client's values, so dashboards and reports don't change.
- No changes to `wrapOpenAI` / `wrapAnthropic` / `wrapGemini`, `recordUsage`, `observeCall`, context, regions or delivery reports.
- Releases are published from GitHub Actions with npm provenance.

**@shdwsdk/energy-model 1.0.0**: the EcoLogits-based energy and carbon estimates previously bundled in the SDK, unchanged.

**@shdwsdk/cli 1.3.0**: uses `@shdwsdk/sdk` 2 and `@shdwsdk/energy-model`. No changes to commands or generated code.

## @shdwsdk/sdk 1.9.0 (2026-11-21)

- **EU data region.** `region: "eu"` sends telemetry to the Frankfurt deployment (`INGEST_ENDPOINTS` lists both). Use the region shown in Settings → Data.
- **Partner accounts.** `orgSlug` (in `resolveContext` or per call) sends a call to one of your client organizations when you use a partner key.
- **Matters, workflows and traces.** New `resolveContext()` option returns `{ customerRef, matterRef, workflowName, traceId }` from your request context; the same fields work per call in `recordUsage` and `observeCall`. Matters break a customer's usage down further (e.g. a law firm's matter); a trace id totals one multi-step agent run.
- **Hosting.** `defaultHosting` (or `hosting` per call): `vendor_api`, `azure`, `aws_bedrock`, `gcp_vertex`, `self_hosted`, `other`. The model vendor stays in `provider`; the server also detects hosting from provider and model ids.
- **Operations.** `operation`: `chat`, `embedding`, `rerank`, `transcription`, `speech`, `image`, `ocr`, `moderation`, with `audioSeconds` / `imageCount`. Non-chat energy uses a documented FLOP-based estimate.
- `AIProvider` accepts any lowercase vendor id (mistral, cohere, meta, deepseek, ...). New types: `AIHosting`, `AIOperation`, `ShdwCallContext`.

## @shdwsdk/sdk 1.8.0 (2026-11-21)

- **Delivery reports.** The SDK sends its delivery counters (events delivered, dropped by reason, retried, queue backlog) with normal batches about once a minute, or on their own every five minutes when idle and there is something new. They power drop rates in the SHDWsdk developer console. Counters only, never event contents. Opt out with `deliveryReports: false`.
- `getDeliveryStats()` now includes `retried`.
- New exported types: `ShdwDeliveryReport`, `ShdwDropReason`.

## @shdwsdk/sdk 1.7.2 · @shdwsdk/cli 1.2.2 (2026-11-20)

**@shdwsdk/sdk 1.7.2**: packaging only. The npm page now has a README, license and links to this repository. No runtime changes.

**@shdwsdk/cli 1.2.2**:
- The setup wizard's connectivity check and generated code use `https://www.shdwsdk.ai/api/v1/ingest-telemetry` (previously the bare `shdwsdk.ai` host).
- Default model is now `claude-sonnet-5-5` (was `claude-3-7-sonnet`), with current examples in `--help`.
- Generated code keeps the exact model ID you entered instead of replacing it with the catalog pattern it matched.
- The npm page now has a README, license and links to this repository.

## @shdwsdk/sdk 1.7.1

- Grid region is no longer defaulted to `us-east-1`; events without a region use your organization's default region setting.
- Telemetry endpoint: `https://www.shdwsdk.ai/api/v1/ingest-telemetry`.
